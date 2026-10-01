import { ScanReportSchema } from "@crossexam/contracts";
import { safeRequest } from "@crossexam/engine/security";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRequest } from "../../../packages/engine/src/security/request-core";
import {
  EgressError,
  type PinnedTransport,
  type ResolveHost,
} from "../../../packages/engine/src/security/types";
import { investigate } from "./investigate";
import { SCAN_LIMITS } from "./limits";

vi.mock("@crossexam/engine/security", () => ({ safeRequest: vi.fn() }));
const healthy =
  '<html lang="en"><head><title>Healthy</title><meta name="description" content="A document"><meta name="viewport" content="width=device-width"><link rel="canonical" href="/"></head><body><h1>Hello</h1><img src="/image.png" alt=""></body></html>';
type Fixture = {
  body?: string;
  status?: number;
  headers?: Record<string, string>;
  failure?: string;
  pending?: boolean;
};
let site: Record<string, Fixture>;
let transport: ReturnType<typeof vi.fn<PinnedTransport>>;
let resolve: ReturnType<typeof vi.fn<ResolveHost>>;
beforeEach(() => {
  site = {
    "/": {
      body: healthy.replace(
        "</body>",
        '<a href="/about">About</a><a href="/broken">Broken</a></body>',
      ),
    },
    "/about": { body: healthy },
    "/broken": { status: 404, body: "<title>Not found</title>" },
  };
  resolve = vi.fn<ResolveHost>(async () => [{ address: "93.184.216.34", family: 4 }]);
  transport = vi.fn<PinnedTransport>(async (target, _pin, options) => {
    const fixture = site[target.url] ??
      site[new URL(target.url).pathname] ?? { status: 404, body: "Missing" };
    if (fixture.pending)
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      );
    if (fixture.failure) throw new Error(fixture.failure);
    const body = Buffer.from(fixture.body ?? "");
    if (body.length > options.maxBodyBytes) throw new EgressError("RESPONSE_TOO_LARGE", "response");
    return {
      statusCode: fixture.status ?? 200,
      headers: {
        "content-type": "text/html;charset=utf-8",
        "content-security-policy": "default-src 'self'",
        "set-cookie": "private-cookie",
        ...fixture.headers,
      },
      body,
    };
  });
  vi.mocked(safeRequest)
    .mockReset()
    .mockImplementation((url, options = {}) =>
      executeRequest(url, options, { resolve, transport }),
    );
});
afterEach(() => vi.useRealTimers());
async function run(maxPages = 8, targetUrl = "https://example.com/") {
  const outcome = await investigate({ targetUrl, maxPages, timeoutMs: 45000 });
  if (outcome.status !== "completed") throw new Error(`Unexpected ${outcome.status}`);
  expect(ScanReportSchema.safeParse(outcome.report).success).toBe(true);
  return outcome.report;
}
const requestedPaths = () => transport.mock.calls.map(([target]) => new URL(target.url).pathname);

describe("real collector through deterministic DNS/transport fixtures", () => {
  it("builds evidence, rules and actual link relationships with no browser/agent data", async () => {
    const report = await run();
    expect(report.summary).toMatchObject({ source: "live", pageCount: 3, status: "completed" });
    expect(report.pages[0]).toMatchObject({
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      title: "Healthy",
      statusCode: 200,
      linksTo: ["P-2", "P-3"],
      depth: 0,
    });
    expect(
      report.evidence.every(
        (item) =>
          item.provenance === "OBSERVED" && item.source === "live" && item.code && item.data,
      ),
    ).toBe(true);
    expect(report.findings.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Document returned HTTP 404",
        "Fetched pages share a document title",
      ]),
    );
    expect(report.findings.every((item) => item.provenance === "DERIVED")).toBe(true);
    expect(report.agentRuns).toEqual([]);
    expect(report.experiments).toEqual([]);
    expect(report.challenges).toEqual([]);
    expect(report.metrics).toEqual([]);
    expect(JSON.stringify(report)).not.toMatch(
      /private-cookie|93\.184\.216\.34|4\.2 seconds|hero paints|acme\.example/,
    );
    expect(requestedPaths()).toEqual(["/", "/robots.txt", "/sitemap.xml", "/about", "/broken"]);
    expect(report.investigation?.requestCount).toBe(5);
  });
  it("never requests declared resources, forms, downloads, external links or actions", async () => {
    site["/"] = {
      body:
        healthy +
        '<a href="/a.pdf">PDF</a><a href="/download" download>Download</a><a href="https://other.com/">Other</a><a href="/logout">Logout</a><a href="/page?x=1">Query</a><script src="https://cdn.example.com/a.js"></script><form action="/delete"></form>',
    };
    await run();
    expect(requestedPaths()).toEqual(["/", "/robots.txt", "/sitemap.xml"]);
  });
  it("caps eight attempts and ten requests, preserves deduplication and sequential execution", async () => {
    site["/"] = {
      body:
        healthy +
        Array.from(
          { length: 30 },
          (_, i) => `<a href="/p${i}">x</a><a href="/p${i}#fragment">same</a>`,
        ).join(""),
    };
    for (let i = 0; i < 30; i++) site[`/p${i}`] = { body: healthy };
    const report = await run(20);
    expect(report.pages).toHaveLength(8);
    expect(vi.mocked(safeRequest)).toHaveBeenCalledTimes(10);
    expect(new Set(requestedPaths()).size).toBe(10);
    expect(report.investigation?.notes.join(" ")).toContain("page or time limit");
    expect(
      vi
        .mocked(safeRequest)
        .mock.calls.every(
          ([, options]) =>
            options?.method === "GET" &&
            options.maxBodyBytes !== undefined &&
            options.maxBodyBytes <= SCAN_LIMITS.maxBodyBytes &&
            options.maxRedirects === 5 &&
            options.allowRedirect,
        ),
    ).toBe(true);
  });
  it("enforces depth two", async () => {
    site["/"] = { body: `${healthy}<a href="/one">One</a>` };
    site["/one"] = { body: `${healthy}<a href="/two">Two</a>` };
    site["/two"] = { body: `${healthy}<a href="/three">Three</a>` };
    const report = await run();
    expect(report.pages.map((page) => page.depth)).toEqual([0, 1, 2]);
    expect(requestedPaths()).not.toContain("/three");
  });
  it("adopts the approved initial final origin without crawling siblings or the original host", async () => {
    site["https://example.com/"] = {
      status: 302,
      headers: { location: "https://www.example.com/" },
    };
    site["https://www.example.com/"] = {
      body:
        healthy +
        '<a href="/about">About</a><a href="https://example.com/original">Old</a><a href="https://sub.example.com/sibling">Sibling</a>',
    };
    const report = await run();
    expect(report.investigation?.finalOrigin).toBe("https://www.example.com");
    expect(report.pages[0]?.redirectCount).toBe(1);
    expect(transport.mock.calls.map(([target]) => target.url)).not.toEqual(
      expect.arrayContaining(["https://example.com/original", "https://sub.example.com/sibling"]),
    );
  });
  it.each([
    "https://other.com/page",
    "https://example.com/logout",
    "https://example.com/page?token=x",
    "http://127.0.0.1/",
  ])("blocks discovered-page redirect %s before the second destination", async (location) => {
    site["/about"] = { status: 302, headers: { location } };
    const report = await run();
    expect(report.summary.status).toBe("partial");
    expect(report.evidence.some((item) => item.code === "FETCH_FAILURE")).toBe(true);
    expect(transport.mock.calls.map(([target]) => target.url)).not.toContain(location);
    expect(report.pages.map((page) => page.path)).toContain("/broken");
  });
  it("handles safe relative redirects and collapses aliases without inventing graph edges", async () => {
    site["/about"] = { status: 302, headers: { location: "/destination" } };
    site["/destination"] = { body: healthy };
    const report = await run();
    expect(report.pages[1]).toMatchObject({
      requestedUrl: "https://example.com/about",
      finalUrl: "https://example.com/destination",
      redirectCount: 1,
    });
    expect(report.pages[0]?.linksTo).toContain(report.pages[1]?.id);
  });
  it("honors robots restrictions and meta nofollow", async () => {
    site["/robots.txt"] = {
      body: "User-agent: *\nDisallow: /about",
      headers: { "content-type": "text/plain" },
    };
    const report = await run();
    expect(requestedPaths()).not.toContain("/about");
    expect(report.evidence.find((item) => item.code === "ROBOTS_TXT")?.data?.disallowRules).toEqual(
      ["/about"],
    );
    site["/"] = {
      body: `${healthy}<meta name="robots" content="nofollow"><a href="/about">About</a>`,
    };
    transport.mockClear();
    await run();
    expect(requestedPaths()).toEqual(["/", "/robots.txt", "/sitemap.xml"]);
  });
  it("does not expand crawl if robots cannot be established", async () => {
    site["/robots.txt"] = { failure: "unavailable internal details" };
    const report = await run();
    expect(report.summary.status).toBe("partial");
    expect(report.pages).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain("internal details");
  });
  it("uses bounded sitemap hints without external/index recursion", async () => {
    site["/sitemap.xml"] = {
      headers: { "content-type": "application/xml" },
      body: "<urlset><url><loc>https://example.com/hint</loc></url><url><loc>https://other.com/outside</loc></url></urlset>",
    };
    site["/hint"] = { body: healthy };
    const report = await run();
    expect(report.pages.map((page) => page.path)).toContain("/hint");
    expect(transport.mock.calls.some(([target]) => target.hostname === "other.com")).toBe(false);
    expect(report.pages[0]?.linksTo).not.toContain(
      report.pages.find((page) => page.path === "/hint")?.id,
    );
  });
  it("retains completed observations after a timeout", async () => {
    vi.useFakeTimers();
    site["/about"] = { pending: true };
    const pending = run();
    await vi.advanceTimersByTimeAsync(8001);
    const report = await pending;
    expect(report.summary.status).toBe("partial");
    expect(report.pages.map((page) => page.path)).toEqual(["/", "/broken"]);
  });
  it("enforces the whole-scan deadline and cancellation without continuing requests", async () => {
    vi.useFakeTimers();
    site["/about"] = { pending: true };
    const pending = investigate({
      targetUrl: "https://example.com/",
      maxPages: 8,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1001);
    const outcome = await pending;
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") expect(outcome.report.summary.status).toBe("partial");
    expect(requestedPaths()).not.toContain("/broken");
    vi.mocked(safeRequest).mockClear();
    expect(
      await investigate(
        { targetUrl: "https://example.com", maxPages: 8, timeoutMs: 1000 },
        AbortSignal.abort(),
      ),
    ).toMatchObject({ status: "failed", code: "CANCELLED" });
    expect(safeRequest).not.toHaveBeenCalled();
  });
  it("preserves useful entry evidence when conventional metadata exhausts the deadline", async () => {
    vi.useFakeTimers();
    site["/robots.txt"] = { pending: true };
    const pending = investigate({
      targetUrl: "https://example.com/",
      maxPages: 8,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(1001);
    const outcome = await pending;
    expect(outcome.status).toBe("completed");
    if (outcome.status === "completed") expect(outcome.report.pages).toHaveLength(1);
  });
  it.each([
    "https://localhost",
    "https://example.com/logout",
    "https://example.com/?secret=x",
    " https://example.com",
  ])("denies initial input without networking %s", async (targetUrl) => {
    expect(await investigate({ targetUrl, maxPages: 8, timeoutMs: 1000 })).toMatchObject({
      status: "rejected",
    });
    expect(safeRequest).not.toHaveBeenCalled();
  });
  it("rejects private DNS while retaining the existing gate", async () => {
    resolve.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    expect(
      await investigate({ targetUrl: "https://example.com", maxPages: 8, timeoutMs: 1000 }),
    ).toMatchObject({ status: "rejected" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("handles initial DNS, TLS/network, and body-size failures without leaking internals", async () => {
    for (const failure of ["TLS private cert detail", "DNS internal server", "oversized"]) {
      site["/"] =
        failure === "oversized" ? { body: "x".repeat(SCAN_LIMITS.maxBodyBytes + 1) } : { failure };
      const outcome = await investigate({
        targetUrl: "https://example.com",
        maxPages: 8,
        timeoutMs: 1000,
      });
      expect(outcome).toMatchObject({ status: "failed" });
      expect(JSON.stringify(outcome)).not.toContain(failure);
    }
  });
});

describe("deterministic rules: positive and negative evidence", () => {
  it("emits no findings for the fully declared healthy document", async () => {
    site["/"] = { body: healthy };
    expect((await run(1)).findings).toEqual([]);
  });
  it.each([
    ["Page title is missing", "<title>Healthy</title>", "<title> </title>"],
    ["Meta description is missing", '<meta name="description" content="A document">', ""],
    ["Document language is undeclared", 'lang="en"', ""],
    ["Viewport metadata is missing", '<meta name="viewport" content="width=device-width">', ""],
    ["Images omit the alt attribute", 'alt=""', ""],
    [
      "Canonical reference is empty or unsupported",
      'rel="canonical" href="/"',
      'rel="canonical" href="javascript:bad"',
    ],
    [
      "HTTPS HTML declares HTTP resources",
      'src="/image.png"',
      'src="http://example.com/image.png"',
    ],
  ])("derives %s only from matching evidence", async (title, before, after) => {
    site["/"] = { body: healthy.replace(before, after) };
    const report = await run(1);
    expect(report.findings.map((item) => item.title)).toEqual([title]);
    expect(
      report.findings[0]?.evidenceIds.every((id) => report.evidence.some((item) => item.id === id)),
    ).toBe(true);
  });
  it("uses the documented size threshold without a performance claim", async () => {
    site["/"] = { body: `${healthy}<!--${"x".repeat(SCAN_LIMITS.largeHtmlBytes)}-->` };
    expect((await run(1)).findings.map((item) => item.title)).toEqual([
      "HTML body exceeds 512 KiB",
    ]);
  });
  it("records absence of CSP only as an informational observation", async () => {
    site["/"] = { body: healthy, headers: { "content-security-policy": "" } };
    expect((await run(1)).findings[0]).toMatchObject({
      severity: "info",
      title: "No Content-Security-Policy response header",
    });
  });
  it("does not invent document metadata for a non-HTML response", async () => {
    site["/"] = { body: '{"data":true}', headers: { "content-type": "application/json" } };
    const report = await run(1);
    expect(report.evidence.some((item) => item.code === "DOCUMENT_METADATA")).toBe(false);
    expect(report.findings).toEqual([]);
    expect(report.investigation?.notes.join(" ")).toContain("not HTML");
  });
  it("rejects simulated/agent records in deterministic live reports", async () => {
    site["/"] = { body: healthy };
    const report = await run(1);
    const item = report.evidence[0];
    if (!item) throw new Error("Missing evidence");
    item.provenance = "SIMULATED";
    expect(ScanReportSchema.safeParse(report).success).toBe(false);
  });
});
