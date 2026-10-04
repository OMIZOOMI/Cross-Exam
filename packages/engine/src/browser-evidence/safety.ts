import {
  BROWSER_SAFE_HEADERS,
  type BrowserEvidenceCollection,
  BROWSER_EVIDENCE_LIMITS as L,
} from "@crossexam/contracts";

type Retention = BrowserEvidenceCollection["truncation"];

/** Privacy filtering, never network authorization. Free text is not a complete DLP system. */
export function safeText(value: string, retention: Retention, limit = L.text): string {
  // Work on a bounded prefix even for hostile multi-megabyte console output.
  let output = value.slice(0, 4096).replace(/[\p{Cc}\p{Cf}]/gu, " ");
  output = output
    .replace(
      /\b(?:https?|wss?):\/\/[^\s<>"']+/gi,
      (match) => safeObservedUrl(match, retention) ?? "[URL omitted]",
    )
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+/gi, "[credential redacted]")
    .replace(
      /\b(?:password|passwd|token|api[_-]?key|secret|authorization|cookie|set-cookie|proxy-authorization)\b\s*[=:]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      "[credential redacted]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[credential redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]");
  if (output !== value.slice(0, 4096)) retention.redactedFields++;
  if (value.length > 4096 || output.length > limit) retention.shortenedStrings++;
  return output.slice(0, limit);
}

export function safeObservedUrl(value: string, retention: Retention): string | null {
  if (value.length > 4096) {
    retention.omittedUrls++;
    return null;
  }
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported observation");
    if (url.username || url.password || url.search || url.hash) retention.redactedFields++;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    // Omit likely credential-bearing path segments rather than retain opaque identifiers.
    url.pathname = url.pathname
      .split("/")
      .map((part, index, parts) =>
        /^(?:token|secret|password|api[-_]?key|auth)$/i.test(parts[index - 1] ?? "") ||
        part.length > 64 ||
        /(?:token|secret|password|api[-_]?key)=/i.test(part)
          ? "[redacted]"
          : part,
      )
      .join("/");
    const output = url.href;
    if (output.length > L.url) {
      retention.omittedUrls++;
      return null;
    }
    if (output !== value && !value.includes("?") && !value.includes("#"))
      retention.redactedFields++;
    return output;
  } catch {
    retention.omittedUrls++;
    return null;
  }
}

export function safeHeaders(
  input: Record<string, string>,
  retention: Retention,
): Record<string, string> {
  const output: Record<string, string> = {};
  const allowed = new Set<string>(BROWSER_SAFE_HEADERS);
  for (const name of Object.keys(input))
    if (!allowed.has(name.toLowerCase())) retention.omittedHeaders++;
  // Stable allowlist order, independent of response header insertion order.
  for (const name of BROWSER_SAFE_HEADERS) {
    const value = input[name];
    if (value === undefined) continue;
    const withoutNonce = value.replace(/'nonce-[^']*'/gi, "'nonce-[redacted]'");
    if (withoutNonce !== value) retention.redactedFields++;
    output[name] = safeText(withoutNonce, retention, L.headerValue);
  }
  return output;
}

/** Keep only stable browser error codes; never persist raw network error/exception stacks. */
export function safeFailure(value: string | null | undefined): string {
  return (
    /\b(?:ERR_[A-Z0-9_]{1,64}|NS_ERROR_[A-Z0-9_]{1,64})\b/.exec(value ?? "")?.[0] ??
    "REQUEST_FAILED"
  );
}
