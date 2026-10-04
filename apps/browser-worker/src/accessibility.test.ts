import {
  ACCESSIBILITY_ENGINE_VERSION,
  ACCESSIBILITY_LOCATOR_TAGS,
  AccessibilityNodeLocatorSchema,
  type BrowserAccessibilityEvidence,
  BrowserAccessibilityEvidenceSchema,
  BROWSER_ACCESSIBILITY_LIMITS as L,
} from "@crossexam/contracts";
import { browserEvidenceRecords } from "@crossexam/engine/browser-evidence";
import type { Page } from "@playwright/test";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectRenderedAccessibility,
  emptyAccessibility,
  finalizeAccessibility,
  projectRenderedAccessibility,
} from "./accessibility-collector";
import { emptyBrowserCollection, finalizeBrowserCollection } from "./browser-collector";

const completed = (): BrowserAccessibilityEvidence => ({
  ...emptyAccessibility("completed"),
  observation: {
    provenance: "OBSERVED",
    snapshotTimeMs: 100,
    elements: 1,
    openShadowRoots: 0,
    excludedFrames: 0,
    languagePresent: true,
    titlePresent: true,
  },
  ruleResults: {
    provenance: "DERIVED",
    violations: [],
    incomplete: [],
    passes: { count: 0, ruleIds: [], droppedRuleIds: 0 },
    inapplicable: { count: 0, ruleIds: [], droppedRuleIds: 0 },
    aggregates: {
      violationRules: 0,
      violationNodes: 0,
      incompleteRules: 0,
      incompleteNodes: 0,
      violationImpactCounts: { minor: 0, moderate: 0, serious: 0, critical: 0, unknown: 0 },
      violationTagCounts: [],
    },
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("accessibility identity, provenance and privacy contract", () => {
  it("locks the official dependency/version and default-rule configuration", () => {
    expect(axe.version).toBe(ACCESSIBILITY_ENGINE_VERSION);
    expect(BrowserAccessibilityEvidenceSchema.parse(completed()).engine).toBe("axe-core");
    for (const change of [
      { engineVersion: "4.12.0" },
      { schemaVersion: 2 },
      { engine: "other" },
      { analysisMode: "guess" },
      { compliance: true },
      { score: 100 },
    ])
      expect(
        BrowserAccessibilityEvidenceSchema.safeParse({ ...completed(), ...change }).success,
      ).toBe(false);
  });
  it.each(["unsupported", "execution-failed", "timeout", "cancelled", "dom-limit"] as const)(
    "%s has no zero-violation verdict",
    (status) => {
      expect(
        BrowserAccessibilityEvidenceSchema.parse(emptyAccessibility(status)).ruleResults,
      ).toBeNull();
      expect(BrowserAccessibilityEvidenceSchema.safeParse({ ...completed(), status }).success).toBe(
        false,
      );
    },
  );
  it("rejects missing successful results and inverted provenance", () => {
    expect(
      BrowserAccessibilityEvidenceSchema.safeParse(emptyAccessibility("completed")).success,
    ).toBe(false);
    const c = completed();
    expect(
      BrowserAccessibilityEvidenceSchema.safeParse({
        ...c,
        observation: { ...c.observation, provenance: "DERIVED" },
      }).success,
    ).toBe(false);
    expect(
      BrowserAccessibilityEvidenceSchema.safeParse({
        ...c,
        ruleResults: { ...c.ruleResults, provenance: "OBSERVED" },
      }).success,
    ).toBe(false);
  });
  it.each([
    "html",
    "outerHTML",
    "textContent",
    "target",
    "failureSummary",
    "value",
    "selector",
    "storage",
    "authorization",
  ])("rejects %s on a retained node", (key) => {
    const c = completed();
    const rule = {
      id: "button-name",
      impact: "critical",
      tags: [],
      affectedNodes: 1,
      nodes: [
        {
          index: 1,
          tag: "button",
          path: "button:nth-of-type(1)",
          truncated: false,
          [key]: "DISPOSABLE_NOT_A_SECRET",
        },
      ],
      droppedNodes: 0,
    };
    expect(
      BrowserAccessibilityEvidenceSchema.safeParse({
        ...c,
        ruleResults: { ...c.ruleResults, violations: [rule] },
      }).success,
    ).toBe(false);
  });
  it.each([
    "#token",
    ".private",
    "input[name=secret]",
    "my-secret:nth-of-type(1)",
    "div:nth-of-type(0)",
    "div:nth-of-type(1)>#private",
  ])("rejects arbitrary locator %s", (path) => {
    expect(
      AccessibilityNodeLocatorSchema.safeParse({ index: 1, tag: "div", path, truncated: false })
        .success,
    ).toBe(false);
  });
  it("rejects deep/oversized locators and invalid aggregate accounting", () => {
    expect(
      AccessibilityNodeLocatorSchema.safeParse({
        index: 1,
        tag: "div",
        path: Array(11).fill("div:nth-of-type(1)").join(">"),
        truncated: true,
      }).success,
    ).toBe(false);
    const c = completed();
    if (c.ruleResults) c.ruleResults.aggregates.violationRules = 1;
    expect(BrowserAccessibilityEvidenceSchema.safeParse(c).success).toBe(false);
  });
});

function fakeProjection(depth = 1, custom = false, count = 1, rules = 1) {
  type E = {
    localName: string;
    parentElement: E | null;
    previousElementSibling: null;
    shadowRoot: null;
    getRootNode: () => object;
    hasAttribute: () => boolean;
  };
  const elements: E[] = [];
  for (let i = 0; i < depth; i++)
    elements.push({
      localName: custom && i === 0 ? "private-widget" : "div",
      parentElement: elements.at(-1) ?? null,
      previousElementSibling: null,
      shadowRoot: null,
      getRootNode: () => ({}),
      hasAttribute: () => true,
    });
  const rawNodes = Array.from({ length: count }, () => ({
    element: elements.at(-1),
    get html(): never {
      throw new Error("HTML read");
    },
    get target(): never {
      throw new Error("Selector read");
    },
    get any(): never {
      throw new Error("Check data read");
    },
  }));
  const registry = Object.fromEntries(
    Array.from({ length: rules }, (_, i) => [
      `rule-${String(i).padStart(2, "0")}`,
      Array.from({ length: 20 }, (_, j) => `wcag${j}`),
    ]),
  );
  const rawRules = Object.keys(registry)
    .reverse()
    .map((id) => ({ id, impact: "untrusted", nodes: rawNodes }));
  vi.stubGlobal("NodeFilter", { SHOW_ELEMENT: 1 });
  vi.stubGlobal("ShadowRoot", class {});
  vi.stubGlobal("document", {
    title: "DISPOSABLE_NOT_A_SECRET",
    documentElement: elements[0],
    createTreeWalker: () => {
      let i = 0;
      return { nextNode: () => elements[i++] ?? null };
    },
  });
  const configure = vi.fn();
  const run = vi.fn(async (_context: unknown, _options: unknown) => ({
    violations: rawRules,
    incomplete: rawRules,
    passes: rawRules,
    inapplicable: rawRules,
  }));
  vi.stubGlobal("window", { axe: { version: ACCESSIBILITY_ENGINE_VERSION, configure, run } });
  return {
    options: {
      limits: L,
      locatorTags: ACCESSIBILITY_LOCATOR_TAGS,
      registry,
      version: ACCESSIBILITY_ENGINE_VERSION,
      base: completed(),
    },
    configure,
    run,
  };
}

describe("renderer projection and deterministic retention", () => {
  it("never reads axe snippets/selectors/check data and does not transmit values", async () => {
    const f = fakeProjection();
    const r = await projectRenderedAccessibility(f.options);
    expect(r.status).toBe("completed");
    expect(JSON.stringify(r)).not.toContain("DISPOSABLE_NOT_A_SECRET");
    expect(f.configure).toHaveBeenCalledWith({ noHtml: true });
    expect(f.run.mock.calls[0]?.[1]).toMatchObject({
      iframes: false,
      preload: false,
      selectors: false,
      elementRef: true,
    });
    if (r.status === "completed") expect(r.ruleResults?.violations[0]?.impact).toBe("unknown");
  });
  it("bounds depth and excludes custom-element names from locators", async () => {
    for (const [depth, custom] of [
      [20, false],
      [1, true],
    ] as const) {
      const r = await projectRenderedAccessibility(fakeProjection(depth, custom).options);
      if (r.status !== "completed") throw new Error("Expected completed projection");
      const node = r.ruleResults?.violations[0]?.nodes[0];
      expect(node?.truncated).toBe(true);
      expect(node?.path?.split(">").length ?? 0).toBeLessThanOrEqual(L.locatorDepth);
      expect(JSON.stringify(node)).not.toContain("private-widget");
      expect(AccessibilityNodeLocatorSchema.safeParse(node).success).toBe(true);
    }
  });
  it("accounts for violation/incomplete rules, nodes, tags and payload eviction", async () => {
    const r = await projectRenderedAccessibility(fakeProjection(20, false, 30, 20).options);
    if (r.status !== "completed") throw new Error("Expected completed projection");
    const a = finalizeAccessibility({ ...emptyAccessibility("completed"), ...r });
    expect(a.ruleResults?.aggregates.violationRules).toBe(20);
    expect(a.ruleResults?.aggregates.incompleteRules).toBe(20);
    expect(a.truncation.violationRules).toBeGreaterThanOrEqual(8);
    expect(a.truncation.incompleteRules).toBeGreaterThanOrEqual(12);
    expect(a.truncation.violationNodes).toBeGreaterThan(0);
    expect(a.truncation.incompleteNodes).toBeGreaterThan(0);
    expect(a.truncation.tags).toBeGreaterThan(0);
    expect(a.truncation.payload).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(a))).toBeLessThanOrEqual(L.payloadBytes);
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(L.payloadBytes);
    expect(a.ruleResults?.violations.map((rule) => rule.id)).toEqual(
      a.ruleResults?.violations.map((rule) => rule.id).sort(),
    );
  });
  it("rejects unexpected rule identity instead of silently dropping it", async () => {
    const f = fakeProjection();
    f.options.registry = {};
    await expect(projectRenderedAccessibility(f.options)).rejects.toThrow("Unexpected engine rule");
  });
  it("bounds standard-tag buckets and retains their dropped count", async () => {
    const f = fakeProjection(1, false, 1, 20);
    for (const [id, tags] of Object.entries(f.options.registry))
      f.options.registry[id] = tags.map((tag) => `${id}-${tag}`);
    const r = await projectRenderedAccessibility(f.options);
    if (r.status !== "completed") throw new Error("Expected completed projection");
    expect(r.ruleResults?.aggregates.violationTagCounts.length).toBe(L.tagBuckets);
    expect(r.truncation.tagBuckets).toBe(400 - L.tagBuckets);
  });
  it("rejects excess standard tags and invalid impacts at the contract boundary", () => {
    const c = completed();
    const rule = {
      id: "button-name",
      impact: "critical" as const,
      tags: Array.from({ length: 17 }, (_, i) => `wcag${i}`),
      affectedNodes: 0,
      nodes: [],
      droppedNodes: 0,
    };
    if (!c.ruleResults) throw new Error("Expected rule results");
    c.ruleResults.violations = [rule];
    c.ruleResults.aggregates.violationRules = 1;
    expect(BrowserAccessibilityEvidenceSchema.safeParse(c).success).toBe(false);
    c.ruleResults.violations = [{ ...rule, tags: [], impact: "invented" as "critical" }];
    expect(BrowserAccessibilityEvidenceSchema.safeParse(c).success).toBe(false);
  });
  it("invalid engine output becomes execution failure rather than an empty pass", async () => {
    const page = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ status: "completed", ruleResults: null }),
    } as unknown as Page;
    expect((await collectRenderedAccessibility(page, 1000, vi.fn())).status).toBe(
      "execution-failed",
    );
  });
  it("preserves separate accessibility evidence without overwriting HTTP/runtime/performance", () => {
    const c = emptyBrowserCollection("rich");
    c.accessibility = completed();
    const validated = finalizeBrowserCollection(c);
    const records = browserEvidenceRecords(validated, "owned-scan", "owned-collection");
    expect(records.some((r) => r.code === "BROWSER_NAVIGATION")).toBe(true);
    expect(records.find((r) => r.code === "BROWSER_ACCESSIBILITY_OBSERVATION")?.provenance).toBe(
      "OBSERVED",
    );
    expect(records.find((r) => r.code === "BROWSER_ACCESSIBILITY_RULES")?.provenance).toBe(
      "DERIVED",
    );
  });
  it("keeps IPC failure diagnostics private", async () => {
    const page = {
      evaluate: vi.fn(async () => {
        throw new Error("DISPOSABLE_NOT_A_SECRET");
      }),
    } as unknown as Page;
    const a = await collectRenderedAccessibility(page, 1000, vi.fn());
    expect(a.status).toBe("execution-failed");
    expect(a.ruleResults).toBeNull();
    expect(JSON.stringify(a)).not.toContain("DISPOSABLE_NOT_A_SECRET");
  });
  it("analysis timeout closes the existing worker without extending its deadline", async () => {
    vi.useFakeTimers();
    const page = { evaluate: vi.fn(() => new Promise(() => {})) } as unknown as Page;
    const close = vi.fn(async () => {});
    const pending = collectRenderedAccessibility(page, 100, close);
    await vi.advanceTimersByTimeAsync(100);
    expect((await pending).status).toBe("timeout");
    expect(close).toHaveBeenCalledOnce();
  });
  it("represents cancellation and unsupported engine distinctly", async () => {
    const controller = new AbortController();
    controller.abort();
    const page = {
      evaluate: vi.fn().mockRejectedValue(new Error("Page closed")),
    } as unknown as Page;
    expect(
      (await collectRenderedAccessibility(page, 1000, vi.fn(), controller.signal)).status,
    ).toBe("cancelled");
    const unsupported = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ status: "unsupported" }),
    } as unknown as Page;
    expect((await collectRenderedAccessibility(unsupported, 1000, vi.fn())).status).toBe(
      "unsupported",
    );
  });
});
