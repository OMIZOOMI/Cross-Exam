import { ScanInputSchema } from "@crossexam/contracts";
import { SCAN_LIMITS } from "./limits";
import { DeterministicScanRunner } from "./runner";

async function main() {
  const input = ScanInputSchema.parse({
    targetUrl: process.argv[2] ?? "https://example.com",
    timeoutMs: SCAN_LIMITS.scanTimeoutMs,
  });
  const result = await new DeterministicScanRunner().run({
    ...input,
    targetUrl: process.argv[2] ?? "https://example.com",
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "completed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Scanner failed.");
  process.exitCode = 1;
});
