import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { validatePreparedRoot } from "./linux-root";
import { ROOT_MANIFEST_NAME } from "./linux-root-layout";

// This policy follows one artifact pinned by the sealed root. Updating Chromium
// requires reviewing these values together; callers cannot supply another path.
export const CHROMIUM_APPARMOR = Object.freeze({
  profile: "crossexam-chromium-userns",
  root: "/var/lib/crossexam/root",
  executable:
    "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  attachment:
    "/browser/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
  playwright: "1.63.0",
  revision: "1243",
  version: "153.0.8010.12",
  policyFile: "/etc/apparmor.d/crossexam-chromium-userns",
});

const PARSER = "/usr/sbin/apparmor_parser";
const ENABLED = "/sys/module/apparmor/parameters/enabled";
const RESTRICTED = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";
const PROFILES = "/sys/kernel/security/apparmor/profiles";
const CORE = "/app/node_modules/playwright-core";

export type AppArmorFile = {
  kind: "file" | "directory" | "symlink" | "other";
  uid: number;
  gid: number;
  mode: number;
};

// The default implementation is the only production provisioning path. These
// seams permit deterministic tests without installing a host security policy.
export type AppArmorDependencies = {
  privilegedLinux: () => boolean;
  inspect: (file: string) => Promise<AppArmorFile | undefined>;
  read: (file: string) => Promise<string>;
  validateRoot: (root: string, owner: number) => Promise<void>;
  writeExclusive: (contents: string) => Promise<void>;
  removeFile: () => Promise<void>;
  execute: (args: readonly string[]) => Promise<void>;
};

const run = promisify(execFile);
const defaults: AppArmorDependencies = {
  privilegedLinux: () =>
    process.platform === "linux" && process.getuid?.() === 0 && process.getgid?.() === 0,
  inspect: async (file) => {
    try {
      const info = await lstat(file);
      return {
        kind: info.isSymbolicLink()
          ? "symlink"
          : info.isFile()
            ? "file"
            : info.isDirectory()
              ? "directory"
              : "other",
        uid: info.uid,
        gid: info.gid,
        mode: info.mode & 0o7777,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  },
  read: (file) => readFile(file, "utf8"),
  validateRoot: validatePreparedRoot,
  writeExclusive: async (contents) => {
    const handle = await open(
      CHROMIUM_APPARMOR.policyFile,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o444,
    );
    try {
      await handle.chmod(0o444);
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } catch (error) {
      try {
        await unlink(CHROMIUM_APPARMOR.policyFile);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Chromium AppArmor policy creation and rollback failed",
        );
      }
      throw error;
    } finally {
      await handle.close();
    }
  },
  removeFile: () => unlink(CHROMIUM_APPARMOR.policyFile),
  execute: async (args) => {
    await run(PARSER, [...args], { timeout: 5_000, maxBuffer: 64 * 1024, encoding: "utf8" });
  },
};

export function renderChromiumAppArmorProfile(): string {
  return `# CrossExam: one immutable Chromium artifact; no global userns exception.\nprofile ${CHROMIUM_APPARMOR.profile} ${CHROMIUM_APPARMOR.attachment} flags=(unconfined) {\n  userns,\n}\n`;
}

export function validateChromiumAppArmorProfile(contents: string): void {
  if (contents !== renderChromiumAppArmorProfile())
    throw new Error("unexpected Chromium AppArmor policy contents");
  if (
    CHROMIUM_APPARMOR.attachment !== CHROMIUM_APPARMOR.executable ||
    !/^\/[a-zA-Z0-9_./-]+$/u.test(CHROMIUM_APPARMOR.attachment) ||
    path.posix.normalize(CHROMIUM_APPARMOR.attachment) !== CHROMIUM_APPARMOR.attachment
  )
    throw new Error("unexpected Chromium AppArmor attachment");
}

export type ChromiumAppArmorExecutable = {
  executable: string;
  attachment: string;
  revision: string;
  version: string;
  playwright: string;
  uid: number;
  gid: number;
  mode: number;
  sha256: string;
};

async function validateParents(file: string, dependencies: AppArmorDependencies): Promise<void> {
  let current = path.posix.dirname(file);
  while (true) {
    const info = await dependencies.inspect(current);
    if (info?.kind !== "directory" || info.uid !== 0 || info.gid !== 0 || (info.mode & 0o022) !== 0)
      throw new Error("Chromium AppArmor path has an unsafe parent");
    if (current === "/") break;
    current = path.posix.dirname(current);
  }
}

async function validateAsset(
  file: string,
  dependencies: AppArmorDependencies,
  executable = false,
): Promise<AppArmorFile> {
  await validateParents(file, dependencies);
  const info = await dependencies.inspect(file);
  if (
    info?.kind !== "file" ||
    info.uid !== 0 ||
    info.gid !== 0 ||
    (info.mode & 0o7222) !== 0 ||
    (executable && (info.mode & 0o111) === 0)
  )
    throw new Error("Chromium AppArmor asset ownership, kind, or mode is invalid");
  return info;
}

export async function validateChromiumAppArmorExecutable(
  dependencies: AppArmorDependencies = defaults,
): Promise<ChromiumAppArmorExecutable> {
  await dependencies.validateRoot(CHROMIUM_APPARMOR.root, 0);
  const executable = `${CHROMIUM_APPARMOR.root}${CHROMIUM_APPARMOR.executable}`;
  const info = await validateAsset(executable, dependencies, true);
  for (const file of [`${CORE}/package.json`, `${CORE}/browsers.json`])
    await validateAsset(`${CHROMIUM_APPARMOR.root}${file}`, dependencies);
  const packageInfo = JSON.parse(
    await dependencies.read(`${CHROMIUM_APPARMOR.root}${CORE}/package.json`),
  ) as { version?: unknown };
  const browsersInfo = JSON.parse(
    await dependencies.read(`${CHROMIUM_APPARMOR.root}${CORE}/browsers.json`),
  ) as { browsers?: { name?: unknown; revision?: unknown; browserVersion?: unknown }[] };
  const browser = browsersInfo.browsers?.filter((item) => item.name === "chromium-headless-shell");
  if (
    packageInfo.version !== CHROMIUM_APPARMOR.playwright ||
    browser?.length !== 1 ||
    browser[0]?.revision !== CHROMIUM_APPARMOR.revision ||
    browser[0]?.browserVersion !== CHROMIUM_APPARMOR.version
  )
    throw new Error("Chromium AppArmor artifact version does not match locked policy");
  const manifest = JSON.parse(
    await dependencies.read(`${CHROMIUM_APPARMOR.root}/${ROOT_MANIFEST_NAME}`),
  ) as { entries?: Record<string, { kind?: unknown; digest?: unknown; mode?: unknown }> };
  const entry = manifest.entries?.[CHROMIUM_APPARMOR.executable.slice(1)];
  if (
    entry?.kind !== "file" ||
    typeof entry.digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(entry.digest) ||
    entry.mode !== info.mode
  )
    throw new Error("Chromium AppArmor artifact is not linked to the sealed manifest");
  return {
    executable: CHROMIUM_APPARMOR.executable,
    attachment: CHROMIUM_APPARMOR.attachment,
    revision: CHROMIUM_APPARMOR.revision,
    version: CHROMIUM_APPARMOR.version,
    playwright: CHROMIUM_APPARMOR.playwright,
    uid: info.uid,
    gid: info.gid,
    mode: info.mode,
    sha256: entry.digest,
  };
}

export async function assertAppArmorEnvironmentAndProfile(
  dependencies: AppArmorDependencies = defaults,
): Promise<void> {
  if ((await dependencies.read(ENABLED)).trim() !== "Y")
    throw new Error("AppArmor must remain enabled");
  if ((await dependencies.read(RESTRICTED)).trim() !== "1")
    throw new Error("AppArmor unprivileged userns restriction must remain enabled");
  const profiles = (await dependencies.read(PROFILES)).split("\n");
  if (!profiles.includes(`${CHROMIUM_APPARMOR.profile} (unconfined)`))
    throw new Error("expected Chromium AppArmor profile is not loaded");
  const info = await validateAsset(CHROMIUM_APPARMOR.policyFile, dependencies);
  if (info.mode !== 0o444) throw new Error("Chromium AppArmor policy mode must be 0444");
  validateChromiumAppArmorProfile(await dependencies.read(CHROMIUM_APPARMOR.policyFile));
}

function requireProvisioning(dependencies: AppArmorDependencies): void {
  if (!dependencies.privilegedLinux())
    throw new Error("Chromium AppArmor provisioning requires the privileged Linux setup phase");
}

export async function installChromiumAppArmorProfile(
  dependencies: AppArmorDependencies = defaults,
): Promise<ChromiumAppArmorExecutable> {
  requireProvisioning(dependencies);
  const evidence = await validateChromiumAppArmorExecutable(dependencies);
  const contents = renderChromiumAppArmorProfile();
  validateChromiumAppArmorProfile(contents);
  if ((await dependencies.read(ENABLED)).trim() !== "Y")
    throw new Error("AppArmor must remain enabled");
  if ((await dependencies.read(RESTRICTED)).trim() !== "1")
    throw new Error("AppArmor unprivileged userns restriction must remain enabled");
  if (
    (await dependencies.inspect(CHROMIUM_APPARMOR.policyFile)) !== undefined ||
    (await dependencies.read(PROFILES))
      .split("\n")
      .some((item) => item.startsWith(`${CHROMIUM_APPARMOR.profile} (`))
  )
    throw new Error("Chromium AppArmor policy already exists; refusing to overwrite it");
  await validateParents(CHROMIUM_APPARMOR.policyFile, dependencies);
  await dependencies.writeExclusive(contents);
  // Once exclusive creation succeeds we own this policy. Parser failure must
  // roll it back, but a pre-existing file/profile is never removed or replaced.
  try {
    const installed = await validateAsset(CHROMIUM_APPARMOR.policyFile, dependencies);
    if (installed.mode !== 0o444) throw new Error("Chromium AppArmor policy mode must be 0444");
    await dependencies.execute([
      "--skip-kernel-load",
      "--skip-cache",
      CHROMIUM_APPARMOR.policyFile,
    ]);
    await dependencies.execute(["--replace", "--skip-cache", CHROMIUM_APPARMOR.policyFile]);
    await assertAppArmorEnvironmentAndProfile(dependencies);
    return evidence;
  } catch (error) {
    try {
      await removeChromiumAppArmorProfile(dependencies);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Chromium AppArmor installation and rollback failed",
      );
    }
    throw error;
  }
}

export async function removeChromiumAppArmorProfile(
  dependencies: AppArmorDependencies = defaults,
): Promise<void> {
  requireProvisioning(dependencies);
  const file = await dependencies.inspect(CHROMIUM_APPARMOR.policyFile);
  const profiles = (await dependencies.read(PROFILES)).split("\n");
  const loaded = profiles.some((item) => item.startsWith(`${CHROMIUM_APPARMOR.profile} (`));
  if (file === undefined) {
    if (loaded) throw new Error("loaded Chromium AppArmor policy has no owned policy file");
    return;
  }
  const info = await validateAsset(CHROMIUM_APPARMOR.policyFile, dependencies);
  if (info.mode !== 0o444) throw new Error("Chromium AppArmor policy mode must be 0444");
  validateChromiumAppArmorProfile(await dependencies.read(CHROMIUM_APPARMOR.policyFile));
  if (loaded) {
    await dependencies.execute(["--remove", "--skip-cache", CHROMIUM_APPARMOR.policyFile]);
    if (
      (await dependencies.read(PROFILES))
        .split("\n")
        .some((item) => item.startsWith(`${CHROMIUM_APPARMOR.profile} (`))
    )
      throw new Error("Chromium AppArmor profile remains loaded after removal");
  }
  await dependencies.removeFile();
}
