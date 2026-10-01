import { type ScanInput, ScanInputSchema } from "@crossexam/contracts";
import type { ScanOutcome, ScanRunner } from "@crossexam/engine";
import { validateTargetUrl } from "@crossexam/engine/url-policy";
import { investigate } from "./investigate";

export class DeterministicScanRunner implements ScanRunner {
  run(input: ScanInput, signal?: AbortSignal): Promise<ScanOutcome> {
    return investigate(input, signal);
  }
}

/** Deliberately performs no DNS, HTTP, or browser operations. */
export class UnavailableScanRunner implements ScanRunner {
  async run(input: ScanInput, signal?: AbortSignal): Promise<ScanOutcome> {
    signal?.throwIfAborted();
    ScanInputSchema.parse(input);
    // Check the original input, not the schema’s trimmed output. Still no DNS or target I/O.
    if (!validateTargetUrl(input.targetUrl).ok) {
      return {
        status: "rejected",
        code: "TARGET_NOT_ALLOWED",
        message: "This destination cannot be scanned.",
      };
    }
    return {
      status: "unavailable",
      code: "SCANNER_NOT_IMPLEMENTED",
      message:
        "Live scanning is not connected. Browser egress isolation and collection are not implemented.",
    };
  }
}
