import { hasForbiddenUrlCharacters, validateTargetUrl } from "@crossexam/engine/url-policy";

const actions = new Set([
  "logout",
  "log-out",
  "signout",
  "sign-out",
  "delete",
  "remove",
  "unsubscribe",
  "destroy",
  "revoke",
  "login",
  "signin",
  "sign-in",
  "signup",
  "register",
  "auth",
  "oauth",
  "callback",
  "sso",
  "account",
  "admin",
  "api",
  "graphql",
  "cart",
  "checkout",
  "purchase",
  "buy",
  "pay",
  "reset",
  "activate",
  "confirm",
  "verify",
  "subscribe",
  "cancel",
  "edit",
  "update",
  "create",
  "wp-admin",
  "wp-login",
]);
const documentExtensions = new Set(["html", "htm", "xhtml", "php", "asp", "aspx"]);

/** Secondary read-only crawl guard, not destination authorization or proof a GET is harmless. */
export function navigationalUrl(input: string, origin?: string): string | null {
  const target = validateTargetUrl(input);
  if (!target.ok) return null;
  const url = new URL(target.url);
  if (url.search || (origin && url.origin !== origin)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).toLowerCase();
  } catch {
    return null;
  }
  // Reject nested escapes and separators/parameters with ambiguous server interpretation.
  if (/[%;\\\s\p{Cc}\p{Cf}]/u.test(path)) return null;
  const segments = path.split("/");
  if (
    segments.some(
      (part) => part.split(/[._-]/).some((word) => actions.has(word)) || actions.has(part),
    )
  )
    return null;
  const last = segments.at(-1) ?? "";
  if (last.includes(".") && !documentExtensions.has(last.split(".").at(-1) ?? "")) return null;
  return target.url;
}

/** Redact queries/fragments; reference URLs are observations only and never fetched here. */
export function referenceUrl(value: string | undefined, base: string): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function discoveredUrl(
  value: string | undefined,
  base: string,
  origin: string,
): string | null {
  if (!value || value.startsWith("#") || value.length > 2048 || hasForbiddenUrlCharacters(value))
    return null;
  try {
    const next = /^[a-z][a-z\d+.-]*:/i.test(value)
      ? value
      : value.startsWith("//")
        ? `${new URL(base).protocol}${value}`
        : new URL(value, base).href;
    return navigationalUrl(next, origin);
  } catch {
    return null;
  }
}
