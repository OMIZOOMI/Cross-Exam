import { describe, expect, it } from "vitest";
import { validateTargetUrl } from "./url-policy";

describe("V1 URL policy (no DNS or connection authority)", () => {
  it.each([
    ["https://example.com", "https://example.com/", 443],
    ["http://example.com", "http://example.com/", 80],
    ["HTTPS://EXAMPLE.COM:443/a/../b?q=1#ignored", "https://example.com/b?q=1", 443],
    ["http://example.com:443/path", "http://example.com:443/path", 443],
    ["https://example.com:80/path", "https://example.com:80/path", 80],
    ["https://bücher.de/über", "https://xn--bcher-kva.de/%C3%BCber", 443],
    ["https://localhost.example.com", "https://localhost.example.com/", 443],
    ["https://example.com/a%20b?q=%40", "https://example.com/a%20b?q=%40", 443],
  ])("normalizes %s", (input, url, port) => {
    expect(validateTargetUrl(input)).toMatchObject({ ok: true, url, port });
  });
  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "data:text/plain,hello",
    "javascript:alert(1)",
    "blob:https://example.com/id",
    "ws://example.com",
    "wss://example.com",
    "gopher://example.com",
  ])("denies protocol %s", (input) =>
    expect(validateTargetUrl(input)).toMatchObject({ ok: false, reason: "UNSUPPORTED_PROTOCOL" }),
  );
  it.each([
    "https://u:p@example.com",
    "https://user@example.com",
    "https://@example.com",
    "https://:@example.com",
    "https://public.com@localhost",
    "https://%75ser@example.com",
  ])("denies userinfo %s", (input) =>
    expect(validateTargetUrl(input)).toMatchObject({
      ok: false,
      reason: "CREDENTIALS_NOT_ALLOWED",
    }),
  );
  it.each([
    "http://127.0.0.1",
    "https://8.8.8.8",
    "http://0",
    "http://2130706433",
    "http://0177.0.0.1",
    "http://0x7f000001",
    "http://127.1",
    "http://127.0.1",
    "http://127.0.0.1.",
    "http://[::1]",
    "http://[::]",
    "https://[2606:4700:4700::1111]",
    "http://[::ffff:127.0.0.1]",
    "http://[::ffff:7f00:1]",
  ])("denies every IP target %s", (input) =>
    expect(validateTargetUrl(input)).toMatchObject({ ok: false, reason: "IP_LITERAL_NOT_ALLOWED" }),
  );
  it.each([
    "localhost",
    "LOCALHOST.",
    "a.localhost",
    "printer.local",
    "service.internal",
    "router.lan",
    "server.home",
    "host.localdomain",
    "test.invalid",
    "test.example",
    "internal",
    "site.onion",
    "metadata.google.internal",
    "metadata.goog",
    "localhost。",
    "ＬＯＣＡＬＨＯＳＴ",
  ])("denies local/reserved host %s", (host) =>
    expect(validateTargetUrl(`http://${host}`)).toMatchObject({
      ok: false,
      reason: "LOCAL_HOSTNAME",
    }),
  );
  it.each([
    "http://example.com:22",
    "https://example.com:3000",
    "https://example.com:8080",
    "https://example.com:0",
    "https://example.com:",
    "https://example.com:00080",
  ])("denies non-web port %s", (input) =>
    expect(validateTargetUrl(input)).toMatchObject({ ok: false, reason: "PORT_NOT_ALLOWED" }),
  );
  it.each([
    undefined,
    null,
    123,
    {},
    "",
    "not a URL",
    "//example.com",
    "https:example.com",
    "https:///example.com",
    "https://",
    "http://[fe80::1%25en0]",
    "http://999.1.1.1",
    "https://example.com:65536",
    "https://example..com",
    "https://example.com.",
    "https://-bad.example.com",
    "https://foo_bar.com",
    "https://%65xample.com",
    "https://example%2ecom",
    "https://example.com\\@localhost",
    "https://exam\nple.com",
    "\thttps://example.com",
    "https://example.com ",
    "https://example.com/\u0000",
    "https://examp\u202ele.com",
    "https://exam\u200bple.com",
    "https://example.com/%0d%0aHost:localhost",
    `https://${"a".repeat(64)}.com`,
    `https://example.com/${"a".repeat(2048)}`,
  ])("rejects malformed or ambiguous input %#", (input) =>
    expect(validateTargetUrl(input).ok).toBe(false),
  );
});
