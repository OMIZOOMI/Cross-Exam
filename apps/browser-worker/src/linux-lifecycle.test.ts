import { expect, it, vi } from "vitest";
import { LinuxIsolationBackend } from "./linux-backend";

const unit = "crossexam-isolation-test.service";
const group = `/owned.slice/${unit}`;
const active = {
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
const defaults = {
  LoadState: "not-found",
  ActiveState: "inactive",
  MainPID: "0",
  ControlGroup: "",
  MemoryMax: "infinity",
  TasksMax: "19151",
  CPUQuotaPerSecUSec: "infinity",
  ExecMainStatus: "0",
};
const kernel: Record<string, string> = {
  "memory.max": "1073741824",
  "memory.swap.max": "0",
  "pids.max": "128",
  "cpu.max": "100000 100000",
  "cgroup.procs": "4321\n",
};
const print = (record: Record<string, string>) =>
  Object.entries(record)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
const ok = (stdout = "") => ({ exitCode: 0, stdout, timedOut: false });
function harness(
  options: {
    active?: Record<string, string>;
    kernel?: Record<string, string>;
    startupFailure?: boolean;
    startupPending?: boolean;
    startupQueryTimeout?: boolean;
    terminal?: Record<string, string>;
    timeout?: boolean;
    identityChange?: boolean;
    lingering?: boolean;
  } = {},
) {
  const events: string[] = [];
  let started = false;
  let released = false;
  let finished = !!options.startupFailure;
  let activeReads = 0;
  let done: (r: ReturnType<typeof ok>) => void = () => {};
  const completion = new Promise<ReturnType<typeof ok>>((resolve) => {
    done = resolve;
  });
  const start = vi.fn(() => {
    started = true;
    events.push("start");
    if (options.startupFailure) done({ ...ok(""), exitCode: 1 });
    return {
      completion,
      get finished() {
        return finished;
      },
      release: (input: string) => {
        expect(input).toBe('{"fixture":true}\n');
        expect(events).toContain("read:cgroup.procs");
        expect(activeReads).toBeGreaterThanOrEqual(2);
        released = true;
        events.push("release");
        // Simulate an instantaneous successful probe, including immediate unit unload.
        finished = true;
        events.push("complete");
        done({ ...ok('{"status":"passed"}\n'), exitCode: options.timeout ? 1 : 0 });
      },
      terminate: () => {
        finished = true;
        events.push("terminate");
        done({ ...ok(), exitCode: 137 });
      },
    };
  });
  const inspectControlGroup = vi.fn(async (value: string) => {
    events.push(`cleanup:${value}`);
    return options.lingering ? ("populated" as const) : ("empty" as const);
  });
  const execute = vi.fn(async (request: { file: string; args: readonly string[] }) => {
    if (request.file === "/usr/bin/getent")
      return ok("crossexam-worker:x:991:991::/nonexistent:/usr/sbin/nologin");
    if (!started) return ok();
    if (request.args.includes("show")) {
      if (request.args.includes("--property=MemoryMax")) {
        events.push("show-active");
        activeReads++;
        expect(released).toBe(false);
        if (options.startupQueryTimeout) return { ...ok(), timedOut: true };
        if (options.startupPending && activeReads === 1)
          return ok(print({ LoadState: "loaded", ActiveState: "activating", MainPID: "0" }));
        return ok(
          print({
            ...active,
            ...options.active,
            ...(options.identityChange && activeReads > 1 ? { InvocationID: "b".repeat(32) } : {}),
          }),
        );
      }
      if (request.args.includes("--property=Result")) {
        events.push("show-terminal");
        expect(finished).toBe(true);
        return ok(print(options.terminal ?? defaults));
      }
      return ok(
        print({
          ActiveState: "inactive",
          MainPID: "0",
          ControlGroup: "",
          TasksCurrent: "[not set]",
        }),
      );
    }
    if (request.args.includes("kill")) events.push("kill");
    if (request.args.includes("stop")) events.push("stop");
    return ok();
  });
  const readCgroupFile = vi.fn(async (file: string) => {
    expect(started).toBe(true);
    expect(released).toBe(false);
    expect(finished).toBe(false);
    const name = file.split("/").at(-1) ?? "";
    events.push(`read:${name}`);
    const value = { ...kernel, ...options.kernel }[name];
    if (value === undefined) throw new Error("missing");
    return value;
  });
  const backend = new LinuxIsolationBackend(
    {
      runtimeDirectory: "/var/lib/crossexam/runtime",
      browserDirectory: "/var/lib/crossexam/browser",
      socketDirectory: "/run/crossexam",
      nodeExecutable: "/opt/crossexam-runtime/node",
    },
    {
      platform: "linux",
      execute,
      start,
      readCgroupFile,
      validateEnvironment: async () => null,
      inspectControlGroup,
      uuid: () => "test",
      pause: async () => {
        if (options.active?.ActiveState === "inactive") {
          finished = true;
          done({ ...ok(), exitCode: 1 });
        }
      },
    },
  );
  return { backend, events, start, readCgroupFile, inspectControlGroup };
}
it("verifies ACTIVE kernel limits before release/completion, retaining proof when a fast-success unit unloads", async () => {
  const h = harness();
  const result = await h.backend.run("network", { fixture: true });
  expect(h.events.indexOf("read:cgroup.procs")).toBeLessThan(h.events.indexOf("release"));
  expect(h.events.indexOf("release")).toBeLessThan(h.events.indexOf("complete"));
  expect(result.active.properties).toEqual(active);
  expect(result.active.cgroup.controlGroup).toBe(group);
  expect(result.active.cgroup.pidMember).toBe(true);
  expect(result.properties.MemoryMax).toBe("infinity"); // terminal defaults are diagnostic only
  expect(result.exitCode).toBe(0);
  expect(h.inspectControlGroup).toHaveBeenCalledWith(group);
  expect(result.cleanup.capturedCgroup).toBe(group);
  expect(result.cleaned).toBe(true);
});
it.each<Record<string, string>>([{ ControlGroup: "" }, { MainPID: "0" }, defaults])(
  "never releases a probe with invalid active properties %j",
  async (properties) => {
    const h = harness({ active: properties });
    await expect(h.backend.run("network", { fixture: true })).rejects.toThrow();
    expect(h.events).not.toContain("release");
    expect(h.events).toContain("kill");
    expect(h.events).toContain("stop");
  },
);
it("rejects changed invocation identity between kernel verification and release", async () => {
  const h = harness({ identityChange: true });
  await expect(h.backend.run("network", { fixture: true })).rejects.toThrow();
  expect(h.events).not.toContain("release");
});
it("waits through activation without releasing input or inspecting a guessed cgroup", async () => {
  const h = harness({ startupPending: true });
  const result = await h.backend.run("network", { fixture: true });
  expect(h.events.slice(0, 3)).toEqual(["start", "show-active", "show-active"]);
  expect(result.active.cgroup.controlGroup).toBe(group);
  expect(result.cleaned).toBe(true);
});
it("fails closed and stops the service when its startup query times out", async () => {
  const h = harness({ startupQueryTimeout: true });
  await expect(h.backend.run("network", { fixture: true })).rejects.toThrow("startup deadline");
  expect(h.events).not.toContain("release");
  expect(h.events).toContain("stop");
  expect(h.events).toContain("terminate");
  expect(h.readCgroupFile).not.toHaveBeenCalled();
});
it("kernel mismatch stops and cleans the observed cgroup before any operation executes", async () => {
  const h = harness({ kernel: { "memory.max": "max" } });
  await expect(h.backend.run("network", { fixture: true })).rejects.toThrow();
  expect(h.events).not.toContain("release");
  expect(h.inspectControlGroup).toHaveBeenCalledWith(group);
});
it("startup failure attempts unit cleanup without inventing a cgroup path", async () => {
  const h = harness({ startupFailure: true });
  await expect(h.backend.run("network", { fixture: true })).rejects.toThrow();
  expect(h.events).toContain("kill");
  expect(h.events).toContain("stop");
  expect(h.events).not.toContain("release");
  expect(h.inspectControlGroup).not.toHaveBeenCalled();
});
it("retains a genuine terminal timeout and kills/cleans the entire captured cgroup", async () => {
  const h = harness({
    timeout: true,
    terminal: {
      LoadState: "loaded",
      ActiveState: "failed",
      InvocationID: active.InvocationID,
      Result: "timeout",
      ExecMainStatus: "9",
      ExecMainCode: "2",
      MainPID: "0",
      ControlGroup: "",
    },
  });
  const result = await h.backend.run("timeout", { fixture: true });
  expect(result.timedOut).toBe(true);
  expect(result.exitCode).not.toBe(0);
  expect(result.cleaned).toBe(true);
  expect(h.events).toContain("kill");
  expect(h.inspectControlGroup).toHaveBeenCalledWith(group);
});
it("never claims cleanup if descendants remain", async () => {
  const h = harness({ lingering: true });
  expect((await h.backend.run("network", { fixture: true })).cleaned).toBe(false);
});
