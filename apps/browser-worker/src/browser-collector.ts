import {
  BROWSER_TRUNCATION_DIMENSIONS,
  type BrowserEvidenceCollection,
  BrowserEvidenceCollectionSchema,
  BROWSER_EVIDENCE_LIMITS as L,
} from "@crossexam/contracts";
import {
  finalizePerformance,
  safeFailure,
  safeHeaders,
  safeObservedUrl,
  safeText,
} from "@crossexam/engine/browser-evidence";
import type { ConsoleMessage, Request, Response } from "@playwright/test";
import { type FixtureWorker, launchFixtureWorker } from "./fixture-worker";
import { installPerformanceObservers, readPerformanceObservers } from "./performance-observer";

export const COLLECTOR_FIXTURE_ORIGIN = "http://entry.crossexam-fixture.com";
export const COLLECTOR_FIXTURES = Object.freeze({
  rich: "/collector/redirect",
  bounds: "/collector/bounds",
  requests: "/collector/requests",
  slow: "/collector/slow",
  failure: "/collector/failure",
  loop: "/collector/loop",
  dom: "/collector/dom-limit",
  empty: "/collector/empty-performance",
});
type Collection = BrowserEvidenceCollection;
type Fixture = keyof typeof COLLECTOR_FIXTURES;

export function emptyBrowserCollection(fixture: Fixture, startedAt = Date.now()): Collection {
  const target = `${COLLECTOR_FIXTURE_ORIGIN}${COLLECTOR_FIXTURES[fixture]}`;
  return {
    version: 1,
    collector: "chromium-runtime-v1",
    source: "fixture",
    scope: "controlled-fixture",
    provenance: "OBSERVED",
    startedAt: new Date(startedAt).toISOString(),
    collectedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    target,
    outcome: "launch-failed",
    navigation: {
      requestedUrl: target,
      finalUrl: null,
      status: null,
      headers: {},
      contentType: null,
      outcome: "not-started",
      failure: null,
      wallClockDurationMs: null,
      chain: [],
    },
    console: [],
    pageErrors: [],
    requests: [],
    responses: [],
    dom: null,
    performance: null,
    truncation: {
      dropped: Object.fromEntries(BROWSER_TRUNCATION_DIMENSIONS.map((name) => [name, 0])),
      shortenedStrings: 0,
      redactedFields: 0,
      omittedUrls: 0,
      omittedHeaders: 0,
      domInspectionLimit: false,
      inputTypes: 0,
      resultSize: false,
    },
  };
}

/** Deterministic tail eviction with explicit per-dimension loss and byte-budget marker. */
export function finalizeBrowserCollection(collection: Collection): Collection {
  const arrays = [
    ["resources", collection.dom?.resources],
    ["links", collection.dom?.links],
    ["forms", collection.dom?.forms],
    ["headings", collection.dom?.headings],
    ["responses", collection.responses],
    ["requests", collection.requests],
    ["pageErrors", collection.pageErrors],
    ["console", collection.console],
  ] as const;
  for (const [dimension, entries] of arrays) {
    while (Buffer.byteLength(JSON.stringify(collection)) > L.resultBytes && entries?.length) {
      entries.pop();
      collection.truncation.dropped[dimension] =
        (collection.truncation.dropped[dimension] ?? 0) + 1;
      collection.truncation.resultSize = true;
    }
  }
  return BrowserEvidenceCollectionSchema.parse(collection);
}

/**
 * Internal controlled-fixture entry ONLY, deliberately absent from package exports.
 * No caller-provided target, launch args, proxy bypass, request policy, or storage options.
 * Local browser checks establish collector semantics; Linux probes establish confinement.
 */
export async function collectFixtureBrowserEvidence(options: {
  proxyServer: string;
  fixture: Fixture;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<Collection> {
  if (
    !Object.hasOwn(COLLECTOR_FIXTURES, options.fixture) ||
    Object.keys(options).some(
      (key) => !["proxyServer", "fixture", "timeoutMs", "signal"].includes(key),
    )
  )
    throw new Error("Unsupported controlled collector configuration");
  const startedAt = Date.now();
  const output = emptyBrowserCollection(options.fixture, startedAt);
  const T = output.truncation;
  const text = (value: string) => safeText(value, T);
  const url = (value: string) => safeObservedUrl(value, T);
  let worker: FixtureWorker | undefined;
  let stopped = false;
  let crashed = false;
  let sequence = 0;
  let rootNavigation: Request | undefined;
  const chain = new WeakSet<Request>();
  const identities = new WeakMap<Request, number>();
  const retained = new WeakMap<Request, Collection["requests"][number]>();
  const onRequest = (request: Request) => {
    if (stopped) return;
    const id = ++sequence;
    identities.set(request, id);
    const redirected = request.redirectedFrom();
    if (
      !rootNavigation &&
      request.isNavigationRequest() &&
      request.frame() === worker?.page.mainFrame()
    )
      rootNavigation = request;
    if (request === rootNavigation || (redirected && chain.has(redirected))) {
      chain.add(request);
      if (output.navigation.chain.length < L.redirects + 1)
        output.navigation.chain.push({ requestId: id, url: url(request.url()) });
      else T.dropped.redirects = (T.dropped.redirects ?? 0) + 1;
    }
    if (output.requests.length >= L.requests) {
      T.dropped.requests = (T.dropped.requests ?? 0) + 1;
      return;
    }
    const method = request.method();
    const entry: Collection["requests"][number] = {
      id,
      url: url(request.url()),
      method: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"].includes(method)
        ? (method as Collection["requests"][number]["method"])
        : "OTHER",
      resourceType: text(request.resourceType()),
      outcome: "observed",
      failure: null,
      redirectedFrom: redirected ? (identities.get(redirected) ?? null) : null,
    };
    retained.set(request, entry);
    output.requests.push(entry);
  };
  const onFinished = (request: Request) => {
    const entry = retained.get(request);
    if (!stopped && entry) entry.outcome = "finished";
  };
  const onFailed = (request: Request) => {
    const entry = retained.get(request);
    if (!stopped && entry) {
      entry.outcome = "failed";
      entry.failure = safeFailure(request.failure()?.errorText);
    }
  };
  const onResponse = (response: Response) => {
    if (stopped) return;
    if (output.responses.length >= L.responses) {
      T.dropped.responses = (T.dropped.responses ?? 0) + 1;
      return;
    }
    const request = response.request();
    const id = identities.get(request);
    if (id === undefined) return; // No response without a directly observed request.
    const headers = safeHeaders(response.headers(), T);
    output.responses.push({
      requestId: id,
      url: url(response.url()),
      status: response.status(),
      resourceType: text(request.resourceType()),
      headers,
      contentType: headers["content-type"] ?? null,
    });
  };
  const onConsole = (event: ConsoleMessage) => {
    if (stopped || !["error", "warning"].includes(event.type())) return;
    if (output.console.length >= L.console) {
      T.dropped.console = (T.dropped.console ?? 0) + 1;
      return;
    }
    const location = event.location();
    output.console.push({
      level: event.type() as "error" | "warning",
      text: text(event.text()),
      location: {
        url: url(location.url),
        line: Math.max(0, location.lineNumber),
        column: Math.max(0, location.columnNumber),
      },
    });
  };
  const onError = (error: Error) => {
    if (stopped) return;
    if (output.pageErrors.length >= L.pageErrors) {
      T.dropped.pageErrors = (T.dropped.pageErrors ?? 0) + 1;
      return;
    }
    // Read name/message only: never Error.stack or arbitrary thrown object properties.
    output.pageErrors.push({ name: text(error.name), message: text(error.message) });
  };
  const abort = () => {
    void worker?.close();
  };
  const onCrash = () => {
    crashed = true;
    abort();
  };
  try {
    if (options.signal?.aborted) throw new Error("Cancelled");
    options.signal?.addEventListener("abort", abort, { once: true });
    worker = await launchFixtureWorker({
      proxyServer: options.proxyServer,
      timeoutMs: options.timeoutMs,
    });
    if (options.signal?.aborted) throw new Error("Cancelled");
    worker.context.on("request", onRequest);
    worker.context.on("requestfinished", onFinished);
    worker.context.on("requestfailed", onFailed);
    worker.context.on("response", onResponse);
    worker.context.on("console", onConsole);
    worker.page.on("pageerror", onError);
    worker.page.on("crash", onCrash);
    await installPerformanceObservers(worker.page);
    const deadlineAt = worker.operationalDeadlineAt;
    const remaining = () => Math.max(1, deadlineAt - Date.now());
    output.outcome = "navigation-failed";
    const navigationStart = Date.now();
    try {
      const response = await worker.page.goto(output.target, {
        waitUntil: "load",
        timeout: remaining(),
      });
      output.navigation.outcome = response ? "succeeded" : "failed";
      output.navigation.status = response?.status() ?? null;
      output.navigation.headers = safeHeaders(response?.headers() ?? {}, T);
      output.navigation.contentType = output.navigation.headers["content-type"] ?? null;
      output.navigation.finalUrl = url(worker.page.url());
      if (response) output.outcome = "completed";
    } catch (error) {
      output.navigation.outcome = "failed";
      output.navigation.failure = safeFailure(error instanceof Error ? error.message : null);
      output.navigation.finalUrl = url(worker.page.url());
    } finally {
      output.navigation.wallClockDurationMs = Date.now() - navigationStart;
    }
    if (output.outcome === "completed") {
      // Fixed observation window, not networkidle/performance readiness or eventual-page proof.
      // Abort/worker deadline closes the page, ending this wait and any pending evaluation.
      await worker.page.waitForTimeout(Math.min(L.settleMs, remaining()));
      const performance = await readPerformanceObservers(worker.page);
      if (performance) output.performance = finalizePerformance(performance, T);
      output.dom = await collectDom(worker, output);
    }
  } catch {
    output.outcome = worker ? "browser-closed" : "launch-failed";
  } finally {
    stopped = true;
    options.signal?.removeEventListener("abort", abort);
    if (worker) {
      worker.context.off("request", onRequest);
      worker.context.off("requestfinished", onFinished);
      worker.context.off("requestfailed", onFailed);
      worker.context.off("response", onResponse);
      worker.context.off("console", onConsole);
      worker.page.off("pageerror", onError);
      worker.page.off("crash", onCrash);
      if (crashed) output.outcome = "browser-closed";
      if (
        Date.now() >= worker.operationalDeadlineAt ||
        worker.decisions.some((entry) => entry.reason === "DEADLINE_EXCEEDED")
      )
        output.outcome = "timeout";
      await worker.close();
    }
    if (options.signal?.aborted) output.outcome = "cancelled";
    output.collectedAt = new Date().toISOString();
    output.durationMs = Date.now() - startedAt;
  }
  return finalizeBrowserCollection(output);
}

async function collectDom(
  worker: FixtureWorker,
  output: Collection,
): Promise<NonNullable<Collection["dom"]>> {
  // Only selected fields cross IPC, all bounded inside the renderer before serialization.
  const raw = await worker.page.evaluate((limits) => {
    let shortened = 0;
    let invalidReferences = 0;
    const clip = (value: string | null, max: number = limits.text) => {
      if (value === null) return null;
      if (value.length > max) shortened++;
      return value.slice(0, max);
    };
    const reference = (value: string | null) => {
      if (!value) return null;
      try {
        return clip(new URL(value.slice(0, 4097), document.baseURI).href, 4097);
      } catch {
        invalidReferences++;
        return null;
      }
    };
    const headings: { level: number; text: string }[] = [];
    const links: (string | null)[] = [];
    const resources: {
      type: "script" | "stylesheet" | "image" | "font" | "frame";
      url: string | null;
    }[] = [];
    const forms: {
      method: "get" | "post" | "dialog" | "other";
      action: string | null;
      inputCount: number;
      inputTypes: { type: string; count: number }[];
    }[] = [];
    const formEntries = new Map<Element, (typeof forms)[number]>();
    const counts = { headings: 0, forms: 0, links: 0, resources: 0, inspectedElements: 0 };
    let description: string | null = null;
    let canonical: string | null = null;
    let inputTypesDropped = 0;
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node && counts.inspectedElements < limits.domElements) {
      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      counts.inspectedElements++;
      if (/^h[1-6]$/.test(tag)) {
        counts.headings++;
        if (headings.length < limits.headings)
          headings.push({ level: Number(tag[1]), text: clip(element.textContent ?? "") ?? "" });
      }
      if (
        tag === "meta" &&
        element.getAttribute("name")?.toLowerCase() === "description" &&
        description === null
      )
        description = clip(element.getAttribute("content"));
      if (tag === "a" && element.hasAttribute("href")) {
        counts.links++;
        if (links.length < limits.links) links.push(reference(element.getAttribute("href")));
      }
      if (tag === "form") {
        counts.forms++;
        if (forms.length < limits.forms) {
          const method = element.getAttribute("method")?.toLowerCase() ?? "get";
          const entry: (typeof forms)[number] = {
            method: ["get", "post", "dialog"].includes(method)
              ? (method as "get" | "post" | "dialog")
              : "other",
            action: reference(element.getAttribute("action") || document.URL),
            inputCount: 0,
            inputTypes: [],
          };
          forms.push(entry);
          formEntries.set(element, entry);
        }
      }
      if (["input", "select", "textarea", "button"].includes(tag)) {
        const form = element.closest("form");
        const entry = form ? formEntries.get(form) : undefined;
        if (entry) {
          entry.inputCount++;
          const candidate =
            tag === "input" ? (element.getAttribute("type")?.toLowerCase() ?? "text") : tag;
          const type = [
            "text",
            "password",
            "email",
            "number",
            "checkbox",
            "radio",
            "hidden",
            "submit",
            "reset",
            "button",
            "file",
            "tel",
            "url",
            "search",
            "date",
            "range",
            "select",
            "textarea",
          ].includes(candidate)
            ? candidate
            : "other";
          const existing = entry.inputTypes.find((input) => input.type === type);
          if (existing) existing.count++;
          else if (entry.inputTypes.length < limits.inputTypes)
            entry.inputTypes.push({ type, count: 1 });
          else inputTypesDropped++;
        }
      }
      const rel = element.getAttribute("rel")?.toLowerCase().split(/\s+/) ?? [];
      if (tag === "link" && rel.includes("canonical") && canonical === null)
        canonical = reference(element.getAttribute("href"));
      const type =
        tag === "script"
          ? "script"
          : tag === "img"
            ? "image"
            : tag === "iframe"
              ? "frame"
              : tag === "link" && rel.includes("stylesheet")
                ? "stylesheet"
                : tag === "link" && element.getAttribute("as") === "font"
                  ? "font"
                  : null;
      if (type) {
        counts.resources++;
        if (resources.length < limits.resources)
          resources.push({
            type,
            url: reference(element.getAttribute(tag === "link" ? "href" : "src")),
          });
      }
      node = walker.nextNode();
    }
    return {
      url: clip(document.URL, 4097),
      title: clip(document.title) ?? "",
      description,
      canonical,
      headings,
      forms,
      links,
      resources,
      counts,
      inspectionLimit: node !== null,
      shortened,
      inputTypesDropped,
      invalidReferences,
    };
  }, L);
  const T = output.truncation;
  T.shortenedStrings += raw.shortened;
  T.domInspectionLimit = raw.inspectionLimit;
  T.inputTypes += raw.inputTypesDropped;
  T.omittedUrls += raw.invalidReferences;
  for (const name of ["headings", "links", "forms", "resources"] as const)
    T.dropped[name] = raw.counts[name] - raw[name].length;
  const url = (value: string | null) => (value === null ? null : safeObservedUrl(value, T));
  return {
    url: url(raw.url),
    title: safeText(raw.title, T),
    description: raw.description === null ? null : safeText(raw.description, T),
    canonical: url(raw.canonical),
    headings: raw.headings.map((entry) => ({ ...entry, text: safeText(entry.text, T) })),
    forms: raw.forms.map((entry) => ({ ...entry, action: url(entry.action) })),
    links: raw.links.map(url),
    resources: raw.resources.map((entry) => ({ ...entry, url: url(entry.url) })),
    counts: raw.counts,
  };
}
