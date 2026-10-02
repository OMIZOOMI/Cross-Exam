import { spawnSync } from "node:child_process";
import { parseDependencies } from "../apps/browser-worker/src/linux-root";

const executables = process.argv.slice(2);
if (executables.length === 0) {
  throw new Error("at least one executable path is required");
}

const resolved = new Set<string>();
for (const executable of executables) {
  if (typeof executable !== "string" || !executable.startsWith("/") || executable.includes("\0")) {
    throw new Error(`invalid executable path: ${executable}`);
  }
  const result = spawnSync("ldd", [executable], { encoding: "utf8" });
  if (result.error) {
    throw new Error(`ldd failed for ${executable}: ${result.error.message}`);
  }
  const output = result.stdout ?? "";
  if (output.trim() === "") {
    throw new Error(
      `ldd produced no output for ${executable} (exit ${result.status ?? "unknown"})`,
    );
  }
  for (const dependency of parseDependencies(output)) resolved.add(dependency);
}

const lines = [...resolved].sort();
if (lines.length > 0) {
  process.stdout.write(`${lines.join("\n")}\n`);
}
