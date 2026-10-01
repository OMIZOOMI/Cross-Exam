import { describe, expect, it } from "vitest";
import { discoveredUrl, navigationalUrl, referenceUrl } from "./crawl-policy";

describe("conservative navigation policy (separate from destination authorization)", () => {
  it.each([
    "/about",
    "../about",
    "https://example.com/about",
    "//example.com/about",
    "/about#section",
  ])("normalizes eligible navigation %s", (value) => {
    expect(discoveredUrl(value, "https://example.com/docs/", "https://example.com")).toBe(
      "https://example.com/about",
    );
  });
  it.each([
    "#section",
    "",
    "/about?x=1",
    "https://other.com/about",
    "https://sub.example.com/",
    "http://example.com/about",
    "https://example.com:80/about",
    "mailto:person@example.com",
    "tel:123",
    "javascript:alert(1)",
    "file:///tmp/a",
    "/a.pdf",
    "/image.svg",
    "/bundle.js",
    "/logout",
    "/sign-out",
    "/delete/thing",
    "/account/remove",
    "/api/posts",
    "/oauth/callback",
    "/revoke-token",
    "/DELETE.php",
    "/unsubscribe",
    "/destroy",
    "/%64elete",
    "/a%2flogout",
    "/%2564elete",
    "/foo;delete",
    "https://@example.com/",
    "https://%65xample.com/",
    "/a\\b",
    " /about",
  ])("rejects %s before requesting", (value) => {
    expect(discoveredUrl(value, "https://example.com/", "https://example.com")).toBeNull();
  });
  it("uses the shared egress URL policy for initial destinations", () => {
    for (const url of [
      "https://localhost",
      "https://127.0.0.1",
      "https://example.com:8080",
      " https://example.com",
    ])
      expect(navigationalUrl(url)).toBeNull();
  });
  it("redacts reference query secrets and never accepts executable protocols or credentials", () => {
    expect(referenceUrl("/image.png?token=secret#x", "https://example.com")).toBe(
      "https://example.com/image.png",
    );
    expect(referenceUrl("data:text/html,attack", "https://example.com")).toBeNull();
    expect(referenceUrl("https://user:secret@example.com/", "https://example.com")).toBeNull();
  });
});
