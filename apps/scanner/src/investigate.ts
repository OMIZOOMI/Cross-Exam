import { randomUUID } from "node:crypto";
import {
  type ScanInput,
  ScanInputSchema,
  type ScanReport,
  ScanReportSchema,
} from "@crossexam/contracts";
import type { ScanOutcome } from "@crossexam/engine";
import { type RequestResult, safeRequest } from "@crossexam/engine/security";
import { navigationalUrl } from "./crawl-policy";
import {
  compact,
  decode,
  inspectHtml,
  inspectRobots,
  inspectSitemap,
  robotsAllows,
} from "./documents";
import { SCAN_LIMITS } from "./limits";
import { addEvidence, addFinding, documentFindings } from "./report";

const headerNames = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "x-frame-options",
  "server",
];
const limitations = [
  "Only returned HTML and response headers were inspected. JavaScript, stylesheets, images, fonts, forms, and other resources were not executed or fetched.",
  "Fetch duration includes DNS, connection, redirects, and body transfer. It is not browser rendering time, LCP, or field performance.",
  "Findings are deterministic rule matches from a single observation. No AI agents, challenges, or reproduction experiments ran.",
  "Navigation is limited to the final entry origin, without query strings or account/action paths. This is a sample, not a full-site audit.",
  "robots.txt uses conservative disallow prefixes for wildcard/CrossExam groups; Allow exceptions are not applied. Sitemap indexes are not followed.",
  "Reference lists and text are capped; reference queries/fragments are removed. Raw HTML, cookies, credentials, and DNS addresses are not retained.",
];
const denied = (): ScanOutcome => ({
  status: "rejected",
  code: "TARGET_NOT_ALLOWED",
  message: "This destination cannot be scanned.",
});
const failed = (cancelled = false): ScanOutcome => ({
  status: "failed",
  code: cancelled ? "CANCELLED" : "SCAN_FAILED",
  message: cancelled
    ? "Investigation cancelled."
    : "This website could not be investigated. Try another public HTML page.",
});

/** Production networking is fixed here: every document, metadata request and redirect uses safeRequest. */
export async function investigate(input: ScanInput, signal?: AbortSignal): Promise<ScanOutcome> {
  const parsed = ScanInputSchema.safeParse(input);
  const target = typeof input?.targetUrl === "string" ? navigationalUrl(input.targetUrl) : null;
  if (!parsed.success || !target) return denied();
  if (signal?.aborted) return failed(true);
  const maxPages = Math.min(parsed.data.maxPages, SCAN_LIMITS.maxPages);
  const timeoutMs = Math.min(parsed.data.timeoutMs, SCAN_LIMITS.scanTimeoutMs);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const started = performance.now();
  const info: NonNullable<ScanReport["investigation"]> = {
    mode: "deterministic-http",
    version: 1,
    finalOrigin: new URL(target).origin,
    requestCount: 0,
    receivedBytes: 0,
    limits: { ...SCAN_LIMITS, maxPages, scanTimeoutMs: timeoutMs },
    limitations,
    notes: [],
  };
  const report: ScanReport = {
    schemaVersion: 1,
    summary: {
      id: randomUUID(),
      source: "live",
      targetUrl: target,
      status: "completed",
      startedAt: new Date().toISOString(),
      durationMs: 0,
      pageCount: 0,
      evidenceCount: 0,
      findingCount: 0,
    },
    pages: [],
    metrics: [],
    evidence: [],
    claims: [],
    challenges: [],
    experiments: [],
    verdicts: [],
    findings: [],
    agentRuns: [],
    investigation: info,
  };
  const queue: { url: string; depth: number }[] = [];
  const seen = new Set<string>();
  const pageUrls = new Map<string, string>();
  const pageLinks = new Map<string, string[]>();
  const titles = new Map<string, { path: string; evidenceId: string }[]>();
  let robotsRules: string[] = [];
  let canDiscover = false;
  let pageAttempts = 0;
  const note = (value: string) => {
    if (!info.notes.includes(value)) info.notes.push(value);
  };
  const allowed = (url: string) =>
    !!navigationalUrl(url, info.finalOrigin) && robotsAllows(new URL(url).pathname, robotsRules);
  const enqueue = (url: string, depth: number) => {
    if (depth > SCAN_LIMITS.maxDepth || seen.has(url) || queue.some((item) => item.url === url))
      return;
    if (!allowed(url)) return;
    if (queue.length >= SCAN_LIMITS.maxCandidates) {
      note("Discovery candidate limit reached.");
      return;
    }
    queue.push({ url, depth });
  };
  async function request(url: string, metadata = false, initial = false) {
    combined.throwIfAborted();
    if (info.requestCount >= SCAN_LIMITS.maxRequests) throw new Error("Request budget");
    info.requestCount++;
    const start = performance.now();
    const result = await safeRequest(url, {
      method: "GET",
      signal: combined,
      timeoutMs: SCAN_LIMITS.requestTimeoutMs,
      maxBodyBytes: Math.min(
        metadata ? SCAN_LIMITS.metadataBytes : SCAN_LIMITS.maxBodyBytes,
        SCAN_LIMITS.maxTotalBytes - info.receivedBytes,
      ),
      maxRedirects: SCAN_LIMITS.maxRedirects,
      allowRedirect: initial
        ? (next) => !!navigationalUrl(next)
        : metadata
          ? (next) =>
              new URL(next).origin === info.finalOrigin &&
              new URL(next).pathname === new URL(url).pathname &&
              !new URL(next).search
          : allowed,
    });
    if (result.ok) info.receivedBytes += result.body.length;
    return {
      result,
      durationMs: Math.round(performance.now() - start),
      capturedAt: new Date().toISOString(),
    };
  }
  function failureEvidence(url: string, message: string) {
    addEvidence(report, {
      code: "FETCH_FAILURE",
      url,
      capturedAt: new Date().toISOString(),
      kind: "network",
      title: "Document was not collected",
      detail: message,
      data: { outcome: "not-collected" },
    });
    report.summary.status = "partial";
  }
  function recordPage(
    url: string,
    depth: number,
    result: Extract<RequestResult, { ok: true }>,
    durationMs: number,
    capturedAt: string,
  ) {
    const finalUrl = result.url;
    const contentType = compact(result.headers["content-type"]);
    const path = new URL(finalUrl).pathname;
    const netId = addEvidence(report, {
      code: "HTTP_STATUS",
      kind: "network",
      url,
      capturedAt,
      title: `HTTP ${result.statusCode} · ${path}`,
      detail: `GET returned HTTP ${result.statusCode}; ${result.body.length} body bytes in ${durationMs} ms including DNS/connection/redirects/body. This is not a browser paint measurement.`,
      data: {
        requestedUrl: url,
        finalUrl,
        statusCode: result.statusCode,
        redirectCount: Math.max(0, result.history.length - 1),
        contentType,
        responseBytes: result.body.length,
        durationMs,
      },
    });
    const page = {
      id: `P-${report.pages.length + 1}`,
      path,
      title: path,
      statusCode: result.statusCode,
      durationMs,
      linksTo: [] as string[],
      requestedUrl: url,
      finalUrl,
      depth,
      redirectCount: Math.max(0, result.history.length - 1),
      contentType,
      responseBytes: result.body.length,
    };
    report.pages.push(page);
    pageUrls.set(url, page.id);
    pageUrls.set(finalUrl, page.id);
    seen.add(finalUrl);
    const headers: Record<string, string | null> = {};
    for (const key of headerNames)
      headers[key] = result.headers[key]
        ? compact(
            result.headers[key]?.replace(/https?:\/\/[^\s;]+/g, (value) => {
              try {
                const u = new URL(value);
                u.search = "";
                u.hash = "";
                return u.href;
              } catch {
                return "[URL omitted]";
              }
            }),
          )
        : null;
    const headerId = addEvidence(report, {
      code: "RESPONSE_HEADERS",
      kind: "headers",
      url: finalUrl,
      capturedAt,
      title: `Response header observations · ${path}`,
      detail:
        headerNames.map((key) => `${key}: ${headers[key] ?? "not present"}`).join("; ") +
        ". Missing headers alone do not establish a vulnerability.",
      data: headers,
    });
    if (result.statusCode >= 400)
      addFinding(report, {
        title: `Document returned HTTP ${result.statusCode}`,
        description: `${path} returned HTTP ${result.statusCode} during this single request. Persistence and cause were not tested.`,
        category: "Navigation",
        severity: "medium",
        evidenceIds: [netId],
        affectedPaths: [path],
        recommendation: "Check whether this public destination and links to it are intentional.",
        verification: "Repeat a read-only request and inspect the status and intended destination.",
      });
    if (depth === 0 && !headers["content-security-policy"])
      addFinding(report, {
        title: "No Content-Security-Policy response header",
        description: `${path} did not send a Content-Security-Policy response header in this observation. HTML policies and vulnerability exposure are not assessed.`,
        category: "Headers",
        severity: "info",
        evidenceIds: [headerId],
        affectedPaths: [path],
        recommendation:
          "Review whether a response-header policy is appropriate for the site's resource requirements.",
        verification:
          "Inspect the response headers after any policy change and test compatibility separately.",
      });
    if (
      !/^text\/html(?:;|$)/i.test(contentType) &&
      !/^application\/xhtml\+xml(?:;|$)/i.test(contentType)
    ) {
      note(`${path}: response was not HTML; document rules and discovery were skipped.`);
      report.summary.status = "partial";
      return;
    }
    let document: ReturnType<typeof inspectHtml>;
    try {
      document = inspectHtml(result.body, contentType, finalUrl);
    } catch {
      failureEvidence(finalUrl, "HTML could not be parsed within the document limits.");
      return;
    }
    page.title = document.metadata.title || path;
    const metadataId = addEvidence(report, {
      code: "DOCUMENT_METADATA",
      kind: "metadata",
      url: finalUrl,
      capturedAt,
      title: `Document metadata · ${path}`,
      detail: `Title: ${document.metadata.title || "not present"}. Description: ${document.metadata.description || "not present"}. Language: ${document.metadata.lang || "not declared"}. Values describe returned HTML only.`,
      data: document.metadata,
    });
    const structureId = addEvidence(report, {
      code: "DOCUMENT_STRUCTURE",
      kind: "navigation",
      url: finalUrl,
      capturedAt,
      title: `HTML structure · ${path}`,
      detail: `${document.structure.internalLinkCount} internal and ${document.structure.externalLinkCount} external link declarations; ${document.structure.images} images, ${document.structure.scripts} scripts, ${document.structure.stylesheets} stylesheets, ${document.structure.forms} forms. No resources fetched or forms submitted. Lists are capped at ${SCAN_LIMITS.maxReferences}.`,
      data: document.structure,
    });
    const resourceId = addEvidence(report, {
      code: "RESOURCE_REFERENCES",
      kind: "network",
      url: finalUrl,
      capturedAt,
      title: `Declared resource references · ${path}`,
      detail:
        "HTML-declared script, stylesheet, image, source, icon, and preload references only. No resource requests, CSS parsing, srcset expansion, or browser waterfall. Queries and fragments are removed.",
      data: {
        urls: document.resources,
        thirdPartyHosts: document.resourceHosts,
        mixedContent: document.mixedContent,
        mixedContentCount: document.mixedContentCount,
      },
    });
    if (result.statusCode >= 200 && result.statusCode < 300) {
      documentFindings(report, document, path, metadataId, structureId, resourceId);
      if (result.body.length > SCAN_LIMITS.largeHtmlBytes)
        addFinding(report, {
          title: "HTML body exceeds 512 KiB",
          description: `${path} returned ${result.body.length} uncompressed body bytes, above the documented ${SCAN_LIMITS.largeHtmlBytes}-byte review threshold. Browser performance and causes were not measured.`,
          category: "Performance",
          severity: "low",
          evidenceIds: [netId],
          affectedPaths: [path],
          recommendation:
            "Review whether the document contains unnecessary markup or embedded data.",
          verification:
            "Measure the response body size after any change; assess browser performance separately.",
        });
      if (document.metadata.title && document.metadata.title.length < SCAN_LIMITS.maxTextLength) {
        const key = document.metadata.title.toLowerCase();
        titles.set(key, [...(titles.get(key) ?? []), { path, evidenceId: metadataId }]);
      }
      pageLinks.set(page.id, document.navigation);
      if (!document.nofollow) for (const link of document.navigation) enqueue(link, depth + 1);
      else note(`${path}: robots meta disallows following links.`);
    }
  }
  try {
    const entry = await request(target, false, true);
    if (!entry.result.ok)
      return ["UNSAFE_DNS_RESULT", "UNSAFE_REDIRECT", "PEER_MISMATCH", "REDIRECT_POLICY"].includes(
        entry.result.reason,
      )
        ? denied()
        : failed(signal?.aborted);
    info.finalOrigin = new URL(entry.result.url).origin;
    seen.add(target);
    pageAttempts++;
    recordPage(target, 0, entry.result, entry.durationMs, entry.capturedAt);
    // Metadata requests are always bounded and use the same gate. Discovery waits for robots.
    for (const [path, code] of [
      ["/robots.txt", "ROBOTS_TXT"],
      ["/sitemap.xml", "SITEMAP_XML"],
    ] as const) {
      if (combined.aborted) break;
      const url = `${info.finalOrigin}${path}`;
      const { result, capturedAt } = await request(url, true);
      let detail = "Metadata could not be retrieved within the request policy and limits.";
      let data: NonNullable<ScanReport["evidence"][number]["data"]> = { exists: null };
      if (result.ok) {
        data = {
          statusCode: result.statusCode,
          exists: result.statusCode >= 200 && result.statusCode < 300,
          responseBytes: result.body.length,
          redirectCount: Math.max(0, result.history.length - 1),
        };
        detail = `HTTP ${result.statusCode}; ${result.body.length} bytes.`;
        if (code === "ROBOTS_TXT" && [404, 410].includes(result.statusCode)) canDiscover = true;
        if (result.statusCode === 200) {
          try {
            const contentType = result.headers["content-type"] ?? "";
            if (/html/i.test(contentType)) throw new Error("HTML is not conventional metadata");
            const text = decode(result.body, contentType);
            if (code === "ROBOTS_TXT") {
              if (!/^text\/plain(?:;|$)/i.test(contentType))
                throw new Error("Unsupported robots type");
              const robots = inspectRobots(text);
              robotsRules = robots.rules;
              canDiscover = !robots.exceeded;
              data = {
                ...data,
                disallowRules: robots.rules.map((rule) => compact(rule)),
                declaredSitemaps: robots.sitemaps,
                exceeded: robots.exceeded,
              };
              detail +=
                " Conservative disallow prefixes applied to discovered links; Allow exceptions are not used. Initial entry was already fetched.";
            } else {
              if (!/(?:application|text)\/(?:xml|[^;]+\+xml)(?:;|$)/i.test(contentType))
                throw new Error("Unsupported sitemap type");
              const sitemap = inspectSitemap(text, url);
              data = {
                ...data,
                kind: sitemap.kind,
                urls: sitemap.urls,
                truncated: sitemap.truncated,
              };
              detail += ` ${sitemap.kind}; ${sitemap.urls.length} eligible hints. Sitemap indexes are not downloaded.`;
              if (canDiscover) for (const link of sitemap.urls) enqueue(link, 1);
            }
          } catch {
            detail += " Unsupported or unparseable metadata; no discovery hints used.";
            report.summary.status = "partial";
          }
        }
      } else report.summary.status = "partial";
      addEvidence(report, {
        code,
        kind: "navigation",
        url,
        capturedAt,
        title: `${path} observation`,
        detail,
        data,
      });
    }
    if (!canDiscover) {
      queue.length = 0;
      note(
        "No additional pages fetched because robots policy could not be established or exceeded limits.",
      );
      report.summary.status = "partial";
    }
    while (canDiscover && queue.length && pageAttempts < maxPages && !combined.aborted) {
      const next = queue.shift();
      if (!next) break;
      if (seen.has(next.url) || !allowed(next.url)) continue;
      seen.add(next.url);
      pageAttempts++;
      const { result, durationMs, capturedAt } = await request(next.url);
      if (!result.ok) {
        failureEvidence(
          next.url,
          "Request failed or was stopped by destination, redirect, timeout, or size policy. No private network details are retained.",
        );
        continue;
      }
      const existingPage = pageUrls.get(result.url);
      if (existingPage) {
        pageUrls.set(next.url, existingPage);
        addEvidence(report, {
          code: "HTTP_STATUS",
          kind: "network",
          url: next.url,
          capturedAt,
          title: "Redirect alias reached an already collected page",
          detail: "The response is recorded without counting the final document twice.",
          data: {
            requestedUrl: next.url,
            finalUrl: result.url,
            statusCode: result.statusCode,
            redirectCount: Math.max(0, result.history.length - 1),
            durationMs,
            responseBytes: result.body.length,
          },
        });
        continue;
      }
      recordPage(next.url, next.depth, result, durationMs, capturedAt);
    }
    if (queue.length)
      note("Stopped at the page or time limit; some eligible links were not investigated.");
    if (combined.aborted) {
      note(
        "Investigation stopped at its deadline or cancellation; retained completed observations.",
      );
      report.summary.status = "partial";
    }
  } catch {
    if (!report.pages.length) return failed(signal?.aborted);
    report.summary.status = "partial";
    note("Investigation stopped before all planned documents were collected.");
  } finally {
    clearTimeout(timer);
  }
  for (const page of report.pages)
    page.linksTo = [
      ...new Set(
        (pageLinks.get(page.id) ?? [])
          .map((url) => pageUrls.get(url))
          .filter((id): id is string => !!id && id !== page.id),
      ),
    ];
  for (const matches of titles.values())
    if (matches.length > 1)
      addFinding(report, {
        title: "Fetched pages share a document title",
        description: `${matches.length} fetched documents have the same normalized title in their returned HTML. Ranking or user impact was not measured.`,
        category: "Metadata",
        severity: "low",
        evidenceIds: matches.map((item) => item.evidenceId),
        affectedPaths: matches.map((item) => item.path),
        recommendation:
          "Consider descriptive page-specific titles where the pages serve different purposes.",
        verification: "Compare title elements from the same set of pages after any change.",
      });
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  report.findings.sort((a, b) => order[a.severity] - order[b.severity]);
  report.summary.durationMs = Math.round(performance.now() - started);
  report.summary.pageCount = report.pages.length;
  report.summary.evidenceCount = report.evidence.length;
  report.summary.findingCount = report.findings.length;
  return { status: "completed", report: ScanReportSchema.parse(report) };
}
