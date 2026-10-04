import {
  BrowserEvidenceCollectionSchema,
  type Evidence,
  EvidenceSchema,
} from "@crossexam/contracts";

import { browserRuntimeAnalysis } from "./performance";

export {
  browserRuntimeAnalysis,
  deriveCLS,
  deriveNavigation,
  finalizePerformance,
} from "./performance";

export { safeFailure, safeHeaders, safeObservedUrl, safeText } from "./safety";

/** Append these observations; never replace HTTP evidence or manufacture findings. */
export function browserEvidenceRecords(
  input: unknown,
  scanId: string,
  collectionId: string,
): Evidence[] {
  const collection = BrowserEvidenceCollectionSchema.parse(input);
  const observations = [
    ["BROWSER_NAVIGATION", "navigation", "Browser navigation", collection.navigation],
    ["BROWSER_CONSOLE", "metadata", "Browser console warnings and errors", collection.console],
    ["BROWSER_PAGE_ERRORS", "metadata", "Uncaught browser page errors", collection.pageErrors],
    ["BROWSER_REQUESTS", "network", "Observed browser requests", collection.requests],
    ["BROWSER_RESPONSES", "network", "Observed browser responses", collection.responses],
    ["BROWSER_RENDERED_DOM", "metadata", "Rendered browser document", collection.dom],
  ] as const;
  const records = observations
    .filter((entry) => entry[3] !== null)
    .map(([code, kind, title, data]) =>
      EvidenceSchema.parse({
        id: `${collectionId}-${code}`,
        scanId,
        source: collection.source,
        provenance: "OBSERVED",
        kind,
        code,
        title,
        url: collection.target,
        capturedAt: collection.collectedAt,
        collector: collection.collector,
        detail:
          "Direct Chromium observation of an owned fixture; incomplete outside the collection window. No causal findings.",
        data: {
          schemaVersion: collection.version,
          collectionId,
          scope: collection.scope,
          outcome: collection.outcome,
          observation: JSON.stringify(data),
          truncation: JSON.stringify(collection.truncation),
        },
      }),
    );
  if (collection.performance) {
    const { derivedNavigation, aggregates, deliveredTotals, metrics, ...raw } =
      collection.performance;
    for (const [code, provenance, observation] of [
      [
        "BROWSER_PERFORMANCE",
        "OBSERVED",
        {
          ...raw,
          metrics: {
            fcp: metrics.fcp,
            lcp: metrics.lcp,
            inp: metrics.inp,
            finalized: metrics.finalized,
          },
        },
      ],
      [
        "BROWSER_RUNTIME_ANALYSIS",
        "DERIVED",
        {
          derivedNavigation,
          aggregates,
          deliveredTotals,
          cls: metrics.cls,
          runtime: browserRuntimeAnalysis(collection),
        },
      ],
    ] as const)
      records.push(
        EvidenceSchema.parse({
          id: `${collectionId}-${code}`,
          scanId,
          source: "fixture",
          provenance,
          kind: "performance",
          code,
          title:
            provenance === "OBSERVED"
              ? "Browser LAB performance entries"
              : "Derived browser LAB measurements",
          url: collection.target,
          capturedAt: collection.collectedAt,
          collector: "chromium-lab-v1",
          detail:
            "Finite top-level document LAB window; controlled fixture only. No field/RUM verdict or performance score.",
          data: { schemaVersion: 1, collectionId, observation: JSON.stringify(observation) },
        }),
      );
  }
  if (collection.accessibility) {
    const { observation, ruleResults, ...identity } = collection.accessibility;
    for (const [code, provenance, data] of [
      ["BROWSER_ACCESSIBILITY_OBSERVATION", "OBSERVED", { ...identity, observation }],
      ["BROWSER_ACCESSIBILITY_RULES", "DERIVED", { ...identity, ruleResults }],
    ] as const)
      records.push(
        EvidenceSchema.parse({
          id: `${collectionId}-${code}`,
          scanId,
          source: "fixture",
          provenance,
          kind: "accessibility",
          code,
          title: "Controlled rendered accessibility evidence",
          url: collection.target,
          capturedAt: collection.accessibility.collectedAt,
          collector: collection.accessibility.collector,
          detail:
            "Pinned automated rule results from a finite rendered snapshot. Incomplete results require manual review; no conformance verdict.",
          data: { collectionId, observation: JSON.stringify(data) },
        }),
      );
  }
  return records;
}
