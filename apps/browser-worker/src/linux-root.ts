import { createHash } from "node:crypto";
import { chmod, lstat, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MANIFEST = ".crossexam-root-manifest.json";
const TOP_LEVEL = new Set([
  "app",
  "browser",
  "dev",
  "etc",
  "lib",
  "lib64",
  "proc",
  "run",
  "runtime",
  "sys",
  "tmp",
  "usr",
  "var",
]);

type Entry = { mode: number; size: number; digest: string; kind: "file" | "directory" };
type Manifest = { version: 1; entries: Record<string, Entry> };

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
      if (
        info.isSymbolicLink() ||
        info.isSocket() ||
        info.isFIFO() ||
        info.isBlockDevice() ||
        info.isCharacterDevice()
      )
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
