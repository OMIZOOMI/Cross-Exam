import { validateAnswers } from "./dns";
import {
  EgressError,
  type HopRecord,
  type PinnedTransport,
  type RequestOptions,
  type RequestResult,
  type ResolveHost,
  redirectStatuses,
} from "./types";
import { hasForbiddenUrlCharacters, validateTargetUrl } from "./url-policy";

function within(value: number, ceiling: number, floor = 1): boolean {
  return Number.isSafeInteger(value) && value >= floor && value <= ceiling;
}

/** Internal test seam. Production callers receive safeRequest, with fixed DNS and transport. */
export async function executeRequest(
  input: unknown,
  options: RequestOptions,
  dependencies: { resolve: ResolveHost; transport: PinnedTransport },
): Promise<RequestResult> {
  const history: HopRecord[] = [];
  const deniedOptions: RequestResult = {
    ok: false,
    reason: "INVALID_OPTIONS",
    stage: "input",
    hop: 0,
    history,
  };
  if (
    !options ||
    typeof options !== "object" ||
    Object.keys(options).some(
      (key) =>
        ![
          "method",
          "signal",
          "timeoutMs",
          "maxBodyBytes",
          "maxRedirects",
          "allowRedirect",
        ].includes(key),
    )
  )
    return deniedOptions;
  const {
    method = "GET",
    timeoutMs = 10000,
    maxBodyBytes = 1024 * 1024,
    maxRedirects = 5,
    signal,
    allowRedirect,
  } = options;
  if (
    !["GET", "HEAD"].includes(method) ||
    !within(timeoutMs, 30000) ||
    !within(maxBodyBytes, 1024 * 1024) ||
    !within(maxRedirects, 5, 0) ||
    (allowRedirect !== undefined && typeof allowRedirect !== "function") ||
    (signal !== undefined && !(signal instanceof AbortSignal))
  )
    return deniedOptions;
  let target = validateTargetUrl(input);
  if (!target.ok) return { ...target, hop: 0, history };
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new EgressError("REQUEST_TIMEOUT", "connection")),
    timeoutMs,
  );
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let hop = 0;
  const visited = new Set<string>();
  async function run(): Promise<RequestResult> {
    while (target.ok) {
      combined.throwIfAborted();
      if (visited.has(target.url)) throw new EgressError("REDIRECT_LOOP", "redirect");
      visited.add(target.url);
      let answers: Awaited<ReturnType<ResolveHost>>;
      try {
        answers = await dependencies.resolve(target.hostname, combined);
      } catch (error) {
        if (error instanceof EgressError) throw error;
        throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
      }
      combined.throwIfAborted();
      const addresses = validateAnswers(answers);
      const pin = addresses[0];
      if (!pin) throw new EgressError("DNS_RESOLUTION_FAILED", "dns");
      const response = await dependencies.transport(target, pin, {
        method,
        signal: combined,
        maxBodyBytes,
      });
      combined.throwIfAborted();
      history.push({
        url: target.url,
        address: pin.address,
        family: pin.family,
        statusCode: response.statusCode,
      });
      if (!redirectStatuses.has(response.statusCode)) {
        return { ok: true, url: target.url, ...response, history: [...history] };
      }
      if (hop >= maxRedirects) throw new EgressError("REDIRECT_LIMIT", "redirect");
      const location = response.headers.location;
      if (!location || location.length > 2048 || hasForbiddenUrlCharacters(location)) {
        throw new EgressError("INVALID_REDIRECT", "redirect");
      }
      let next: string;
      try {
        // Preserve raw absolute authorities for userinfo/percent-escape checks before URL normalizes them.
        next = /^[a-z][a-z\d+.-]*:/i.test(location)
          ? location
          : location.startsWith("//")
            ? `${target.protocol}${location}`
            : new URL(location, target.url).href;
      } catch {
        throw new EgressError("INVALID_REDIRECT", "redirect");
      }
      const previousProtocol = target.protocol;
      target = validateTargetUrl(next);
      hop++;
      if (!target.ok)
        return {
          ok: false,
          reason: "UNSAFE_REDIRECT",
          cause: target.reason,
          stage: "redirect",
          hop,
          history: [...history],
        };
      if (previousProtocol === "https:" && target.protocol !== "https:") {
        throw new EgressError("HTTPS_DOWNGRADE", "redirect");
      }
      if (allowRedirect) {
        let permitted = false;
        try {
          permitted = allowRedirect(target.url) === true;
        } catch {
          /* Fail closed. */
        }
        if (!permitted) throw new EgressError("REDIRECT_POLICY", "redirect");
      }
    }
    throw new EgressError("REQUEST_FAILED", "connection");
  }
  let onAbort: (() => void) | undefined;
  try {
    if (combined.aborted) combined.throwIfAborted();
    // The race also bounds a faulty dependency that does not honor cancellation. Production dependencies cancel I/O.
    const abort = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(combined.reason);
      combined.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([run(), abort]);
  } catch (error) {
    const failure = combined.aborted
      ? new EgressError(controller.signal.aborted ? "REQUEST_TIMEOUT" : "ABORTED", "connection")
      : error instanceof EgressError
        ? error
        : new EgressError("REQUEST_FAILED", "connection");
    const unsafeRedirect = hop > 0 && failure.stage === "dns";
    return {
      ok: false,
      reason: unsafeRedirect ? "UNSAFE_REDIRECT" : failure.reason,
      stage: unsafeRedirect ? "redirect" : failure.stage,
      hop,
      ...(unsafeRedirect ? { cause: failure.reason } : {}),
      ...(failure.classification ? { classification: failure.classification } : {}),
      history: [...history],
    };
  } finally {
    clearTimeout(deadline);
    if (onAbort) combined.removeEventListener("abort", onAbort);
  }
}
