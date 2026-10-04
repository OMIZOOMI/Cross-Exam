import { expect, test } from "@playwright/test";
import { collectFixtureBrowserEvidence } from "../../apps/browser-worker/src/browser-collector";
import {
  BrowserEvidenceCollectionSchema,
  BROWSER_EVIDENCE_LIMITS as L,
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
function collect(
  fixture: Parameters<typeof collectFixtureBrowserEvidence>[0]["fixture"],
  options = {},
) {
  return collectFixtureBrowserEvidence({
    fixture,
    proxyServer: proxy.url,
    timeoutMs: 10_000,
    ...options,
  });
}
test("observes real navigation, redirect, runtime, dynamic DOM and resource evidence without sensitive fields", async () => {
  const collection = await collect("rich");
  expect(BrowserEvidenceCollectionSchema.safeParse(collection).success).toBe(true);
  expect(collection.outcome).toBe("completed");
  expect(collection.provenance).toBe("OBSERVED");
  expect(collection.navigation.status).toBe(200);
  expect(collection.navigation.chain).toHaveLength(2);
  expect(collection.navigation.finalUrl).toContain("/collector/rich");
  expect(collection.navigation.headers["x-content-type-options"]).toBe("nosniff");
  expect(
    collection.console.some(
      (entry) => entry.level === "warning" && entry.text.includes("Owned warning"),
    ),
  ).toBe(true);
  expect(
    collection.console.some(
      (entry) => entry.level === "error" && entry.text.includes("Owned console error"),
    ),
  ).toBe(true);
  expect(
    collection.pageErrors.some(
      (entry) => entry.name === "TypeError" && entry.message.includes("Owned runtime error"),
    ),
  ).toBe(true);
  expect(collection.dom?.title).toBe("Rendered fixture");
  expect(collection.dom?.description).toBe("Rendered fixture description");
  expect(collection.dom?.headings.map((entry) => entry.text)).toContain("Dynamic heading");
  expect(collection.dom?.forms[0]?.inputTypes).toContainEqual({ type: "password", count: 1 });
  expect(collection.dom?.links.some((entry) => entry?.endsWith("/collector/dynamic"))).toBe(true);
  expect(collection.dom?.resources.map((entry) => entry.type)).toEqual(
    expect.arrayContaining(["script", "stylesheet", "image"]),
  );
  expect(collection.requests.map((entry) => entry.resourceType)).toEqual(
    expect.arrayContaining(["xhr", "fetch", "script", "stylesheet", "image"]),
  );
  expect(
    collection.requests.some(
      (entry) => entry.url?.endsWith("/collector/failure") && entry.outcome === "failed",
    ),
  ).toBe(true);
  expect(
    collection.requests.some((entry) => entry.method === "POST" && entry.outcome === "failed"),
  ).toBe(true);
  const serialized = JSON.stringify(collection);
  expect(serialized).not.toContain("DISPOSABLE_NOT_A_SECRET");
  for (const key of [
    "authorization",
    "set-cookie",
    "localStorage",
    "sessionStorage",
    '"body":',
    '"stack":',
  ])
    expect(serialized).not.toContain(key);
  expect(JSON.stringify(collection.dom?.forms)).not.toContain('"value":');
  expect(paths).not.toContain("/collector/action");
  expect(paths).not.toContain("/collector/socket");
  expect(
    proxy.decisions.filter((entry) => entry.decision === "blocked").length,
  ).toBeGreaterThanOrEqual(2);
});
test("records explicit event, DOM, response and string truncation", async () => {
  const collection = await collect("bounds");
  expect(collection.outcome).toBe("completed");
  expect(collection.console.length).toBeLessThanOrEqual(L.console);
  expect(collection.pageErrors.length).toBeLessThanOrEqual(L.pageErrors);
  expect(collection.responses.length).toBeLessThanOrEqual(L.responses);
  for (const name of [
    "console",
    "pageErrors",
    "responses",
    "headings",
    "links",
    "forms",
    "resources",
  ] as const)
    expect(collection.truncation.dropped[name]).toBeGreaterThan(0);
  expect(collection.truncation.shortenedStrings).toBeGreaterThan(0);
  expect(Buffer.byteLength(JSON.stringify(collection))).toBeLessThanOrEqual(L.resultBytes);
  expect(JSON.stringify(collection)).not.toContain("DISPOSABLE_NOT_A_SECRET");
});
test("retention cannot expand the worker's existing request budget", async () => {
  const collection = await collect("requests");
  expect(collection.requests.length).toBeLessThanOrEqual(L.requests);
  expect(collection.truncation.dropped.requests).toBeGreaterThan(0);
  expect(paths.length).toBeLessThanOrEqual(64);
});
test("DOM inspection stops at its element cap and marks unknown remaining coverage", async () => {
  const collection = await collect("dom");
  expect(collection.outcome).toBe("completed");
  expect(collection.dom?.counts.inspectedElements).toBe(L.domElements);
  expect(collection.truncation.domInspectionLimit).toBe(true);
  expect(collection.dom?.headings.length).toBe(L.headings);
  expect(collection.truncation.dropped.headings).toBeGreaterThan(0);
});
test("bounded redirect loops produce failed navigation with explicit chain truncation", async () => {
  const collection = await collect("loop");
  expect(collection.navigation.outcome).toBe("failed");
  expect(collection.navigation.chain.length).toBeLessThanOrEqual(L.redirects + 1);
  expect(collection.truncation.dropped.redirects).toBeGreaterThan(0);
});
test("deadline stops observation and late requests without extending worker lifetime", async () => {
  const start = Date.now();
  const collection = await collect("slow", { timeoutMs: 1000 });
  expect(collection.outcome).toBe("timeout");
  expect(Date.now() - start).toBeLessThan(2500);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(paths).not.toContain("/collector/late");
});
test("cancellation closes a navigating browser and records no later events", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    expect((await collect("slow", { signal: controller.signal })).outcome).toBe("cancelled");
  } finally {
    clearTimeout(timer);
  }
  expect(paths).not.toContain("/collector/late");
});
test("proxy outage fails navigation without any direct fallback", async () => {
  await proxy.close();
  const collection = await collect("rich");
  expect(collection.outcome).toBe("navigation-failed");
  expect(collection.navigation.outcome).toBe("failed");
  expect(paths).toHaveLength(0);
});
