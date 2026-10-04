import type { Evidence, Finding, ScanReport } from "@crossexam/contracts";
import type { inspectHtml } from "./documents";

export function addEvidence(
  report: ScanReport,
  input: Omit<Evidence, "id" | "scanId" | "source" | "provenance" | "collector">,
): string {
  const id = `E-${String(report.evidence.length + 1).padStart(3, "0")}`;
  report.evidence.push({
    ...input,
    id,
    scanId: report.summary.id,
    source: "live",
    provenance: "OBSERVED",
    collector: "http-document-v1",
  });
  return id;
}

export function addFinding(
  report: ScanReport,
  input: Omit<Finding, "id" | "claimId" | "verdictId" | "provenance">,
) {
  const index = String(report.findings.length + 1).padStart(3, "0");
  const claimId = `C-${index}`;
  const verdictId = `V-${index}`;
  report.claims.push({
    id: claimId,
    scanId: report.summary.id,
    statement: input.description,
    provenance: "DERIVED",
    evidenceIds: input.evidenceIds,
    proposedBy: "Deterministic rule",
    scope: {
      observation: "Returned HTTP response and parsed document in this bounded investigation.",
      conditions: ["The recorded request and response only."],
      limitations: ["No browser execution.", "No independent reproduction or causal conclusion."],
    },
    falsifier:
      "Repeat the bounded HTTP collection; the recorded rule predicate is no longer present.",
    createdAt: new Date().toISOString(),
    status: "proposed",
  });
  report.verdicts.push({
    id: verdictId,
    claimId,
    status: "confirmed",
    rationale:
      "This rule matches the recorded response or returned HTML only. No browser execution, independent reproduction, AI review, or broader security/accessibility conclusion is implied.",
    evidenceIds: input.evidenceIds,
    experimentIds: [],
    decidedBy: "Deterministic rule",
  });
  report.findings.push({ ...input, id: `F-${index}`, claimId, verdictId, provenance: "DERIVED" });
}

export function documentFindings(
  report: ScanReport,
  document: ReturnType<typeof inspectHtml>,
  path: string,
  metadataId: string,
  structureId: string,
  resourceId: string,
) {
  const rule = (
    condition: boolean,
    title: string,
    description: string,
    category: Finding["category"],
    evidenceId: string,
    recommendation: string,
  ) => {
    if (!condition) return;
    addFinding(report, {
      title,
      description: `${path}: ${description}`,
      category,
      severity: "low",
      evidenceIds: [evidenceId],
      affectedPaths: [path],
      recommendation,
      verification:
        "Fetch the same URL again and inspect the returned HTML for this attribute or element. Browser-generated content was not inspected.",
    });
  };
  rule(
    !document.metadata.title,
    "Page title is missing",
    "The first title element in the returned HTML is absent or empty.",
    "Metadata",
    metadataId,
    "Give the document a concise, descriptive title.",
  );
  rule(
    !document.metadata.description,
    "Meta description is missing",
    "The returned HTML has no non-empty meta description. Search appearance and ranking were not tested.",
    "Metadata",
    metadataId,
    "Consider a page-specific description for this public document.",
  );
  rule(
    !document.metadata.lang,
    "Document language is undeclared",
    "The returned HTML has no non-empty lang attribute on its html element. This is a markup observation, not an accessibility audit.",
    "Accessibility",
    metadataId,
    "Declare the language that matches the document content.",
  );
  rule(
    !document.metadata.viewport,
    "Viewport metadata is missing",
    "The returned HTML has no non-empty viewport metadata. Mobile rendering was not measured.",
    "Metadata",
    metadataId,
    "Review whether the document needs a responsive viewport declaration.",
  );
  rule(
    document.metadata.canonicalStatus === "invalid-reference",
    "Canonical reference is empty or unsupported",
    "A canonical declaration does not contain a usable HTTP(S) URL reference. Its destination was not fetched.",
    "Metadata",
    metadataId,
    "Declare a valid public canonical URL if one is intended.",
  );
  rule(
    document.mixedContentCount > 0,
    "HTTPS HTML declares HTTP resources",
    `${document.mixedContentCount} resource declaration(s) use HTTP on an HTTPS document. Browser blocking, upgrades, and actual resource loads were not tested.`,
    "Headers",
    resourceId,
    "Review these declarations and use HTTPS resources where available.",
  );
  rule(
    document.structure.imagesWithoutAlt > 0,
    "Images omit the alt attribute",
    `${document.structure.imagesWithoutAlt} image element(s) omit alt in the returned HTML. Appropriate alternative text depends on each image's purpose.`,
    "Accessibility",
    structureId,
    "Review each image: provide meaningful alternative text, or an empty alt attribute for a decorative image.",
  );
}
