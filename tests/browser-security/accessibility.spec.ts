import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { collectFixtureBrowserEvidence } from "../../apps/browser-worker/src/browser-collector";
import {
  ACCESSIBILITY_ENGINE_VERSION,
  BrowserAccessibilityEvidenceSchema,
  BrowserEvidenceCollectionSchema,
  BROWSER_ACCESSIBILITY_LIMITS as L,
} from "../../packages/contracts/src/index";
import type { EgressProxy } from "../../packages/engine/src/browser-egress/types";
import { startOwnedCollectorProxy } from "./collector-proxy";

let proxy: EgressProxy;
let paths: string[];
test.beforeEach(async () => {
  paths = [];
  proxy = await startOwnedCollectorProxy(paths);
});
test.afterEach(async () => {
  await proxy.close();
});
const collect = (
  fixture: Parameters<typeof collectFixtureBrowserEvidence>[0]["fixture"],
  options = {},
) =>
  collectFixtureBrowserEvidence({ fixture, proxyServer: proxy.url, timeoutMs: 10000, ...options });
const rules = (c: Awaited<ReturnType<typeof collect>>) =>
  BrowserAccessibilityEvidenceSchema.parse(c.accessibility);

test("pinned engine evaluates rendered names, forms, language, headings, ARIA and both contrast outcomes", async () => {
  const c = await collect("accessibilityBad");
  const a = rules(c);
  expect(c.outcome).toBe("completed");
  expect(a.status).toBe("completed");
  expect(a.engineVersion).toBe(ACCESSIBILITY_ENGINE_VERSION);
  const ids = a.ruleResults?.violations.map((r) => r.id) ?? [];
  for (const id of [
    "image-alt",
    "button-name",
    "label",
    "link-name",
    "html-has-lang",
    "heading-order",
    "color-contrast",
    "aria-required-attr",
    "aria-roles",
  ])
    expect(ids).toContain(id);
  expect(a.ruleResults?.passes.ruleIds).toContain("color-contrast");
  expect(a.ruleResults?.incomplete.some((r) => r.id === "color-contrast")).toBe(true);
  const button = a.ruleResults?.violations.find((r) => r.id === "button-name");
  expect(button?.affectedNodes).toBe(2);
  expect(button?.nodes.map((n) => n.path)).toEqual(
    expect.arrayContaining([expect.stringContaining("button:nth-of-type(4)")]),
  );
  expect(a.observation?.languagePresent).toBe(false);
  expect(JSON.stringify(a)).not.toContain("DISPOSABLE_NOT_A_SECRET");
  expect(JSON.stringify(a)).not.toContain("Owned failing contrast");
  expect(JSON.stringify(a)).not.toContain("failureSummary");
  expect(BrowserEvidenceCollectionSchema.safeParse(c).success).toBe(true);
});

test("passing counterpart retains pass/inapplicable summaries without a compliance verdict", async () => {
  const a = rules(await collect("accessibilityGood"));
  expect(a.status).toBe("completed");
  expect(a.ruleResults?.aggregates.violationRules).toBe(0);
  expect(a.ruleResults?.passes.ruleIds).toEqual(
    expect.arrayContaining([
      "image-alt",
      "button-name",
      "label",
      "html-has-lang",
      "html-lang-valid",
      "color-contrast",
      "link-name",
    ]),
  );
  expect(a.ruleResults?.inapplicable.count).toBeGreaterThan(0);
  expect(a.observation?.languagePresent).toBe(true);
});

test("open shadow roots have structural locators; hidden/closed-shadow/frame violations are excluded", async () => {
  const a = rules(await collect("accessibilityScope"));
  expect(a.status).toBe("completed");
  expect(a.observation?.openShadowRoots).toBe(1);
  expect(a.observation?.excludedFrames).toBe(1);
  const button = a.ruleResults?.violations.find((r) => r.id === "button-name");
  expect(button?.affectedNodes).toBe(1);
  expect(button?.nodes[0]?.path).toContain(">shadow>button:nth-of-type(1)");
  expect(a.ruleResults?.violations.some((r) => r.id === "html-has-lang")).toBe(false);
});

test("strict page CSP remains enforced while locally bundled engine evaluates rendered DOM", async () => {
  const c = await collect("accessibilityCsp");
  const a = rules(c);
  expect(a.status).toBe("completed");
  expect(c.console.some((r) => r.text.includes("Content Security Policy"))).toBe(true);
  expect(a.ruleResults?.violations.find((r) => r.id === "button-name")?.affectedNodes).toBe(1);
  expect(a.ruleResults?.violations.some((r) => r.id === "image-alt")).toBe(false);
  expect(paths).not.toContain("/collector/image.svg");
  expect(paths.filter((p) => p.endsWith(".js"))).toEqual(["/collector/accessibility-csp.js"]);
});

test("high-volume rules retain deterministic representatives, complete counts and combined ceiling", async () => {
  const c = await collect("bounds");
  const a = rules(c);
  expect(a.status).toBe("completed");
  expect(a.truncation.violationNodes).toBeGreaterThan(0);
  const label = a.ruleResults?.violations.find((r) => r.id === "label");
  expect(label?.affectedNodes).toBe(60);
  expect(label?.nodes.length).toBeLessThanOrEqual(L.nodesPerRule);
  expect(label?.droppedNodes).toBe(60 - (label?.nodes.length ?? 0));
  expect(a.ruleResults?.violations.map((r) => r.id)).toEqual(
    a.ruleResults?.violations.map((r) => r.id).sort(),
  );
  expect(Buffer.byteLength(JSON.stringify(a))).toBeLessThanOrEqual(L.payloadBytes);
  expect(Buffer.byteLength(JSON.stringify(c))).toBeLessThanOrEqual(32768);
  expect(JSON.stringify(c)).not.toContain("DISPOSABLE_NOT_A_SECRET");
});

test("DOM cap and navigation/timeout/cancellation failures never become zero-violation results", async () => {
  const a = rules(await collect("dom"));
  expect(a.status).toBe("dom-limit");
  expect(a.ruleResults).toBeNull();
  const timed = await collect("slow", { timeoutMs: 1200 });
  expect(timed.outcome).toBe("timeout");
  expect(timed.accessibility).toBeNull();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const cancelled = await collect("slow", { signal: controller.signal });
    expect(cancelled.outcome).toBe("cancelled");
    expect(cancelled.accessibility).toBeNull();
  } finally {
    clearTimeout(timer);
  }
  expect(paths).not.toContain("/collector/late");
  await proxy.close();
  const failed = await collect("rich", { timeoutMs: 1500 });
  expect(failed.outcome).not.toBe("completed");
  expect(failed.accessibility).toBeNull();
});

test("analysis preserves private/mixed-DNS/POST/websocket policy and prior measurement window", async () => {
  const c = await collect("rich");
  const a = rules(c);
  expect(a.status).toBe("completed");
  expect(a.ruleResults?.incomplete.some((r) => r.id === "color-contrast")).toBe(true);
  expect(a.observation?.snapshotTimeMs).toBeGreaterThan(
    c.performance?.observationWindow.endTime ?? Infinity,
  );
  for (const host of ["private.crossexam-fixture", "mixed.crossexam-fixture"])
    expect(c.requests.some((r) => r.url?.includes(host) && r.outcome === "failed")).toBe(true);
  expect(c.requests.some((r) => r.method === "POST" && r.outcome === "failed")).toBe(true);
  expect(paths).not.toContain("/collector/action");
  expect(paths).not.toContain("/collector/socket");
  expect(JSON.stringify(c)).not.toContain("DISPOSABLE_NOT_A_SECRET");
});

test("prepared-root-style esbuild bundle includes the pinned engine and self-contained renderer projection", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "crossexam-axe-bundle-"));
  const require = createRequire(import.meta.url);
  try {
    const output = path.join(temporary, "collector.cjs");
    await build({
      stdin: {
        contents:
          'export { collectFixtureBrowserEvidence } from "./apps/browser-worker/src/browser-collector";',
        resolveDir: process.cwd(),
        loader: "ts",
      },
      outfile: output,
      bundle: true,
      platform: "node",
      format: "cjs",
      plugins: [
        {
          name: "existing-playwright-runtime",
          setup(builder) {
            builder.onResolve({ filter: /^@playwright\/test$/ }, () => ({
              path: require.resolve("@playwright/test"),
              external: true,
            }));
          },
        },
      ],
    });
    expect(await readFile(output, "utf8")).toContain("http://mozilla.org/MPL/2.0/");
    const bundled = require(output) as {
      collectFixtureBrowserEvidence: typeof collectFixtureBrowserEvidence;
    };
    const c = await bundled.collectFixtureBrowserEvidence({
      fixture: "accessibilityBad",
      proxyServer: proxy.url,
    });
    const a = rules(c);
    expect(a.status).toBe("completed");
    expect(a.engineVersion).toBe(ACCESSIBILITY_ENGINE_VERSION);
    expect(a.ruleResults?.violations.some((r) => r.id === "button-name")).toBe(true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
