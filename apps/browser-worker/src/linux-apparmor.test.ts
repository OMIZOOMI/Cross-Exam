import { describe, expect, it, vi } from "vitest";
import {
  type AppArmorDependencies,
  type AppArmorFile,
  assertAppArmorEnvironmentAndProfile,
  CHROMIUM_APPARMOR,
  installChromiumAppArmorProfile,
  removeChromiumAppArmorProfile,
  renderChromiumAppArmorProfile,
  validateChromiumAppArmorExecutable,
  validateChromiumAppArmorProfile,
} from "./linux-apparmor";
import { ROOT_MANIFEST_NAME } from "./linux-root-layout";

const executable = `${CHROMIUM_APPARMOR.root}${CHROMIUM_APPARMOR.executable}`;
const core = `${CHROMIUM_APPARMOR.root}/app/node_modules/playwright-core`;
const profiles = "/sys/kernel/security/apparmor/profiles";
const restricted = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";
const enabled = "/sys/module/apparmor/parameters/enabled";
const manifest = `${CHROMIUM_APPARMOR.root}/${ROOT_MANIFEST_NAME}`;
const asset: AppArmorFile = { kind: "file", uid: 0, gid: 0, mode: 0o555 };

function fixture() {
  const files = new Map<string, AppArmorFile>([
    [executable, { ...asset }],
    [`${core}/package.json`, { ...asset, mode: 0o444 }],
    [`${core}/browsers.json`, { ...asset, mode: 0o444 }],
  ]);
  const contents = new Map<string, string>([
    [profiles, "unrelated-profile (enforce)\n"],
    [restricted, "1\n"],
    [enabled, "Y\n"],
    [`${core}/package.json`, JSON.stringify({ version: "1.63.0" })],
    [
      `${core}/browsers.json`,
      JSON.stringify({
        browsers: [
          { name: "chromium-headless-shell", revision: "1243", browserVersion: "153.0.8010.12" },
        ],
      }),
    ],
    [
      manifest,
      JSON.stringify({
        entries: {
          [CHROMIUM_APPARMOR.executable.slice(1)]: {
            kind: "file",
            mode: 0o555,
            digest: "a".repeat(64),
          },
        },
      }),
    ],
  ]);
  const dependencies: AppArmorDependencies = {
    privilegedLinux: vi.fn(() => true),
    inspect: vi.fn(async (file: string): Promise<AppArmorFile | undefined> => {
      if (file === CHROMIUM_APPARMOR.policyFile) return files.get(file);
      return files.get(file) ?? { kind: "directory", uid: 0, gid: 0, mode: 0o755 };
    }),
    read: vi.fn(async (file) => {
      const value = contents.get(file);
      if (value === undefined) throw new Error(`unexpected test read: ${file}`);
      return value;
    }),
    validateRoot: vi.fn(async () => {}),
    writeExclusive: vi.fn(async (value) => {
      if (files.has(CHROMIUM_APPARMOR.policyFile)) throw new Error("EEXIST");
      contents.set(CHROMIUM_APPARMOR.policyFile, value);
      files.set(CHROMIUM_APPARMOR.policyFile, { ...asset, mode: 0o444 });
    }),
    removeFile: vi.fn(async () => {
      files.delete(CHROMIUM_APPARMOR.policyFile);
      contents.delete(CHROMIUM_APPARMOR.policyFile);
    }),
    execute: vi.fn(async (args) => {
      if (args.includes("--replace"))
        contents.set(profiles, `${CHROMIUM_APPARMOR.profile} (unconfined)\n`);
      if (args.includes("--remove")) contents.set(profiles, "unrelated-profile (enforce)\n");
    }),
  };
  return { dependencies, files, contents };
}

describe("one-executable Chromium AppArmor policy", () => {
  it("renders only the exact immutable executable and one userns allowance", () => {
    const policy = renderChromiumAppArmorProfile();
    expect(policy).toContain(
      `profile ${CHROMIUM_APPARMOR.profile} ${CHROMIUM_APPARMOR.executable} flags=(unconfined)`,
    );
    expect(policy).toContain("  userns,\n");
    expect(policy).not.toMatch(/\*|capability|sysctl|--no-sandbox|chromiumSandbox/u);
    expect(() => validateChromiumAppArmorProfile(policy)).not.toThrow();
  });
  it.each([
    "/browser/**",
    "/home/*/chrome",
    "/var/lib/crossexam/root/browser/**",
    "/browser/other-chrome",
    "/browser/chromium_headless_shell-1244/chrome-headless-shell-linux64/chrome-headless-shell",
    "/browser/../chrome",
  ])("rejects modified or broad executable attachment %s", (attachment) => {
    expect(() =>
      validateChromiumAppArmorProfile(
        renderChromiumAppArmorProfile().replace(CHROMIUM_APPARMOR.attachment, attachment),
      ),
    ).toThrow(/unexpected/u);
  });
  it.each([
    "capability sys_admin,",
    "userns,\n  /browser/** rw,",
    "userns,\n}\nprofile broad /** flags=(unconfined) { userns,",
    "",
  ])("rejects altered profile rules %s", (rule) => {
    expect(() =>
      validateChromiumAppArmorProfile(renderChromiumAppArmorProfile().replace("userns,", rule)),
    ).toThrow();
  });
});

describe("sealed executable linkage", () => {
  it("validates the existing sealed root before checking artifact identity", async () => {
    const { dependencies } = fixture();
    const result = await validateChromiumAppArmorExecutable(dependencies);
    expect(dependencies.validateRoot).toHaveBeenCalledWith(CHROMIUM_APPARMOR.root, 0);
    expect(result).toMatchObject({ revision: "1243", uid: 0, gid: 0, mode: 0o555 });
    expect(result.sha256).toBe("a".repeat(64));
  });
  it("fails closed when sealed-root hash validation fails", async () => {
    const { dependencies } = fixture();
    dependencies.validateRoot = vi.fn(async () => {
      throw new Error("prepared root changed");
    });
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(
      "prepared root changed",
    );
    expect(dependencies.writeExclusive).not.toHaveBeenCalled();
    expect(dependencies.execute).not.toHaveBeenCalled();
  });
  it.each([
    { kind: "symlink" },
    { kind: "directory" },
    { kind: "other" },
    { uid: 991 },
    { gid: 991 },
    { mode: 0o755 },
    { mode: 0o575 },
    { mode: 0o557 },
    { mode: 0o4555 },
    { mode: 0o2555 },
    { mode: 0o444 },
  ] as Partial<AppArmorFile>[])("rejects unsafe executable metadata %j", async (patch) => {
    const { dependencies, files } = fixture();
    files.set(executable, { ...asset, ...patch });
    await expect(validateChromiumAppArmorExecutable(dependencies)).rejects.toThrow(/asset/u);
  });
  it.each([
    { kind: "symlink" },
    { uid: 991 },
    { gid: 991 },
    { mode: 0o775 },
    { mode: 0o777 },
  ] as Partial<AppArmorFile>[])("rejects unsafe executable parents %j", async (patch) => {
    const { dependencies, files } = fixture();
    files.set(`${CHROMIUM_APPARMOR.root}/browser`, {
      kind: "directory",
      uid: 0,
      gid: 0,
      mode: 0o755,
      ...patch,
    });
    await expect(validateChromiumAppArmorExecutable(dependencies)).rejects.toThrow(/parent/u);
  });
  it.each([
    { name: "chromium-headless-shell", revision: "1244", browserVersion: "153.0.8010.12" },
    { name: "chromium-headless-shell", revision: "1243", browserVersion: "153.0.8010.13" },
    { name: "chromium", revision: "1243", browserVersion: "153.0.8010.12" },
  ])("rejects mismatched browser artifact %j", async (browser) => {
    const { dependencies, contents } = fixture();
    contents.set(`${core}/browsers.json`, JSON.stringify({ browsers: [browser] }));
    await expect(validateChromiumAppArmorExecutable(dependencies)).rejects.toThrow(/version/u);
  });
  it("rejects duplicate headless-shell definitions", async () => {
    const { dependencies, contents } = fixture();
    const data = JSON.parse(contents.get(`${core}/browsers.json`) as string);
    data.browsers.push(data.browsers[0]);
    contents.set(`${core}/browsers.json`, JSON.stringify(data));
    await expect(validateChromiumAppArmorExecutable(dependencies)).rejects.toThrow(/version/u);
  });
  it("rejects a different Playwright version", async () => {
    const { dependencies, contents } = fixture();
    contents.set(`${core}/package.json`, JSON.stringify({ version: "1.64.0" }));
    await expect(validateChromiumAppArmorExecutable(dependencies)).rejects.toThrow(/version/u);
  });
  it("rejects an executable absent from the sealed manifest", async () => {
    const { dependencies, contents } = fixture();
    contents.set(manifest, JSON.stringify({ entries: {} }));
    await expect(validateChromiumAppArmorExecutable(dependencies)).rejects.toThrow(/manifest/u);
  });
});

describe("bounded privileged profile lifecycle", () => {
  it("syntax checks, loads, and verifies exactly one policy without sysctl changes", async () => {
    const { dependencies, contents } = fixture();
    await installChromiumAppArmorProfile(dependencies);
    expect(dependencies.execute).toHaveBeenNthCalledWith(1, [
      "--skip-kernel-load",
      "--skip-cache",
      CHROMIUM_APPARMOR.policyFile,
    ]);
    expect(dependencies.execute).toHaveBeenNthCalledWith(2, [
      "--replace",
      "--skip-cache",
      CHROMIUM_APPARMOR.policyFile,
    ]);
    expect(contents.get(restricted)).toBe("1\n");
    expect(dependencies.writeExclusive).toHaveBeenCalledWith(renderChromiumAppArmorProfile());
    await assertAppArmorEnvironmentAndProfile(dependencies);
  });
  it("unloads, verifies absence, and removes only the owned exact policy", async () => {
    const { dependencies, contents, files } = fixture();
    await installChromiumAppArmorProfile(dependencies);
    await removeChromiumAppArmorProfile(dependencies);
    expect(contents.get(profiles)).not.toContain(CHROMIUM_APPARMOR.profile);
    expect(files.has(CHROMIUM_APPARMOR.policyFile)).toBe(false);
    expect(dependencies.execute).toHaveBeenLastCalledWith([
      "--remove",
      "--skip-cache",
      CHROMIUM_APPARMOR.policyFile,
    ]);
  });
  it("does not mutate anything outside the privileged Linux setup phase", async () => {
    const { dependencies } = fixture();
    dependencies.privilegedLinux = () => false;
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(/privileged/u);
    await expect(removeChromiumAppArmorProfile(dependencies)).rejects.toThrow(/privileged/u);
    expect(dependencies.writeExclusive).not.toHaveBeenCalled();
    expect(dependencies.execute).not.toHaveBeenCalled();
  });
  it.each([
    [enabled, "N"],
    [restricted, "0"],
  ])("fails closed on disabled policy %s", async (file, value) => {
    const { dependencies, contents } = fixture();
    contents.set(file as string, value as string);
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(/remain enabled/u);
    expect(dependencies.writeExclusive).not.toHaveBeenCalled();
    expect(dependencies.execute).not.toHaveBeenCalled();
  });
  it("refuses to overwrite a pre-existing policy file", async () => {
    const { dependencies, files } = fixture();
    files.set(CHROMIUM_APPARMOR.policyFile, { ...asset, mode: 0o444 });
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(/already exists/u);
    expect(dependencies.writeExclusive).not.toHaveBeenCalled();
  });
  it("refuses a pre-existing loaded policy even when its file is absent", async () => {
    const { dependencies, contents } = fixture();
    contents.set(profiles, `${CHROMIUM_APPARMOR.profile} (unconfined)\n`);
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(/already exists/u);
    expect(dependencies.writeExclusive).not.toHaveBeenCalled();
  });
  it.each([1, 2])(
    "fails closed on parser step %s and permits bounded partial cleanup",
    async (step) => {
      const { dependencies, files } = fixture();
      let calls = 0;
      dependencies.execute = vi.fn(async () => {
        if (++calls === step) throw new Error("parser rejected policy");
      });
      await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(
        /parser rejected/u,
      );
      await removeChromiumAppArmorProfile(dependencies);
      expect(files.has(CHROMIUM_APPARMOR.policyFile)).toBe(false);
    },
  );
  it("fails closed if successful parser exit does not produce the expected loaded profile", async () => {
    const { dependencies } = fixture();
    dependencies.execute = vi.fn(async () => {});
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(/not loaded/u);
  });
  it("rolls back a profile loaded before a parser error was reported", async () => {
    const { dependencies, contents, files } = fixture();
    const execute = dependencies.execute;
    dependencies.execute = vi.fn(async (args) => {
      await execute(args);
      if (args.includes("--replace")) throw new Error("load reported failure");
    });
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(/load reported/u);
    expect(contents.get(profiles)).not.toContain(CHROMIUM_APPARMOR.profile);
    expect(files.has(CHROMIUM_APPARMOR.policyFile)).toBe(false);
  });
  it("reports both installation and rollback failures", async () => {
    const { dependencies } = fixture();
    const execute = dependencies.execute;
    dependencies.execute = vi.fn(async (args) => {
      if (args.includes("--remove")) throw new Error("unload failed");
      await execute(args);
      if (args.includes("--replace")) throw new Error("load verification failed");
    });
    await expect(installChromiumAppArmorProfile(dependencies)).rejects.toThrow(
      /installation and rollback/u,
    );
    expect(dependencies.removeFile).not.toHaveBeenCalled();
  });
  it("refuses writable, symlinked, or incorrectly owned policy files during verification", async () => {
    for (const patch of [
      { kind: "symlink" as const },
      { uid: 991 },
      { gid: 991 },
      { mode: 0o644 },
      { mode: 0o555 },
    ]) {
      const { dependencies, files } = fixture();
      await installChromiumAppArmorProfile(dependencies);
      files.set(CHROMIUM_APPARMOR.policyFile, { ...asset, mode: 0o444, ...patch });
      await expect(assertAppArmorEnvironmentAndProfile(dependencies)).rejects.toThrow();
    }
  });
  it("refuses to unload a loaded policy lacking its exact owned file", async () => {
    const { dependencies, contents } = fixture();
    contents.set(profiles, `${CHROMIUM_APPARMOR.profile} (unconfined)\n`);
    await expect(removeChromiumAppArmorProfile(dependencies)).rejects.toThrow(
      /no owned policy file/u,
    );
    expect(dependencies.execute).not.toHaveBeenCalled();
  });
  it("does not treat a prefix-match or enforce-mode profile as the expected profile", async () => {
    const { dependencies, contents } = fixture();
    await installChromiumAppArmorProfile(dependencies);
    contents.set(
      profiles,
      `${CHROMIUM_APPARMOR.profile}-other (unconfined)\n${CHROMIUM_APPARMOR.profile} (enforce)\n`,
    );
    await expect(assertAppArmorEnvironmentAndProfile(dependencies)).rejects.toThrow(/not loaded/u);
  });
  it("fails closed if the installed policy contents change", async () => {
    const { dependencies, contents } = fixture();
    await installChromiumAppArmorProfile(dependencies);
    contents.set(CHROMIUM_APPARMOR.policyFile, "profile broad /** { userns, }\n");
    await expect(assertAppArmorEnvironmentAndProfile(dependencies)).rejects.toThrow(/contents/u);
    await expect(removeChromiumAppArmorProfile(dependencies)).rejects.toThrow(/contents/u);
    expect(dependencies.removeFile).not.toHaveBeenCalled();
  });
  it("retains the policy file and fails if kernel unload does not take effect", async () => {
    const { dependencies, files } = fixture();
    await installChromiumAppArmorProfile(dependencies);
    dependencies.execute = vi.fn(async () => {});
    await expect(removeChromiumAppArmorProfile(dependencies)).rejects.toThrow(/remains loaded/u);
    expect(files.has(CHROMIUM_APPARMOR.policyFile)).toBe(true);
    expect(dependencies.removeFile).not.toHaveBeenCalled();
  });
  it("handles cleanup before installation without any parser calls", async () => {
    const { dependencies } = fixture();
    await removeChromiumAppArmorProfile(dependencies);
    expect(dependencies.execute).not.toHaveBeenCalled();
    expect(dependencies.removeFile).not.toHaveBeenCalled();
  });
});
