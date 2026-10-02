import { createHash } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { chmod, lstat, readdir, readFile, readlink, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST = ".crossexam-root-manifest.json";
const MAX_DIFF_ENTRIES = 100;
const MAX_DIFF_VISITED = 10_000;
// The single permitted top-level compatibility symlink (systemd base-filesystem
// /bin -> usr/bin). Its target must be exactly this relative, in-root value.
const ALLOWED_SYMLINK = Object.freeze({ path: "bin", target: "usr/bin" });
const TOP_LEVEL = new Set([
  "app",
  "bin",
  "browser",
  "dev",
  "etc",
  "lib",
  "lib64",
  "proc",
  "root",
  "run",
  "runtime",
  "sys",
  "tmp",
  "usr",
  "var",
]);

type Entry = {
  mode: number;
  size: number;
  digest: string;
  kind: "file" | "directory" | "symlink";
  target?: string;
};
type Manifest = { version: 1; entries: Record<string, Entry> };

export type PreparedRootDiffEntry = {
  path: string;
  kind: string;
  mode?: number;
  size?: number;
  target?: string;
};

export type PreparedRootDiff = {
  truncated: boolean;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  added: PreparedRootDiffEntry[];
  removed: PreparedRootDiffEntry[];
  changed: PreparedRootDiffEntry[];
};

type WalkEntry = { kind: string; mode: number; size: number; target?: string };

export async function sealRoot(root: string): Promise<void> {
  const entries = await inventory(root, true);
  await writeFile(path.join(root, MANIFEST), JSON.stringify({ version: 1, entries }, null, 2), {
    mode: 0o444,
  });
  await chmod(path.join(root, MANIFEST), 0o444);
}

export async function validatePreparedRoot(root: string, expectedOwner: number): Promise<void> {
  const rootStat = await stat(root);
  if (!rootStat.isDirectory() || rootStat.uid !== expectedOwner || (rootStat.mode & 0o022) !== 0)
    throw new Error("prepared root ownership or mode is invalid");
  const manifestStat = await lstat(path.join(root, MANIFEST));
  if (
    !manifestStat.isFile() ||
    manifestStat.uid !== expectedOwner ||
    (manifestStat.mode & 0o022) !== 0
  )
    throw new Error("prepared root manifest ownership or mode is invalid");
  const raw = await readFile(path.join(root, MANIFEST), "utf8");
  const manifest = JSON.parse(raw) as Manifest;
  if (manifest.version !== 1 || !manifest.entries || Object.keys(manifest.entries).length === 0)
    throw new Error("prepared root manifest is invalid");
  const actual = await inventory(root, false);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.entries))
    throw new Error("prepared root changed");
}

async function inventory(root: string, allowManifest: boolean): Promise<Record<string, Entry>> {
  const output: Record<string, Entry> = {};
  const pending = [root];
  while (pending.length) {
    const current = pending.pop() as string;
    for (const item of await readdir(current, { withFileTypes: true })) {
      if (item.name === MANIFEST) continue;
      if (
        current === root &&
        !TOP_LEVEL.has(item.name) &&
        !(allowManifest && item.name === MANIFEST)
      )
        throw new Error(`unexpected prepared-root entry: ${item.name}`);
      const full = path.join(current, item.name);
      const relative = path.relative(root, full);
      const info = await lstat(full);
      if (info.isSymbolicLink()) {
        if (relative !== ALLOWED_SYMLINK.path)
          throw new Error(`unsupported prepared-root entry: ${relative}`);
        const target = await readlink(full);
        if (target !== ALLOWED_SYMLINK.target)
          throw new Error(`unsupported prepared-root symlink target: ${relative} -> ${target}`);
        output[relative] = {
          mode: info.mode & 0o7777,
          size: 0,
          digest: "",
          kind: "symlink",
          target,
        };
        continue;
      }
      if (info.isSocket() || info.isFIFO() || info.isBlockDevice() || info.isCharacterDevice())
        throw new Error(`unsupported prepared-root entry: ${relative}`);
      if ((info.mode & 0o022) !== 0)
        throw new Error(`worker-writable prepared-root entry: ${relative}`);
      if (info.isDirectory()) {
        output[relative] = { mode: info.mode & 0o7777, size: 0, digest: "", kind: "directory" };
        pending.push(full);
      } else if (info.isFile()) {
        output[relative] = {
          mode: info.mode & 0o7777,
          size: info.size,
          digest: createHash("sha256")
            .update(await readFile(full))
            .digest("hex"),
          kind: "file",
        };
      } else throw new Error(`unsupported prepared-root entry: ${relative}`);
    }
  }
  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Compares the current prepared-root tree against the sealed manifest without
 * mutating anything. Reports only structural metadata (added/removed/changed
 * relative paths, entry kind, mode, size) and never file contents. Bounded to a
 * small number of reported paths and visited entries so it cannot explode on a
 * populated /proc or /sys mount. This is a diagnostic helper, not a relaxed
 * validation path; validatePreparedRoot remains unchanged.
 */
export async function diffPreparedRoot(root: string): Promise<PreparedRootDiff> {
  const raw = await readFile(path.join(root, MANIFEST), "utf8");
  const manifest = JSON.parse(raw) as Manifest;
  if (manifest.version !== 1 || !manifest.entries)
    throw new Error("prepared root manifest is invalid");
  const sealed = manifest.entries;
  const walk = await walkRoot(root);
  const current = walk.entries;

  const added: PreparedRootDiffEntry[] = [];
  const removed: PreparedRootDiffEntry[] = [];
  const changed: PreparedRootDiffEntry[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;

  const manifestPaths = new Set(Object.keys(sealed));

  for (const [relative, entry] of Object.entries(current)) {
    const reference = sealed[relative];
    if (reference === undefined) {
      addedCount += 1;
      if (added.length < MAX_DIFF_ENTRIES) added.push(diffEntry(relative, entry));
      continue;
    }
    manifestPaths.delete(relative);
    if (!(await entryMatches(root, relative, entry, reference))) {
      changedCount += 1;
      if (changed.length < MAX_DIFF_ENTRIES) changed.push(diffEntry(relative, entry));
    }
  }

  for (const relative of manifestPaths) {
    const reference = sealed[relative];
    if (reference === undefined) continue;
    removedCount += 1;
    if (removed.length < MAX_DIFF_ENTRIES) removed.push(diffEntry(relative, reference));
  }

  return {
    truncated: walk.truncated,
    addedCount,
    removedCount,
    changedCount,
    added,
    removed,
    changed,
  };
}

function diffEntry(
  relative: string,
  entry: { kind: string; mode: number; size: number; target?: string },
): PreparedRootDiffEntry {
  return entry.target === undefined
    ? { path: relative, kind: entry.kind, mode: entry.mode, size: entry.size }
    : {
        path: relative,
        kind: entry.kind,
        mode: entry.mode,
        size: entry.size,
        target: entry.target,
      };
}

async function entryMatches(
  root: string,
  relative: string,
  current: WalkEntry,
  reference: Entry,
): Promise<boolean> {
  if (current.kind !== reference.kind) return false;
  if (reference.kind === "directory") {
    return current.mode === reference.mode;
  }
  if (current.kind === "symlink" && reference.kind === "symlink") {
    return current.mode === reference.mode && current.target === reference.target;
  }
  if (current.kind === "file" && reference.kind === "file") {
    if (current.mode !== reference.mode || current.size !== reference.size) return false;
    const digest = createHash("sha256")
      .update(await readFile(path.join(root, relative)))
      .digest("hex");
    return digest === reference.digest;
  }
  return false;
}

async function walkRoot(
  root: string,
): Promise<{ truncated: boolean; entries: Record<string, WalkEntry> }> {
  const entries: Record<string, WalkEntry> = {};
  let visited = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    let items: Dirent[];
    try {
      items = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      if (visited >= MAX_DIFF_VISITED) return { truncated: true, entries };
      visited += 1;
      if (item.name === MANIFEST && current === root) continue;
      const full = path.join(current, item.name);
      const relative = path.relative(root, full);
      let info: Stats;
      try {
        info = await lstat(full);
      } catch {
        entries[relative] = { kind: "unreadable", mode: 0, size: 0 };
        continue;
      }
      if (info.isDirectory()) {
        entries[relative] = { kind: "directory", mode: info.mode & 0o7777, size: 0 };
        pending.push(full);
      } else if (info.isFile()) {
        entries[relative] = { kind: "file", mode: info.mode & 0o7777, size: info.size };
      } else if (info.isSymbolicLink()) {
        let target = "";
        try {
          target = await readlink(full);
        } catch {
          // Diagnostic only: an unreadable link target is still reported as a symlink.
        }
        entries[relative] = { kind: "symlink", mode: info.mode & 0o7777, size: 0, target };
      } else if (info.isSocket()) {
        entries[relative] = { kind: "socket", mode: info.mode & 0o7777, size: 0 };
      } else if (info.isFIFO()) {
        entries[relative] = { kind: "fifo", mode: info.mode & 0o7777, size: 0 };
      } else if (info.isBlockDevice()) {
        entries[relative] = { kind: "block", mode: info.mode & 0o7777, size: 0 };
      } else if (info.isCharacterDevice()) {
        entries[relative] = { kind: "char", mode: info.mode & 0o7777, size: 0 };
      } else {
        entries[relative] = { kind: "other", mode: info.mode & 0o7777, size: 0 };
      }
    }
  }
  return { truncated: false, entries };
}

export function parseDependencies(output: string): string[] {
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    if (line.includes("not found")) throw new Error("required runtime dependency is missing");
    const match = /(?:=>\s+)?(\/[^\s(]+)/.exec(line);
    if (!match) continue;
    const dependency = match[1];
    if (!dependency) continue;
    if (!dependency.startsWith("/")) throw new Error("runtime dependency path is invalid");
    paths.push(dependency);
  }
  return [...new Set(paths)];
}

export function validateWorkerIdentity(
  uid: string,
  gid: string,
  groups: string,
): { uid: number; gid: number } {
  if (!/^[1-9]\d*$/.test(uid) || !/^[1-9]\d*$/.test(gid) || uid !== gid || groups.trim() !== gid)
    throw new Error("worker identity or supplementary groups are invalid");
  return { uid: Number(uid), gid: Number(gid) };
}
