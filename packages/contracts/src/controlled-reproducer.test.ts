import { describe, expect, it } from "vitest";
import {
  ControlledReproducerIntentSchema,
  ControlledReproducerObservationSchema,
  ControlledReproducerRunSchema,
} from "./controlled-reproducer";

const intent = {
  schemaVersion: 1,
  intentId: "offline-test-001",
  executionMode: "injected-fake",
  testOnly: true,
  operationId: "controlled-fixture-empty-navigation-v1",
  fixtureKey: "browser-empty-navigation-v1",
};
describe("offline controlled Reproducer contracts", () => {
  it("accepts only the explicit fixed test intent", () => {
    expect(ControlledReproducerIntentSchema.safeParse(intent).success).toBe(true);
  });
  it.each([
    { operationId: "fixture-document-repeat-v1" },
    { fixtureKey: "rich" },
    { executionMode: "real" },
    { testOnly: false },
    { intentId: "../../escape" },
    ...[
      "url",
      "path",
      "headers",
      "script",
      "method",
      "timeout",
      "selector",
      "parameters",
      "approvedBy",
    ].map((key) => ({ [key]: "untrusted" })),
  ])("rejects widened intent %j", (patch) => {
    expect(ControlledReproducerIntentSchema.safeParse({ ...intent, ...patch }).success).toBe(false);
  });
  // Shape-only synthetic test data, never a real receipt or observation authority.
  const syntheticFutureProjection = {
    schemaVersion: 1,
    fixtureKey: "browser-empty-navigation-v1",
    source: "fixture",
    provenance: "OBSERVED",
    navigationOutcome: "completed",
    statusCode: 200,
    titlePresent: true,
    redirectCount: 0,
    durationMs: 1,
    capturedAt: "2026-10-06T00:00:00.000Z",
    completeness: { complete: true, truncated: false },
  };
  it("validates the future shape without admitting it into an offline run", () => {
    expect(ControlledReproducerObservationSchema.safeParse(syntheticFutureProjection).success).toBe(
      true,
    );
    expect(
      ControlledReproducerRunSchema.shape.observation.safeParse(syntheticFutureProjection).success,
    ).toBe(false);
  });
  it.each([
    { completeness: { complete: false, truncated: false } },
    { completeness: { complete: true, truncated: true } },
    { statusCode: 999 },
    { durationMs: -1 },
    { durationMs: 10001 },
    { redirectCount: 1 },
    ...[
      "url",
      "path",
      "body",
      "html",
      "headers",
      "title",
      "selector",
      "screenshot",
      "collection",
      "providerText",
    ].map((key) => ({ [key]: "private" })),
  ])("rejects incomplete/raw/over-budget future projection %j", (patch) => {
    expect(
      ControlledReproducerObservationSchema.safeParse({ ...syntheticFutureProjection, ...patch })
        .success,
    ).toBe(false);
  });
});
