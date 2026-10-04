import {
  BrowserEvidenceCollectionSchema,
  type Evidence,
  EvidenceSchema,
} from "@crossexam/contracts";

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
  return observations
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
          "Direct Chromium observation of an owned fixture; incomplete outside the collection window. No findings or performance measurements.",
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
}
