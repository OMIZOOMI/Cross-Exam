import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ControlledFixtureLinuxPreflightSchema,
  LINUX_PREFLIGHT_LIMITS as L,
  type LinuxPreflight,
  type SelectedLinuxHost,
  SelectedLinuxHostSchema,
} from "@crossexam/contracts";
import {
  CHROMIUM_APPARMOR,
  validateChromiumAppArmorExecutable,
} from "../../../apps/browser-worker/src/linux-apparmor";
import { ROOT_MANIFEST_NAME } from "../../../apps/browser-worker/src/linux-root-layout";
import { hash, immutable } from "../../agents/src/provider";
import { currentPreflightCommit } from "./fixture-preflight";
import {
  BODY_HASH,
  FUTURE_PROOF_POLICY_HASH,
  REAL_MANIFEST_HASH,
  REAL_POLICY_HASH,
  REAL_SCHEMAS_HASH,
  RUNNER_CONFIG_HASH,
} from "./fixture-runner";
import {
  FIXED_RUNNER_ARTIFACT_HASH,
  LINUX_CONFIGURATION,
  LINUX_POLICY_HASH,
  LINUX_SCHEMAS_HASH,
  LINUX_SOURCES_HASH,
} from "./linux-policy";

export type LinuxIdentityFacts = {
  platform: string;
  distribution: string;
  version: string;
  commit: string;
  hostnameHash: string;
  machineIdHash: string;
  workerUid: number;
  workerGid: number;
  controllerUid: number;
  controllerGid: number;
  storageOwnerUid: number;
  storageOwnerGid: number;
  rootManifestHash: string;
  chromiumBinaryHash: string;
  preparedWorkerArtifactHash: string;
  runnerArtifactHash: string;
  chromiumVersion: string;
  playwright: string;
  revision: string;
  executable: string;
  storageSafe: boolean;
  rootValidated: boolean;
};
const originals = new WeakSet<object>();
const repository = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
function requireStoragePath(s: SelectedLinuxHost) {
  if (
    s.storageDirectory === repository ||
    s.storageDirectory.startsWith(`${repository}/`) ||
    s.storageDirectory === CHROMIUM_APPARMOR.root ||
    s.storageDirectory.startsWith(`${CHROMIUM_APPARMOR.root}/`) ||
    s.storageOwnerUid === s.workerUid
  )
    throw new Error("LINUX_STORAGE_MISMATCH");
}
function packet(selection: unknown, f: LinuxIdentityFacts, testOnly: boolean): LinuxPreflight {
  const s = SelectedLinuxHostSchema.parse(selection);
  requireStoragePath(s);
  if (f.platform !== "linux" || f.distribution !== "ubuntu" || f.version !== "24.04")
    throw new Error("LINUX_PLATFORM_MISMATCH");
  if (
    f.commit !== s.implementationCommit ||
    f.hostnameHash !== s.hostnameHash ||
    f.machineIdHash !== s.machineIdHash ||
    f.workerUid !== s.workerUid ||
    f.workerGid !== s.workerGid ||
    f.controllerUid !== s.storageOwnerUid ||
    f.controllerGid !== s.storageOwnerGid ||
    f.storageOwnerUid !== s.storageOwnerUid ||
    f.storageOwnerGid !== s.storageOwnerGid ||
    !f.storageSafe ||
    !f.rootValidated ||
    f.rootManifestHash !== s.rootManifestHash ||
    f.chromiumBinaryHash !== s.chromiumBinaryHash ||
    f.runnerArtifactHash !== s.runnerArtifactHash ||
    f.runnerArtifactHash !== FIXED_RUNNER_ARTIFACT_HASH ||
    f.chromiumVersion !== CHROMIUM_APPARMOR.version ||
    f.playwright !== CHROMIUM_APPARMOR.playwright ||
    f.revision !== CHROMIUM_APPARMOR.revision ||
    f.executable !== CHROMIUM_APPARMOR.executable
  )
    throw new Error("LINUX_IDENTITY_MISMATCH");
  const storagePath = `${s.storageDirectory}/controlled-fixture-linux-v1`;
  const host = {
    hostnameHash: f.hostnameHash,
    machineIdHash: f.machineIdHash,
    workerUid: f.workerUid,
    workerGid: f.workerGid,
    storagePath,
    storagePathHash: hash(storagePath),
    storageOwnerUid: s.storageOwnerUid,
    storageOwnerGid: s.storageOwnerGid,
  };
  const output = immutable(
    ControlledFixtureLinuxPreflightSchema.parse({
      schemaVersion: 1,
      kind: "controlled-fixture-linux-preflight-v1",
      verification: "static-identity-only",
      testOnly,
      selection: s,
      selectionHash: hash(JSON.stringify(s)),
      platform: "linux",
      distribution: "ubuntu",
      distributionVersion: "24.04",
      implementationCommit: f.commit,
      runnerArtifactHash: f.runnerArtifactHash,
      preparedWorkerArtifactHash: f.preparedWorkerArtifactHash,
      sourceHash: LINUX_SOURCES_HASH,
      configurationHash: RUNNER_CONFIG_HASH,
      sourceSchemasHash: REAL_SCHEMAS_HASH,
      sourcePolicyHash: REAL_POLICY_HASH,
      linuxSchemasHash: LINUX_SCHEMAS_HASH,
      linuxPolicyHash: LINUX_POLICY_HASH,
      futureProofPolicyHash: FUTURE_PROOF_POLICY_HASH,
      fixtureManifestHash: REAL_MANIFEST_HASH,
      bodyHash: BODY_HASH,
      rootManifestHash: f.rootManifestHash,
      chromiumBinaryHash: f.chromiumBinaryHash,
      configuration: LINUX_CONFIGURATION,
      host: { ...host, bindingHash: hash(JSON.stringify(host)) },
      browserInvoked: false,
      fixtureInvoked: false,
      proxyInvoked: false,
      workerInvoked: false,
      executionAttestation: null,
      observation: null,
    }),
  );
  originals.add(output);
  return output;
}
export function assertOriginalLinuxPreflight(v: LinuxPreflight, allowTest = false) {
  if (!originals.has(v) || (!allowTest && v.testOnly))
    throw new Error("LINUX_PREFLIGHT_AUTHORITY_MISMATCH");
}
/** Synthetic facts always mark their output testOnly; never a production verifier override. */
export function verifyLinuxFactsForTest(s: unknown, f: LinuxIdentityFacts) {
  return packet(s, f, true);
}
async function fileHash(file: string, max: number, executable = false, ownerUid = 0, ownerGid = 0) {
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await fd.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      info.uid !== ownerUid ||
      info.gid !== ownerGid ||
      info.mode & 0o7222 ||
      info.size > max ||
      (executable && !(info.mode & 0o111))
    )
      throw new Error("LINUX_ASSET_UNSAFE");
    const sha = createHash("sha256");
    const buffer = Buffer.alloc(64 * 1024);
    let total = 0;
    for (;;) {
      const { bytesRead } = await fd.read(buffer);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > max) throw new Error("LINUX_ASSET_LIMIT");
      sha.update(buffer.subarray(0, bytesRead));
    }
    const after = await fd.stat();
    if (total !== info.size || after.mtimeMs !== info.mtimeMs || after.size !== info.size)
      throw new Error("LINUX_ASSET_CHANGED");
    return sha.digest("hex");
  } finally {
    await fd.close();
  }
}
/** Unit-only inode/hash checks on disposable files; production always requires root:root. */
export function hashIdentityAssetForTest(file: string, max: number, executable = false) {
  return fileHash(file, max, executable, process.getuid?.(), process.getgid?.());
}
async function storageSafe(s: SelectedLinuxHost) {
  if ((await realpath(s.storageDirectory)) !== s.storageDirectory)
    throw new Error("LINUX_STORAGE_UNSAFE");
  const leaf = await lstat(s.storageDirectory);
  if (
    !leaf.isDirectory() ||
    leaf.isSymbolicLink() ||
    leaf.mode & 0o7077 ||
    leaf.uid !== s.storageOwnerUid ||
    leaf.gid !== s.storageOwnerGid
  )
    throw new Error("LINUX_STORAGE_UNSAFE");
  let current = path.dirname(s.storageDirectory);
  for (;;) {
    const info = await lstat(current);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.mode & 0o022 ||
      ![0, s.storageOwnerUid].includes(info.uid)
    )
      throw new Error("LINUX_STORAGE_UNSAFE");
    if (current === "/") break;
    current = path.dirname(current);
  }
  try {
    const namespace = await lstat(`${s.storageDirectory}/controlled-fixture-linux-v1`);
    if (
      !namespace.isDirectory() ||
      namespace.isSymbolicLink() ||
      namespace.mode & 0o7077 ||
      namespace.uid !== s.storageOwnerUid ||
      namespace.gid !== s.storageOwnerGid
    )
      throw new Error("LINUX_STORAGE_UNSAFE");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return leaf;
}
async function boundedText(file: string, limit: number) {
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await fd.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== 0 ||
      stat.gid !== 0 ||
      stat.mode & 0o022 ||
      stat.size > limit
    )
      throw new Error("LINUX_METADATA_LIMIT");
    const data = Buffer.alloc(limit + 1);
    let total = 0;
    for (;;) {
      const { bytesRead } = await fd.read(data, total, data.length - total, null);
      total += bytesRead;
      if (total > limit) throw new Error("LINUX_METADATA_LIMIT");
      if (!bytesRead) break;
    }
    return data.subarray(0, total).toString("utf8");
  } finally {
    await fd.close();
  }
}
/** Reads only. No browser --version, AppArmor parser, worker/proxy launch or provisioning. */
export async function verifySelectedLinuxHost(selection: unknown) {
  if (process.platform !== "linux" || process.env.GITHUB_ACTIONS === "true")
    throw new Error("LINUX_PLATFORM_MISMATCH");
  const s = SelectedLinuxHostSchema.parse(selection);
  requireStoragePath(s);
  const commit = currentPreflightCommit();
  if (commit !== s.implementationCommit) throw new Error("LINUX_COMMIT_MISMATCH");
  // /etc/os-release may be a compatibility symlink. Read its fixed canonical system asset.
  const os = await boundedText("/usr/lib/os-release", 4096);
  const osLines = os.split("\n");
  if (
    !osLines.some((l) => l === "ID=ubuntu" || l === 'ID="ubuntu"') ||
    !osLines.some((l) => l === "VERSION_ID=24.04" || l === 'VERSION_ID="24.04"')
  )
    throw new Error("LINUX_PLATFORM_MISMATCH");
  const machine = (await boundedText("/etc/machine-id", 128)).trim();
  if (!/^[a-f0-9]{32}$/.test(machine)) throw new Error("LINUX_MACHINE_ID_MISMATCH");
  const passwd = (await boundedText("/etc/passwd", 64 * 1024))
    .split("\n")
    .filter((l) => l.startsWith("crossexam-worker:"));
  const group = (await boundedText("/etc/group", 64 * 1024))
    .split("\n")
    .filter((l) => l.startsWith("crossexam-worker:"));
  if (passwd.length !== 1 || group.length !== 1) throw new Error("LINUX_WORKER_IDENTITY_MISMATCH");
  const p = (passwd[0] as string).split(":");
  const g = (group[0] as string).split(":");
  if (!/^\d+$/.test(p[2] ?? "") || !/^\d+$/.test(p[3] ?? "") || p[3] !== g[2])
    throw new Error("LINUX_WORKER_IDENTITY_MISMATCH");
  const storage = await storageSafe(s);
  const executable = await validateChromiumAppArmorExecutable(); // Existing sealed-root closure validation; read only.
  const rootManifestHash = await fileHash(
    `${CHROMIUM_APPARMOR.root}/${ROOT_MANIFEST_NAME}`,
    L.manifestBytes,
  );
  const chromiumBinaryHash = await fileHash(
    `${CHROMIUM_APPARMOR.root}${CHROMIUM_APPARMOR.executable}`,
    L.artifactBytes,
    true,
  );
  if (chromiumBinaryHash !== executable.sha256) throw new Error("LINUX_BINARY_MANIFEST_MISMATCH");
  const workerHash = await fileHash(`${CHROMIUM_APPARMOR.root}/app/probe.cjs`, L.artifactBytes);
  const manifest = JSON.parse(
    await boundedText(`${CHROMIUM_APPARMOR.root}/${ROOT_MANIFEST_NAME}`, L.manifestBytes),
  );
  if (
    manifest.entries?.["app/probe.cjs"]?.digest !== workerHash ||
    (await fileHash(`${CHROMIUM_APPARMOR.root}/${ROOT_MANIFEST_NAME}`, L.manifestBytes)) !==
      rootManifestHash
  )
    throw new Error("LINUX_ROOT_CHANGED");
  if (currentPreflightCommit() !== commit) throw new Error("LINUX_COMMIT_CHANGED");
  return packet(
    s,
    {
      platform: process.platform,
      distribution: "ubuntu",
      version: "24.04",
      commit,
      hostnameHash: hash(hostname()),
      machineIdHash: hash(machine),
      workerUid: Number(p[2]),
      workerGid: Number(p[3]),
      controllerUid: process.getuid?.() as number,
      controllerGid: process.getgid?.() as number,
      storageOwnerUid: storage.uid,
      storageOwnerGid: storage.gid,
      storageSafe: true,
      rootValidated: true,
      rootManifestHash,
      chromiumBinaryHash,
      preparedWorkerArtifactHash: workerHash,
      runnerArtifactHash: FIXED_RUNNER_ARTIFACT_HASH,
      chromiumVersion: executable.version,
      playwright: executable.playwright,
      revision: executable.revision,
      executable: executable.executable,
    },
    false,
  );
}
