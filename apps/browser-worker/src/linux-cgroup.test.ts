import { describe, expect, it, vi } from "vitest";
import { verifyActiveCgroup } from "./linux-cgroup";

const unit = "crossexam-isolation-test.service";
const group = `/custom.slice/${unit}`;
const properties = {
  LoadState: "loaded",
  ActiveState: "active",
  MainPID: "4321",
  ControlGroup: group,
  InvocationID: "a".repeat(32),
  MemoryMax: "1073741824",
  MemorySwapMax: "0",
  TasksMax: "128",
  CPUQuotaPerSecUSec: "1s",
};
const values: Record<string, string> = {
  "memory.max": "1073741824\n",
  "memory.swap.max": "0\n",
  "pids.max": "128\n",
  "cpu.max": "100000 100000\n",
  "cgroup.procs": "4321\n4322\n",
};
function reader(overrides: Record<string, string> = {}) {
  return vi.fn(async (file: string) => {
    expect(file.startsWith(`/sys/fs/cgroup${group}/`)).toBe(true);
    const name = file.split("/").at(-1) ?? "";
    const value = { ...values, ...overrides }[name];
    if (value === undefined) throw new Error("missing file");
    return value;
  });
}

describe("active cgroup kernel verification", () => {
  it.each(["100000 100000", "10000 10000", "1000000 1000000"])(
    "accepts a finite one-CPU quota %s",
    async (cpu) => {
      const read = reader({ "cpu.max": cpu });
      const evidence = await verifyActiveCgroup(properties, unit, read);
      expect(evidence).toMatchObject({
        controlGroup: group,
        mainPID: 4321,
        pidMember: true,
        values: {
          "memory.max": "1073741824",
          "memory.swap.max": "0",
          "pids.max": "128",
          "cpu.max": cpu,
        },
      });
      expect(read.mock.calls.map(([file]) => file.split("/").at(-1)).sort()).toEqual(
        Object.keys(values).sort(),
      );
    },
  );
  it.each([
    ["ControlGroup", ""],
    ["ControlGroup", "/"],
    ["ControlGroup", "/custom.slice/../escape"],
    ["ControlGroup", `/custom.slice/./${unit}`],
    ["ControlGroup", `/custom.slice//${unit}`],
    ["ControlGroup", `/custom.slice/${unit}/`],
    ["ControlGroup", "/custom.slice/other.service"],
    ["ControlGroup", `/custom.slice/\\${unit}`],
    ["ControlGroup", `/custom.slice/%2e%2e/${unit}`],
    ["MainPID", "0"],
    ["MainPID", "-1"],
    ["MainPID", "4321x"],
    ["MainPID", "9007199254740993"],
    ["LoadState", "not-found"],
    ["ActiveState", "inactive"],
    ["InvocationID", ""],
    ["MemoryMax", "infinity"],
    ["TasksMax", "19151"],
    ["CPUQuotaPerSecUSec", "infinity"],
  ])(
    "rejects ambiguous active identity/configuration %s=%s before reading files",
    async (key, value) => {
      const read = reader();
      await expect(
        verifyActiveCgroup({ ...properties, [key]: value }, unit, read),
      ).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["memory.max", "max"],
    ["memory.max", "1073741825"],
    ["memory.max", "nope"],
    ["memory.swap.max", "1"],
    ["memory.swap.max", "max"],
    ["pids.max", "129"],
    ["pids.max", "max"],
    ["cpu.max", "max 100000"],
    ["cpu.max", "200000 100000"],
    ["cpu.max", "50000 100000"],
    ["cpu.max", "0 0"],
    ["cpu.max", "100000"],
    ["cpu.max", "1e5 1e5"],
    ["cpu.max", "100000 100000 extra"],
    ["cpu.max", "100000\n100000"],
    ["cgroup.procs", "1234\n"],
    ["cgroup.procs", ""],
    ["cgroup.procs", "4321\nmalformed\n"],
  ])("rejects incorrect kernel value %s=%s", async (name, value) => {
    await expect(verifyActiveCgroup(properties, unit, reader({ [name]: value }))).rejects.toThrow();
  });
  it("fails closed on missing/unreadable kernel files and retains bounded partial evidence", async () => {
    const read = reader();
    read.mockImplementationOnce(async () => {
      throw new Error("ENOENT");
    });
    await expect(verifyActiveCgroup(properties, unit, read)).rejects.toMatchObject({
      values: expect.objectContaining({ "memory.max": null, "pids.max": "128" }),
    });
  });
});
