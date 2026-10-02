export const ROOT_MANIFEST_NAME = ".crossexam-root-manifest.json";

export const EXPECTED_ROOT_ENTRIES = Object.freeze([
  ROOT_MANIFEST_NAME,
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

export type RootLayoutIssue = { type: "missing-manifest" } | { type: "unexpected"; name: string };

export function rootLayoutIssues(names: readonly string[]): RootLayoutIssue[] {
  const issues: RootLayoutIssue[] = [];
  const seen = new Set(names);
  if (!seen.has(ROOT_MANIFEST_NAME)) issues.push({ type: "missing-manifest" });
  for (const name of names) {
    if (!EXPECTED_ROOT_ENTRIES.includes(name)) issues.push({ type: "unexpected", name });
  }
  return issues;
}

export function manifestEntryIssue(entry: {
  isFile: boolean;
  isSymbolicLink: boolean;
  mode: number;
}): string | null {
  if (entry.isSymbolicLink) return "MANIFEST_SYMLINK";
  if (!entry.isFile) return "MANIFEST_NOT_REGULAR_FILE";
  if ((entry.mode & 0o022) !== 0) return "MANIFEST_WRITABLE";
  return null;
}
