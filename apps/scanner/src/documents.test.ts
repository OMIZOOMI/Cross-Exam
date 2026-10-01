import { describe, expect, it } from "vitest";
import { inspectHtml, inspectRobots, inspectSitemap, robotsAllows } from "./documents";
import { SCAN_LIMITS } from "./limits";

const parse = (html: string, url = "https://example.com/") =>
  inspectHtml(Buffer.from(html), "text/html; charset=utf-8", url);
describe("static document parser", () => {
  it("collects metadata, structure and resource declarations without execution", () => {
    const result = parse(
      `<html lang="en"><head><title> A &amp; B </title><meta name="DESCRIPTION" content="Summary"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><meta property="og:title" content="OG"><meta property="og:description" content="OG desc"><link rel="canonical" href="/canonical?secret=1"><link rel="stylesheet" href="/site.css"><link rel="preload" as="font" href="https://cdn.example.com/font.woff2"></head><body><h1>One</h1><h2>Two</h2><h2>Three</h2><form action="/delete"><input name="secret" value="never-store"></form><a href="/about">About</a><a href="/about">Again</a><a href="https://other.com/?secret=1">External</a><img src="http://images.example.com/a.png?token=secret"><img src="/decorative.png" alt=""><script src="/a.js"></script><script>throw new Error('never execute')</script></body></html>`,
    );
    expect(result.metadata).toMatchObject({
      title: "A & B",
      description: "Summary",
      lang: "en",
      viewport: "width=device-width",
      canonical: "https://example.com/canonical",
      canonicalStatus: "valid-reference",
      openGraphTitle: "OG",
      openGraphDescription: "OG desc",
    });
    expect(result.structure).toMatchObject({
      images: 2,
      imagesWithoutAlt: 1,
      scripts: 2,
      stylesheets: 1,
      fontPreloads: 1,
      forms: 1,
      h1: 1,
      h2: 2,
      h3: 0,
      internalLinkCount: 2,
      externalLinkCount: 1,
    });
    expect(result.navigation).toEqual(["https://example.com/about"]);
    expect(result.mixedContent).toEqual(["http://images.example.com/a.png"]);
    expect(result.mixedContentCount).toBe(1);
    expect(result.resourceHosts).toEqual(["cdn.example.com", "images.example.com"]);
    expect(result.nofollow).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/never-store|token=secret|throw new Error/);
  });
  it("honors base URLs without escaping final-origin crawl scope", () => {
    expect(parse('<base href="https://other.com/"><a href="/outside">Out</a>').navigation).toEqual(
      [],
    );
    expect(parse('<base href="/docs/"><a href="guide">Guide</a>').navigation).toEqual([
      "https://example.com/docs/guide",
    ]);
  });
  it("skips downloads, nofollow links, fragments, actions, and query navigation", () => {
    expect(
      parse(
        '<a href="/download" download>File</a><a rel="nofollow" href="/hidden">Hidden</a><a href="#part">Part</a><a href="/logout">Action</a><a href="/?token=1">Query</a>',
      ).navigation,
    ).toEqual([]);
  });
  it("tolerates malformed HTML and treats missing attributes explicitly", () => {
    const result = parse('<title>Title</title><h1>Open<p><img src="/x"><a href="/about">link');
    expect(result.metadata.title).toBe("Title");
    expect(result.metadata.lang).toBe("");
    expect(result.metadata.canonicalStatus).toBe("not-declared");
    expect(result.structure.imagesWithoutAlt).toBe(1);
  });
  it.each(["", "javascript:alert(1)", "https://user:pass@example.com"])(
    "records unusable canonical %s",
    (value) => {
      expect(parse(`<link rel="canonical" href="${value}">`).metadata.canonicalStatus).toBe(
        "invalid-reference",
      );
    },
  );
  it("bounds references and text", () => {
    const result = parse(
      `<title>${"x".repeat(2000)}</title>${Array.from({ length: 200 }, (_, i) => `<a href="/p${i}">x</a><img src="/i${i}.png">`).join("")}`,
    );
    expect(result.metadata.title).toHaveLength(SCAN_LIMITS.maxTextLength);
    expect(result.resources).toHaveLength(SCAN_LIMITS.maxReferences);
    expect(result.structure.internalLinks).toHaveLength(SCAN_LIMITS.maxReferences);
    expect(result.navigation).toHaveLength(SCAN_LIMITS.maxCandidates);
  });
  it("rejects excessive document complexity and unknown encodings", () => {
    expect(() => parse("<i></i>".repeat(SCAN_LIMITS.maxDomElements + 1))).toThrow();
    expect(() =>
      inspectHtml(Buffer.from("x"), "text/html;charset=not-an-encoding", "https://example.com"),
    ).toThrow();
  });
  it("does not call an HTTP resource mixed content on an HTTP page", () => {
    expect(
      parse('<img src="http://example.com/i.png">', "http://example.com").mixedContentCount,
    ).toBe(0);
  });
});
describe("bounded conventional metadata", () => {
  it("combines relevant disallow groups conservatively and ignores Allow exceptions", () => {
    const result = inspectRobots(
      "User-agent: *\nDisallow: /private\nAllow: /private/public\nUser-agent: Other\nDisallow: /other\nUser-agent: CrossExam\nDisallow: /hide*tail$\nSitemap: https://example.com/map.xml?token=secret",
    );
    expect(result.rules).toEqual(["/private", "/hide*tail$"]);
    expect(result.sitemaps).toEqual(["https://example.com/map.xml"]);
    expect(robotsAllows("/private/public", result.rules)).toBe(false);
    expect(robotsAllows("/hide-anything", result.rules)).toBe(false);
    expect(robotsAllows("/%70rivate", result.rules)).toBe(false);
    expect(robotsAllows("/other", result.rules)).toBe(true);
  });
  it("bounds excessive rules", () => {
    const result = inspectRobots(`User-agent: *\n${"Disallow: /x\n".repeat(300)}`);
    expect(result.exceeded).toBe(true);
    expect(result.rules).toHaveLength(SCAN_LIMITS.maxRobotsRules);
  });
  it("limits sitemap hints and rejects external/action/query URLs", () => {
    const result = inspectSitemap(
      `<urlset><url><loc>https://other.com/</loc></url><url><loc>https://example.com/logout</loc></url><url><loc>https://example.com/?x=1</loc></url>${Array.from({ length: 100 }, (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`).join("")}</urlset>`,
      "https://example.com/sitemap.xml",
    );
    expect(result.truncated).toBe(true);
    expect(result.urls).toHaveLength(SCAN_LIMITS.maxSitemapUrls - 3);
    expect(result.urls[0]).toBe("https://example.com/p0");
  });
  it("does not expand sitemap indexes or XML entities", () => {
    expect(
      inspectSitemap(
        "<sitemapindex><sitemap><loc>https://other.com/map.xml</loc></sitemap></sitemapindex>",
        "https://example.com",
      ).urls,
    ).toEqual([]);
    expect(() =>
      inspectSitemap('<!DOCTYPE x SYSTEM "file:///etc/passwd"><urlset/>', "https://example.com"),
    ).toThrow();
    expect(() => inspectSitemap('<!ENTITY x "huge"><urlset/>', "https://example.com")).toThrow();
    expect(() => inspectSitemap("<html>not sitemap</html>", "https://example.com")).toThrow();
  });
});
