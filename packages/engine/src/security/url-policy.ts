/** Browser-safe early policy only. An accepted URL is NOT permission to connect. */
export type TargetReason =
  | "INVALID_INPUT"
  | "MALFORMED_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "CREDENTIALS_NOT_ALLOWED"
  | "PORT_NOT_ALLOWED"
  | "LOCAL_HOSTNAME"
  | "IP_LITERAL_NOT_ALLOWED"
  | "INVALID_HOSTNAME";

export type ParsedTarget = Readonly<{
  ok: true;
  url: string;
  hostname: string;
  protocol: "http:" | "https:";
  port: 80 | 443;
}>;
export type TargetDecision = ParsedTarget | { ok: false; reason: TargetReason; stage: "input" };

// Includes local naming conventions and reserved namespaces. DNS remains authoritative.
const localSuffixes = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "test",
  "invalid",
  "example",
  "onion",
  "arpa",
];
const metadataNames = ["metadata.google.internal", "metadata.goog", "instance-data.ec2.internal"];

export function hasForbiddenUrlCharacters(value: string): boolean {
  return /[\s\p{Cc}\p{Cf}\\]/u.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value);
}

export function validateTargetUrl(input: unknown): TargetDecision {
  const deny = (reason: TargetReason): TargetDecision => ({ ok: false, reason, stage: "input" });
  if (
    typeof input !== "string" ||
    !input ||
    input.length > 2048 ||
    hasForbiddenUrlCharacters(input)
  ) {
    return deny("INVALID_INPUT");
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return deny("MALFORMED_URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return deny("UNSUPPORTED_PROTOCOL");
  // WHATWG repairs missing slashes/backslashes and decodes hosts; reject those ambiguities first.
  const authority = /^https?:\/\/([^/?#]+)/i.exec(input)?.[1];
  if (!authority) return deny("MALFORMED_URL");
  if (url.username || url.password || authority.includes("@"))
    return deny("CREDENTIALS_NOT_ALLOWED");
  if (authority.includes("%")) return deny("INVALID_HOSTNAME");
  if (url.port && url.port !== "80" && url.port !== "443") return deny("PORT_NOT_ALLOWED");
  const hostname = url.hostname.toLowerCase();
  // The URL parser canonicalizes numeric, octal, hex, and shortened IPv4 before this check.
  if (hostname.startsWith("[") || /^[\d.]+$/.test(hostname)) return deny("IP_LITERAL_NOT_ALLOWED");
  if (authority.includes(":") && !/:(80|443)$/.test(authority)) return deny("PORT_NOT_ALLOWED");
  const withoutFinalDot = hostname.replace(/\.$/, "");
  if (
    localSuffixes.some(
      (suffix) => withoutFinalDot === suffix || withoutFinalDot.endsWith(`.${suffix}`),
    ) ||
    metadataNames.some(
      (name) => withoutFinalDot === name || withoutFinalDot.endsWith(`.${name}`),
    ) ||
    !withoutFinalDot.includes(".")
  )
    return deny("LOCAL_HOSTNAME");
  const labels = hostname.split(".");
  if (
    hostname.length > 253 ||
    hostname.endsWith(".") ||
    labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
    !/^[a-z]/.test(labels.at(-1) ?? "")
  )
    return deny("INVALID_HOSTNAME");
  url.hash = "";
  return Object.freeze({
    ok: true,
    url: url.href,
    hostname,
    protocol: url.protocol,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)) as 80 | 443,
  });
}
