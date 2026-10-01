import { load } from "cheerio/slim";
import { discoveredUrl, referenceUrl } from "./crawl-policy";
import { SCAN_LIMITS } from "./limits";

export function compact(value: string | undefined, max = SCAN_LIMITS.maxTextLength): string {
  return (value ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
export function decode(body: Uint8Array, contentType: string): string {
  const charset = /charset\s*=\s*["']?([a-z\d_-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  return new TextDecoder(charset).decode(body);
}

export function inspectHtml(body: Uint8Array, contentType: string, finalUrl: string) {
  const $ = load(decode(body, contentType));
  const elements = $("*").length;
  if (elements > SCAN_LIMITS.maxDomElements) throw new Error("Document complexity limit");
  const origin = new URL(finalUrl).origin;
  const rawBase = $("base[href]").first().attr("href");
  const base = referenceUrl(rawBase, finalUrl) ?? finalUrl;
  const meta: Record<string, string> = {};
  let nofollow = false;
  $("meta").each((_i, node) => {
    const key = ($(node).attr("name") ?? $(node).attr("property") ?? "").toLowerCase();
    if (key === "robots" && /\b(nofollow|none)\b/i.test($(node).attr("content") ?? ""))
      nofollow = true;
    if (
      ["description", "robots", "viewport", "og:title", "og:description"].includes(key) &&
      !meta[key]
    )
      meta[key] = compact($(node).attr("content"));
  });
  const canonical = $("link")
    .toArray()
    .find((node) => $(node).attr("rel")?.toLowerCase().split(/\s+/).includes("canonical"));
  const navigation: string[] = [];
  const internal: string[] = [];
  const external: string[] = [];
  let internalCount = 0;
  let externalCount = 0;
  $("a[href], area[href]").each((_i, node) => {
    const raw = $(node).attr("href");
    const reference = referenceUrl(raw, base);
    if (!reference) return;
    const same = new URL(reference).origin === origin;
    const list = same ? internal : external;
    if (same) internalCount++;
    else externalCount++;
    if (list.length < SCAN_LIMITS.maxReferences && !list.includes(reference)) list.push(reference);
    if (
      $(node).attr("download") !== undefined ||
      $(node).attr("rel")?.toLowerCase().split(/\s+/).includes("nofollow")
    )
      return;
    const candidate = discoveredUrl(raw, base, origin);
    if (
      candidate &&
      navigation.length < SCAN_LIMITS.maxCandidates &&
      !navigation.includes(candidate)
    )
      navigation.push(candidate);
  });
  const resources: string[] = [];
  const mixedContent: string[] = [];
  let mixedContentCount = 0;
  const resourceHosts = new Set<string>();
  $("script[src], img[src], source[src], link[href]").each((_i, node) => {
    const element = $(node);
    if (
      node.name === "link" &&
      !/\b(stylesheet|preload|modulepreload|icon)\b/i.test(element.attr("rel") ?? "")
    )
      return;
    const url = referenceUrl(element.attr("src") ?? element.attr("href"), base);
    if (!url) return;
    if (new URL(finalUrl).protocol === "https:" && new URL(url).protocol === "http:") {
      mixedContentCount++;
      if (mixedContent.length < SCAN_LIMITS.maxReferences && !mixedContent.includes(url))
        mixedContent.push(url);
    }
    if (resources.length < SCAN_LIMITS.maxReferences && !resources.includes(url))
      resources.push(url);
    const hostname = new URL(url).hostname;
    if (hostname !== new URL(finalUrl).hostname && resourceHosts.size < SCAN_LIMITS.maxReferences)
      resourceHosts.add(hostname);
  });
  const metadata = {
    title: compact($("title").first().text()),
    description: meta.description ?? "",
    canonical: canonical ? referenceUrl($(canonical).attr("href"), base) : null,
    canonicalStatus: !canonical
      ? "not-declared"
      : referenceUrl($(canonical).attr("href"), base)
        ? "valid-reference"
        : "invalid-reference",
    lang: compact($("html").attr("lang")),
    robots: meta.robots ?? "",
    viewport: meta.viewport ?? "",
    openGraphTitle: meta["og:title"] ?? "",
    openGraphDescription: meta["og:description"] ?? "",
  };
  const structure = {
    elements,
    internalLinkCount: internalCount,
    externalLinkCount: externalCount,
    internalLinks: internal,
    externalLinks: external,
    images: $("img").length,
    imagesWithoutAlt: $("img:not([alt])").length,
    scripts: $("script").length,
    stylesheets: $("link").filter(
      (_i, node) => $(node).attr("rel")?.toLowerCase().split(/\s+/).includes("stylesheet") ?? false,
    ).length,
    forms: $("form").length,
    fontPreloads: $("link[as='font']").length,
    h1: $("h1").length,
    h2: $("h2").length,
    h3: $("h3").length,
    h4: $("h4").length,
    h5: $("h5").length,
    h6: $("h6").length,
  };
  return {
    metadata,
    structure,
    resources,
    resourceHosts: [...resourceHosts].sort(),
    mixedContent,
    mixedContentCount,
    navigation,
    nofollow,
  };
}

export function inspectRobots(text: string) {
  const rules: string[] = [];
  const sitemaps: string[] = [];
  let applies = false;
  let directives = false;
  let previousAgent = false;
  let exceeded = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0]?.trim() ?? "";
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === "user-agent") {
      const matches = value === "*" || value.toLowerCase().startsWith("crossexam");
      applies = previousAgent && !directives ? applies || matches : matches;
      previousAgent = true;
      directives = false;
    } else {
      directives = true;
      if (name === "disallow" && applies && value.startsWith("/")) {
        if (rules.length >= SCAN_LIMITS.maxRobotsRules || value.length > SCAN_LIMITS.maxTextLength)
          exceeded = true;
        else rules.push(value);
      }
      if (
        name === "sitemap" &&
        sitemaps.length < SCAN_LIMITS.maxRobotsSitemaps &&
        /^https?:\/\//i.test(value)
      ) {
        const url = referenceUrl(value, "https://example.com/");
        if (url) sitemaps.push(url);
      }
    }
  }
  return { rules, sitemaps, exceeded };
}
export function robotsAllows(path: string, rules: string[]): boolean {
  const decoded = (() => {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  })();
  return !rules.some((rule) => {
    // Conservative prefix interpretation: wildcard/$ rules may overblock, never widen access.
    // No attacker-controlled regular expressions or recursive backtracking.
    const prefix = rule.split("*")[0]?.replace(/\$$/, "") ?? "/";
    let decodedPrefix = prefix;
    try {
      decodedPrefix = decodeURIComponent(prefix);
    } catch {
      return true;
    }
    return path.startsWith(prefix) || decoded.startsWith(decodedPrefix);
  });
}

export function inspectSitemap(text: string, base: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("XML declarations are unsupported");
  const $ = load(text, { xmlMode: true });
  if ($("sitemapindex").length) return { kind: "index", urls: [] as string[], truncated: false };
  if ($("urlset").length !== 1) throw new Error("Not a sitemap urlset");
  const locations = $("urlset > url > loc");
  const urls: string[] = [];
  locations.slice(0, SCAN_LIMITS.maxSitemapUrls).each((_i, node) => {
    const candidate = discoveredUrl($(node).text().trim(), base, new URL(base).origin);
    if (candidate && !urls.includes(candidate)) urls.push(candidate);
  });
  return { kind: "urlset", urls, truncated: locations.length > SCAN_LIMITS.maxSitemapUrls };
}
