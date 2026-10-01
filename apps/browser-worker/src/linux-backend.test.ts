import { describe, expect, it, vi } from "vitest";
import { LinuxIsolationBackend, type LinuxIsolationOptions, type ProbeMode } from "./linux-backend";

type Request = Parameters<
  NonNullable<ConstructorParameters<typeof LinuxIsolationBackend>[1]>["execute"]
>[0];
type Result = Awaited<
  ReturnType<NonNullable<ConstructorParameters<typeof LinuxIsolationBackend>[1]>["execute"]>
>;

const options: LinuxIsolationOptions = {
  runtimeDirectory: "/var/lib/crossexam/runtime",
  browserDirectory: "/var/lib/crossexam/browser",
  socketDirectory: "/run/crossexam",
  nodeExecutable: "/usr/bin/node",
};

const initialProperties = [
  "Result=success",
  "MemoryMax=1073741824",
  "TasksMax=128",
  "CPUQuotaPerSecUSec=1s",
  "ControlGroup=/system.slice/crossexam-isolation-test.service",
  "MainPID=0",
  "ExecMainStatus=7",
  "",
].join("\n");

const cleanupProperties = [
  "ActiveState=inactive",
  "SubState=dead",
  "ControlGroup=/system.slice/crossexam-isolation-test.service",
  "MainPID=0",
  "TasksCurrent=0",
  "",
].join("\n");

function success(stdout = ""): Result {
  return { exitCode: 0, stdout, timedOut: false };
}

function dependencies(
  execute: (request: Request) => Promise<Result>,
  overrides: Partial<ConstructorParameters<typeof LinuxIsolationBackend>[1]> = {},
): ConstructorParameters<typeof LinuxIsolationBackend>[1] {
  return {
    platform: "linux",
    execute,
    validateEnvironment: async () => null,
    verifyControlGroupEmpty: async () => true,
    uuid: () => "test",
    ...overrides,
  };
}

function successfulExecutor(requests: Request[]): (request: Request) => Promise<Result> {
  return async (request) => {
    requests.push(request);
    if (request.file === "/usr/bin/getent") {
      return success("crossexam-worker:x:991:991::/nonexistent:/usr/sbin/nologin\n");
    }
    if (request.args.includes("show")) {
      return success(
        request.args.includes("--property=Result") ? initialProperties : cleanupProperties,
      );
    }
    if (request.args.includes("/usr/bin/systemd-run") && request.args.includes("--pipe")) {
      return success("probe output\n");
    }
    return success();
  };
}

describe("LinuxIsolationBackend detection", () => {
  it("rejects non-Linux hosts before executing commands", async () => {
    const execute = vi.fn(async () => success());
    const backend = new LinuxIsolationBackend(
      options,
      dependencies(execute, { platform: "darwin" }),
    );

    await expect(backend.detect()).resolves.toEqual({
      available: false,
      reason: "platform-not-linux",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports stable environment and tool failures", async () => {
    const invalidPaths = new LinuxIsolationBackend(
      options,
      dependencies(async () => success(), {
        validateEnvironment: async () => "invalid-trusted-paths",
      }),
    );
    await expect(invalidPaths.detect()).resolves.toEqual({
      available: false,
      reason: "invalid-trusted-paths",
    });

    const missingBwrap = new LinuxIsolationBackend(
      options,
      dependencies(async (request) =>
        request.file === "/usr/bin/bwrap" ? { ...success(), exitCode: 127 } : success(),
      ),
    );
    await expect(missingBwrap.detect()).resolves.toEqual({
      available: false,
      reason: "bwrap-unavailable",
    });
  });

  it("requires a real non-root dedicated user record", async () => {
    const backend = new LinuxIsolationBackend(
      options,
      dependencies(async (request) =>
        request.file === "/usr/bin/getent"
          ? success("crossexam-worker:x:0:0::/root:/bin/sh\n")
          : success(),
      ),
    );

    await expect(backend.detect()).resolves.toEqual({
      available: false,
      reason: "worker-user-unavailable",
    });
  });

  it("detects the complete provisioned boundary", async () => {
    const requests: Request[] = [];
    const backend = new LinuxIsolationBackend(options, dependencies(successfulExecutor(requests)));

    await expect(backend.detect()).resolves.toEqual({ available: true, reason: "available" });
    expect(requests.map(({ file }) => file)).toEqual([
      "/usr/bin/bwrap",
      "/usr/bin/systemctl",
      "/usr/bin/sudo",
      "/usr/bin/sudo",
      "/usr/bin/getent",
    ]);
  });

  it("fails run closed with the stable isolation code", async () => {
    const backend = new LinuxIsolationBackend(
      options,
      dependencies(async () => success(), {
        validateEnvironment: async () => "cgroups-v2-unavailable",
      }),
    );

    await expect(backend.run("network", {})).rejects.toMatchObject({
      name: "BrowserIsolationUnavailableError",
      code: "ISOLATION_UNAVAILABLE",
    });
  });
});

describe("LinuxIsolationBackend service command", () => {
  it("uses fixed limits, namespaces, readonly allowlisted mounts, and JSON stdin", async () => {
    const requests: Request[] = [];
    const backend = new LinuxIsolationBackend(options, dependencies(successfulExecutor(requests)));

    const result = await backend.run("network", { fixture: "public.test", count: 2 });
    const launch = requests.find(
      (request) => request.args.includes("/usr/bin/systemd-run") && request.args.includes("--pipe"),
    );
    expect(launch).toBeDefined();
    expect(launch?.file).toBe("/usr/bin/sudo");
    expect(launch?.input).toBe('{"fixture":"public.test","count":2}\n');
    expect(launch?.args).toEqual(
      expect.arrayContaining([
        "-n",
        "--property=User=crossexam-worker",
        "--property=KillMode=control-group",
        "--property=MemoryMax=1073741824",
        "--property=MemorySwapMax=0",
        "--property=OOMPolicy=kill",
        "--property=TasksMax=128",
        "--property=CPUQuota=100%",
        "--property=RuntimeMaxSec=45s",
        "--property=LimitNOFILE=1024",
        "--property=NoNewPrivileges=yes",
        "--property=PrivateNetwork=yes",
        "--service-type=exec",
        "--unshare-user",
        "--unshare-pid",
        "--unshare-net",
        "--unshare-ipc",
        "--unshare-uts",
        "--cap-drop",
        "ALL",
        "--new-session",
        "--die-with-parent",
        "/runtime/node",
        "/app/probe.cjs",
        "network",
      ]),
    );

    const args = launch?.args ?? [];
    const readonlyPairs: string[][] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === "--ro-bind" || args[index] === "--ro-bind-try") {
        const source = args[index + 1];
        const target = args[index + 2];
        if (source !== undefined && target !== undefined) readonlyPairs.push([source, target]);
      }
    }
    expect(readonlyPairs).toEqual([
      ["/usr", "/usr"],
      ["/lib", "/lib"],
      ["/lib64", "/lib64"],
      ["/bin", "/bin"],
      [options.runtimeDirectory, "/app"],
      [options.browserDirectory, "/browser"],
      [options.socketDirectory, "/run/crossexam"],
      [options.nodeExecutable, "/runtime/node"],
      [`${options.runtimeDirectory}/resolv.conf`, "/etc/resolv.conf"],
      [`${options.runtimeDirectory}/hosts`, "/etc/hosts"],
    ]);
    expect(args.join(" ")).not.toContain("public.test");
    expect(args).not.toContain(process.cwd());
    expect(result).toMatchObject({
      unit: "crossexam-isolation-test.service",
      exitCode: 7,
      stdout: "probe output\n",
      timedOut: false,
      cleaned: true,
    });
    expect(result.properties).toMatchObject({ MemoryMax: "1073741824", TasksMax: "128" });
  });

  it.each<ProbeMode>([
    "network",
    "filesystem",
    "pids",
    "memory",
    "timeout",
    "browser",
    "tls",
    "proxy-down",
  ])("accepts only the fixed %s probe", async (mode) => {
    const requests: Request[] = [];
    const backend = new LinuxIsolationBackend(options, dependencies(successfulExecutor(requests)));
    await backend.run(mode, {});
    const launch = requests.find((request) => request.args.includes("--pipe"));
    expect(launch?.args.at(-1)).toBe(mode);
  });

  it("rejects arbitrary modes and non-JSON or oversized input before detection", async () => {
    const execute = vi.fn(async () => success());
    const backend = new LinuxIsolationBackend(options, dependencies(execute));

    await expect(backend.run("shell" as ProbeMode, {})).rejects.toThrow(
      "Unsupported isolation probe mode",
    );
    await expect(backend.run("network", { callback: () => undefined })).rejects.toThrow(
      "only JSON values",
    );
    await expect(backend.run("network", { value: "x".repeat(65_536) })).rejects.toThrow(
      "exceeds 64 KiB",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("bounds returned output and reports systemd runtime timeouts", async () => {
    const requests: Request[] = [];
    const execute = successfulExecutor(requests);
    const backend = new LinuxIsolationBackend(
      options,
      dependencies(async (request) => {
        if (request.args.includes("--pipe")) {
          return success("x".repeat(70_000));
        }
        if (request.args.includes("show") && request.args.includes("--property=Result")) {
          return success(initialProperties.replace("Result=success", "Result=timeout"));
        }
        return execute(request);
      }),
    );

    const result = await backend.run("timeout", {});
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(65_536);
    expect(result.timedOut).toBe(true);
  });
});

describe("LinuxIsolationBackend cleanup", () => {
  it("kills the whole cgroup, stops, verifies, then resets the unit", async () => {
    const requests: Request[] = [];
    const backend = new LinuxIsolationBackend(options, dependencies(successfulExecutor(requests)));
    const result = await backend.run("pids", {});

    const systemctlActions = requests
      .filter((request) => request.args.includes("/usr/bin/systemctl"))
      .flatMap((request) =>
        request.args.filter((arg) => ["kill", "stop", "show", "reset-failed"].includes(arg)),
      );
    expect(systemctlActions.slice(-4)).toEqual(["kill", "stop", "show", "reset-failed"]);
    expect(requests.some((request) => request.args.includes("--kill-who=all"))).toBe(true);
    expect(result.cleaned).toBe(true);
  });

  it("does not claim cleanup when processes remain or verification fails", async () => {
    const requests: Request[] = [];
    const backend = new LinuxIsolationBackend(
      options,
      dependencies(successfulExecutor(requests), {
        verifyControlGroupEmpty: async () => false,
      }),
    );

    await expect(backend.run("pids", {})).resolves.toMatchObject({ cleaned: false });
    expect(requests.some((request) => request.args.includes("reset-failed"))).toBe(true);
  });

  it("attempts cleanup even when required service properties cannot be verified", async () => {
    const requests: Request[] = [];
    const ordinary = successfulExecutor(requests);
    const backend = new LinuxIsolationBackend(
      options,
      dependencies(async (request) => {
        if (request.args.includes("show") && request.args.includes("--property=Result")) {
          requests.push(request);
          return { exitCode: 1, stdout: "", timedOut: false };
        }
        return ordinary(request);
      }),
    );

    await expect(backend.run("filesystem", {})).rejects.toThrow(
      "Unable to inspect the transient isolation service",
    );
    expect(requests.some((request) => request.args.includes("kill"))).toBe(true);
    expect(requests.some((request) => request.args.includes("stop"))).toBe(true);
    expect(requests.some((request) => request.args.includes("reset-failed"))).toBe(true);
  });
});
