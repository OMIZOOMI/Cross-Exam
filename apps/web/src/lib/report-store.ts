import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ScanReport, ScanReportSchema } from "@crossexam/contracts";

const directory = path.join(process.cwd(), ".crossexam", "reports");
const idPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const maxBytes = 4 * 1024 * 1024;
const maxAge = 24 * 60 * 60 * 1000;
const maxReports = 20;

/** Local single-process storage. Random IDs are not authentication; do not expose publicly. */
export async function saveReport(input: ScanReport): Promise<string> {
  const report = ScanReportSchema.parse(input);
  if (
    report.summary.source !== "live" ||
    !report.investigation ||
    !idPattern.test(report.summary.id)
  )
    throw new Error("Invalid live report");
  const json = JSON.stringify(report);
  if (Buffer.byteLength(json) > maxBytes) throw new Error("Report size limit");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, `${report.summary.id}.json`);
  try {
    await writeFile(`${filename}.tmp`, json, { mode: 0o600, flag: "wx" });
    await rename(`${filename}.tmp`, filename);
  } finally {
    await unlink(`${filename}.tmp`).catch(() => {});
  }
  const files = await Promise.all(
    (await readdir(directory))
      .filter((name) => idPattern.test(name.replace(/\.json$/, "")) && name.endsWith(".json"))
      .map(async (name) => ({ name, modified: (await stat(path.join(directory, name))).mtimeMs })),
  );
  files.sort((a, b) => b.modified - a.modified);
  for (const [index, file] of files.entries())
    if (index >= maxReports || Date.now() - file.modified > maxAge)
      await unlink(path.join(directory, file.name));
  return report.summary.id;
}
export async function readReport(id: string): Promise<ScanReport | null> {
  if (!idPattern.test(id)) return null;
  try {
    const filename = path.join(directory, `${id}.json`);
    const info = await stat(filename);
    if (info.size > maxBytes || Date.now() - info.mtimeMs > maxAge) return null;
    const report = ScanReportSchema.parse(JSON.parse(await readFile(filename, "utf8")));
    return report.summary.id === id && report.summary.source === "live" && report.investigation
      ? report
      : null;
  } catch {
    return null;
  }
}
