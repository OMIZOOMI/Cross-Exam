import { DeterministicScanRunner } from "@crossexam/scanner";
import { SCAN_LIMITS } from "@crossexam/scanner/limits";
import { saveReport } from "./report-store";

const stateKey = Symbol.for("crossexam.scan-admission");
type Admission = { active: boolean; starts: number[] };
const state = globalThis as typeof globalThis & { [stateKey]?: Admission };
state[stateKey] ??= { active: false, starts: [] };
const admission = state[stateKey];
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Local Node adapter. One active scan per process; not a public multi-tenant job service. */
export async function handleScan(request: Request): Promise<Response> {
  const ownUrl = new URL(request.url);
  // Next normalizes loopback request URLs to localhost. Validate the original Host
  // against a strict local allowlist, then compare the browser's exact Origin.
  const host = request.headers.get("host");
  let incoming: URL;
  try {
    incoming = new URL(`${ownUrl.protocol}//${host}`);
  } catch {
    return reply({ message: "This request is not allowed." }, 403);
  }
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(ownUrl.hostname) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(incoming.hostname) ||
    incoming.host !== host ||
    incoming.port !== ownUrl.port ||
    request.headers.get("origin") !== incoming.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return reply({ message: "This request is not allowed." }, 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    return reply({ message: "Use a JSON request." }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ message: "Enter a website URL." }, 400);
  let body: unknown;
  const timeout = setTimeout(() => {
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 4096) {
        await reader.cancel();
        return reply({ message: "Request is too large." }, 413);
      }
      chunks.push(next.value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply({ message: "Enter a valid website URL." }, 400);
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("targetUrl" in body) ||
    typeof body.targetUrl !== "string" ||
    Object.keys(body).some((key) => key !== "targetUrl")
  )
    return reply({ message: "Enter a valid website URL." }, 400);
  admission.starts = admission.starts.filter((start) => Date.now() - start < 60000);
  if (admission.active || admission.starts.length >= 6)
    return reply(
      {
        message:
          "An investigation is already running or the local request limit was reached. Please try again shortly.",
      },
      429,
    );
  admission.active = true;
  admission.starts.push(Date.now());
  try {
    const outcome = await new DeterministicScanRunner().run(
      {
        targetUrl: body.targetUrl,
        maxPages: SCAN_LIMITS.maxPages,
        timeoutMs: SCAN_LIMITS.scanTimeoutMs,
      },
      request.signal,
    );
    if (outcome.status !== "completed")
      return reply({ message: outcome.message }, outcome.status === "rejected" ? 400 : 422);
    const id = await saveReport(outcome.report);
    return reply({ id }, 201);
  } catch {
    return reply({ message: "The investigation could not be saved. Please try again." }, 500);
  } finally {
    admission.active = false;
  }
}
