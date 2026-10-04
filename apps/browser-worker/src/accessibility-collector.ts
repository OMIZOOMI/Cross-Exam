import {
  ACCESSIBILITY_ENGINE_VERSION,
  type ACCESSIBILITY_IMPACTS,
  ACCESSIBILITY_LOCATOR_TAGS,
  type AccessibilityNodeLocator,
  type BrowserAccessibilityEvidence,
  BrowserAccessibilityEvidenceSchema,
  BROWSER_ACCESSIBILITY_LIMITS as L,
} from "@crossexam/contracts";
import type { Page } from "@playwright/test";
import axe, { type AxeResults } from "axe-core";

type Evidence = BrowserAccessibilityEvidence;
type ProjectionOptions = {
  limits: typeof L;
  locatorTags: readonly string[];
  registry: Record<string, string[]>;
  version: string;
  base: Evidence;
};
const registry = Object.fromEntries(
  axe.getRules().map((rule) => [rule.ruleId, rule.tags.map((tag) => tag.toLowerCase())]),
);

export function emptyAccessibility(status: Evidence["status"]): Evidence {
  return {
    schemaVersion: 1,
    collector: "rendered-axe-v1",
    engine: "axe-core",
    engineVersion: ACCESSIBILITY_ENGINE_VERSION,
    analysisMode: "axe-default-rules-v1",
    scope: "top-document-and-open-shadow-roots",
    standardContext: "engine-provided-rule-tags; no-conformance-verdict",
    status,
    collectedAt: new Date().toISOString(),
    durationMs: 0,
    observation: null,
    ruleResults: null,
    truncation: {
      violationRules: 0,
      incompleteRules: 0,
      violationNodes: 0,
      incompleteNodes: 0,
      tags: 0,
      tagBuckets: 0,
      locators: 0,
      payload: false,
    },
    limitations: [
      "automated-rules-are-not-a-human-accessibility-verdict",
      "finite-rendered-snapshot; page-can-change-during-analysis",
      "iframes-and-closed-shadow-roots-excluded",
      "structural-locators-are-snapshot-local-and-may-be-partial",
      "controlled-main-world; hostile-page-tampering-not-addressed",
    ],
  };
}

/** Runs wholly inside the renderer. Raw axe results never cross Playwright IPC. */
export async function projectRenderedAccessibility(
  options: ProjectionOptions,
  trim: typeof trimAccessibility = trimAccessibility,
) {
  const { limits, registry, version } = options;
  const engine = (window as unknown as { axe?: typeof axe }).axe;
  if (!engine || engine.version !== version) return { status: "unsupported" as const };
  const tags = new Set(options.locatorTags);
  const indexes = new WeakMap<Element, number>();
  let elements = 0;
  let openShadowRoots = 0;
  let excludedFrames = 0;
  const pending: (Document | ShadowRoot)[] = [document];
  while (pending.length) {
    const root = pending.pop();
    if (!root) break;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let element = walker.nextNode() as Element | null;
    while (element) {
      if (++elements > limits.elements) return { status: "dom-limit" as const };
      indexes.set(element, elements);
      if (element.localName === "iframe") excludedFrames++;
      if (element.shadowRoot) {
        openShadowRoots++;
        pending.push(element.shadowRoot);
      }
      element = walker.nextNode() as Element | null;
    }
  }
  const observation: NonNullable<Evidence["observation"]> = {
    provenance: "OBSERVED",
    snapshotTimeMs: performance.now(),
    elements,
    openShadowRoots,
    excludedFrames,
    languagePresent: document.documentElement.hasAttribute("lang"),
    titlePresent: document.title.length > 0,
  };
  const locator = (element: Element | undefined): AccessibilityNodeLocator => {
    const index = element ? (indexes.get(element) ?? null) : null;
    const tag =
      element && tags.has(element.localName)
        ? (element.localName as AccessibilityNodeLocator["tag"])
        : null;
    if (!element || index === null) return { index, tag, path: null, truncated: true };
    const parts: string[] = [];
    let current: Element | null = element;
    let depth = 0;
    let truncated = false;
    while (current) {
      if (++depth > limits.locatorDepth || !tags.has(current.localName)) {
        truncated = true;
        break;
      }
      let ordinal = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.localName === current.localName) ordinal++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(`${current.localName}:nth-of-type(${ordinal})`);
      if (parts.join(">").length > limits.locatorLength) {
        parts.shift();
        truncated = true;
        break;
      }
      if (current.parentElement) current = current.parentElement;
      else {
        const root = current.getRootNode();
        if (root instanceof ShadowRoot) {
          parts.unshift("shadow");
          current = root.host;
        } else current = null;
      }
    }
    // A partial path must not start with a naked shadow marker.
    if (parts[0] === "shadow") parts.shift();
    return { index, tag, path: parts.length ? parts.join(">") : null, truncated };
  };
  engine.configure({ noHtml: true });
  const results = await engine.run(document, {
    iframes: false,
    preload: false,
    selectors: false,
    ancestry: false,
    xpath: false,
    elementRef: true,
  });
  // IDs/tags come from the pinned Node-side registry, never page strings or axe snippets.
  const ordered = (entries: AxeResults["violations"]) => {
    if (entries.some((r) => !Object.hasOwn(registry, r.id)))
      throw new Error("Unexpected engine rule");
    return [...entries].sort((a, b) => a.id.localeCompare(b.id));
  };
  const violations = ordered(results.violations);
  const incomplete = ordered(results.incomplete);
  const passes = ordered(results.passes);
  const inapplicable = ordered(results.inapplicable);
  const truncation: Evidence["truncation"] = {
    violationRules: Math.max(0, violations.length - limits.violationRules),
    incompleteRules: Math.max(0, incomplete.length - limits.incompleteRules),
    violationNodes: 0,
    incompleteNodes: 0,
    tags: 0,
    tagBuckets: 0,
    locators: 0,
    payload: false,
  };
  const impactCounts = { minor: 0, moderate: 0, serious: 0, critical: 0, unknown: 0 };
  const tagCounts = new Map<string, number>();
  for (const rule of violations) {
    const impact =
      rule.impact && Object.hasOwn(impactCounts, rule.impact) ? rule.impact : "unknown";
    impactCounts[impact]++;
    for (const tag of registry[rule.id] ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const tagBuckets = [...tagCounts].sort(([a], [b]) => a.localeCompare(b));
  truncation.tagBuckets = Math.max(0, tagBuckets.length - limits.tagBuckets);
  const retain = (entries: AxeResults["violations"], cap: number) =>
    entries.slice(0, cap).map((rule) => {
      const ruleTags = registry[rule.id] ?? [];
      truncation.tags += Math.max(0, ruleTags.length - limits.tags);
      // Sorting references only; never read node.html, target, check data or failureSummary.
      const nodes = [...rule.nodes]
        .sort(
          (a, b) =>
            (a.element ? (indexes.get(a.element) ?? Infinity) : Infinity) -
            (b.element ? (indexes.get(b.element) ?? Infinity) : Infinity),
        )
        .slice(0, limits.nodesPerRule)
        .map((node) => locator(node.element));
      truncation.locators += nodes.filter((node) => node.truncated).length;
      return {
        id: rule.id,
        impact: (rule.impact && Object.hasOwn(impactCounts, rule.impact)
          ? rule.impact
          : "unknown") as (typeof ACCESSIBILITY_IMPACTS)[number],
        tags: ruleTags.slice(0, limits.tags),
        affectedNodes: rule.nodes.length,
        nodes,
        droppedNodes: rule.nodes.length - nodes.length,
      };
    });
  const sumNodes = (entries: AxeResults["violations"]) =>
    entries.reduce((sum, rule) => sum + rule.nodes.length, 0);
  const retainedViolations = retain(violations, limits.violationRules);
  const retainedIncomplete = retain(incomplete, limits.incompleteRules);
  truncation.violationNodes =
    sumNodes(violations) - retainedViolations.reduce((sum, r) => sum + r.nodes.length, 0);
  truncation.incompleteNodes =
    sumNodes(incomplete) - retainedIncomplete.reduce((sum, r) => sum + r.nodes.length, 0);
  const summary = (entries: AxeResults["violations"]) => ({
    count: entries.length,
    ruleIds: entries.slice(0, limits.summaryRules).map((r) => r.id),
    droppedRuleIds: Math.max(0, entries.length - limits.summaryRules),
  });
  return trim(
    {
      ...options.base,
      status: "completed" as const,
      observation,
      truncation,
      ruleResults: {
        provenance: "DERIVED" as const,
        violations: retainedViolations,
        incomplete: retainedIncomplete,
        passes: summary(passes),
        inapplicable: summary(inapplicable),
        aggregates: {
          violationRules: violations.length,
          violationNodes: sumNodes(violations),
          incompleteRules: incomplete.length,
          incompleteNodes: sumNodes(incomplete),
          violationImpactCounts: impactCounts,
          violationTagCounts: tagBuckets
            .slice(0, limits.tagBuckets)
            .map(([tag, rules]) => ({ tag, rules })),
        },
      },
    },
    limits.payloadBytes,
  );
}

export function trimAccessibility(evidence: Evidence, maxBytes: number): Evidence {
  const results = evidence.ruleResults;
  if (results) {
    const over = () => new TextEncoder().encode(JSON.stringify(evidence)).byteLength > maxBytes;
    for (const [rules, nodeCounter, ruleCounter] of [
      [results.incomplete, "incompleteNodes", "incompleteRules"],
      [results.violations, "violationNodes", "violationRules"],
    ] as const) {
      for (const rule of [...rules].reverse()) {
        while (over() && rule.nodes.length) {
          rule.nodes.pop();
          rule.droppedNodes++;
          evidence.truncation[nodeCounter]++;
          evidence.truncation.payload = true;
        }
      }
      while (over() && rules.length) {
        rules.pop();
        evidence.truncation[ruleCounter]++;
        evidence.truncation.payload = true;
      }
    }
    for (const summary of [results.inapplicable, results.passes]) {
      while (over() && summary.ruleIds.length) {
        summary.ruleIds.pop();
        summary.droppedRuleIds++;
        evidence.truncation.payload = true;
      }
    }
  }
  return evidence;
}

export function finalizeAccessibility(evidence: Evidence): Evidence {
  return BrowserAccessibilityEvidenceSchema.parse(trimAccessibility(evidence, L.payloadBytes));
}

/** Uses the existing page/worker cleanup; no second browser, timeout or routing architecture. */
export async function collectRenderedAccessibility(
  page: Page,
  remainingMs: number,
  closeWorker: () => Promise<void>,
  signal?: AbortSignal,
): Promise<Evidence> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let evidence = emptyAccessibility("execution-failed");
  try {
    if (axe.version !== ACCESSIBILITY_ENGINE_VERSION) throw new Error("Locked engine mismatch");
    const operation = async () => {
      // DevTools evaluation of the locally bundled source, not a script tag/CDN or CSP bypass flag.
      await page.evaluate(axe.source);
      // Trusted repository functions/config only. Both projection and byte eviction run
      // in Chromium before IPC; this does not invoke page eval/Function or alter CSP.
      const config = {
        limits: L,
        locatorTags: ACCESSIBILITY_LOCATOR_TAGS,
        registry,
        version: ACCESSIBILITY_ENGINE_VERSION,
        base: evidence,
      };
      return page.evaluate<Awaited<ReturnType<typeof projectRenderedAccessibility>>>(
        `(${projectRenderedAccessibility.toString()})(${JSON.stringify(config)}, ${trimAccessibility.toString()})`,
      );
    };
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            timedOut = true;
            void closeWorker();
            reject(new Error("Analysis deadline"));
          },
          Math.max(1, Math.min(L.analysisMs, remainingMs)),
        );
      }),
    ]);
    evidence = { ...evidence, ...result };
  } catch {
    evidence = emptyAccessibility(
      signal?.aborted ? "cancelled" : timedOut ? "timeout" : "execution-failed",
    );
  } finally {
    clearTimeout(timer);
  }
  evidence.durationMs = Date.now() - started;
  evidence.collectedAt = new Date().toISOString();
  try {
    return finalizeAccessibility(evidence);
  } catch {
    return BrowserAccessibilityEvidenceSchema.parse({
      ...emptyAccessibility("execution-failed"),
      durationMs: Date.now() - started,
    });
  }
}
