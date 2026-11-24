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

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);

function sameOrigin(request: Request, publicOrigin: string | undefined) {
  const { headers } = request;
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const host = headers.get("host");
  if (!host) return false;
  const origin = headers.get("origin");

  if (publicOrigin !== undefined) {
    const expected = URL.parse(publicOrigin);
    if (
      expected?.protocol !== "https:" ||
      expected.origin !== publicOrigin ||
      origin !== publicOrigin
    )
      return false;

    const forwardedHost = headers.get("x-forwarded-host");
    if (forwardedHost !== null && forwardedHost !== expected.host) return false;
    if (host === expected.host) return true;

    // Prefer the original Host. Only accept a proxy-supplied public authority
    // instead when the original authority is a local upstream address.
    const upstream = URL.parse(`http://${host}`);
    return (
      forwardedHost === expected.host &&
      upstream?.host === host &&
      (loopback.has(upstream.hostname) || upstream.hostname === "0.0.0.0")
    );
  }

  const ownUrl = new URL(request.url);
  // Next normalizes loopback request URLs to localhost. Validate the original Host
  // against a strict local allowlist, then compare the browser's exact Origin.
  const incoming = URL.parse(`${ownUrl.protocol}//${host}`);
  return (
    loopback.has(ownUrl.hostname) &&
    incoming?.host === host &&
    loopback.has(incoming.hostname) &&
    incoming.port === ownUrl.port &&
    origin === incoming.origin
  );
}

/** Single-instance Node adapter. One active scan per process. */
export async function handleScan(request: Request): Promise<Response> {
  const publicOrigin = process.env.VEYRA_PUBLIC_ORIGIN;
  if (!sameOrigin(request, publicOrigin))
    return reply({ message: "This request is not allowed." }, 403);
  const invalidBody = (message: string, localStatus = 400) =>
    reply({ message }, publicOrigin === undefined ? localStatus : 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    return invalidBody("Use a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) return invalidBody("Enter a website URL.");
  let body: unknown;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
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
        return invalidBody("Request is too large.", 413);
      }
      chunks.push(next.value);
    }
    if (timedOut && publicOrigin !== undefined)
      return invalidBody("The request took too long. Please try again.");
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return invalidBody("Enter a valid website URL.");
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
    return invalidBody("Enter a valid website URL.");
  admission.starts = admission.starts.filter((start) => Date.now() - start < 60000);
  if (admission.active || admission.starts.length >= 6)
    return reply(
      {
        message: `An investigation is already running or the ${publicOrigin === undefined ? "local " : ""}request limit was reached. Please try again shortly.`,
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
