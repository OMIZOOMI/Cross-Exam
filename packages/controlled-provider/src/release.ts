import { evidenceCatalog } from "@crossexam/agents";
import { type ScanReport, ScanReportSchema } from "@crossexam/contracts";
import { z } from "zod";
import { EXPORT_POLICY } from "../../agents/src/external-data";
import { hash, immutable } from "../../agents/src/provider";

export const RUN_LIMITS = Object.freeze({
  inputBytes: 4 * 1024 * 1024,
  resultBytes: 4 * 1024 * 1024,
  checkpointBytes: 64 * 1024,
  ledgerBytes: 16 * 1024,
  runs: 20,
  outboundBytes: 16 * 1024,
});
export const RELEASE_VERSION = "stage14c-controlled-fixture-v1";
export const FIXTURE_KEY = "owned-numeric-tribunal-v1";
export const PROFILE = "openai-responses-luna-none-v1";
export const ReleaseIdSchema = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const ControlledReleaseSchema = z
  .object({
    version: z.literal(RELEASE_VERSION),
    releaseId: ReleaseIdSchema,
    fixtureKey: z.literal(FIXTURE_KEY),
    profile: z.literal(PROFILE),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    reportSchemaVersion: z.literal(2),
    proposalSchemaVersion: z.literal(1),
    exportPolicy: z.literal(EXPORT_POLICY),
  })
  .strict();
export type ControlledRelease = z.infer<typeof ControlledReleaseSchema>;

/** Hand-authored owned numeric fixture, never live website evidence or a paid acceptance result. */
export function ownedNumericFixture(): ScanReport {
  const scanId = "scan-owned-numeric-tribunal-v1";
  const date = "2026-10-05T00:00:00.000Z";
  return immutable(
    ScanReportSchema.parse({
      schemaVersion: 2,
      summary: {
        id: scanId,
        source: "fixture",
        targetUrl: "https://controlled.fixture.test/",
        status: "completed",
        startedAt: date,
        durationMs: 100,
        pageCount: 1,
        evidenceCount: 2,
        findingCount: 0,
      },
      pages: [
        {
          id: "P-owned",
          path: "/",
          title: "Owned numeric fixture",
          statusCode: 200,
          durationMs: 100,
          linksTo: [],
        },
      ],
      evidence: [
        {
          id: "E-owned-status",
          scanId,
          source: "fixture",
          provenance: "OBSERVED",
          kind: "network",
          code: "HTTP_STATUS",
          collector: "http-document-v1",
          url: "https://controlled.fixture.test/",
          capturedAt: date,
          title: "Owned response fixture",
          detail: "Fixed numeric test input; no target contacted.",
          data: { statusCode: 200, responseBytes: 400, durationMs: 100, redirectCount: 0 },
        },
        {
          id: "E-owned-structure",
          scanId,
          source: "fixture",
          provenance: "OBSERVED",
          kind: "metadata",
          code: "DOCUMENT_STRUCTURE",
          collector: "http-document-v1",
          url: "https://controlled.fixture.test/",
          capturedAt: date,
          title: "Owned structure fixture",
          detail: "Fixed presence/count test input; no target contacted.",
          data: {
            images: 2,
            imagesWithoutAlt: 1,
            scripts: 1,
            stylesheets: 1,
            forms: 0,
            internalLinkCount: 2,
            externalLinkCount: 0,
          },
        },
      ],
      metrics: [],
      claims: [],
      challenges: [],
      experiments: [],
      verdicts: [],
      findings: [],
      agentRuns: [],
      tribunalRuns: [],
    }),
  );
}
export const fixtureSnapshotHash = () => hash(JSON.stringify(ownedNumericFixture()));
/** Explicit ID supplied by the owner/host. Never mint an admission ID on startup or replay. */
export function createControlledRelease(releaseId: string): ControlledRelease {
  return immutable(
    ControlledReleaseSchema.parse({
      version: RELEASE_VERSION,
      releaseId,
      fixtureKey: FIXTURE_KEY,
      profile: PROFILE,
      snapshotHash: fixtureSnapshotHash(),
      reportSchemaVersion: 2,
      proposalSchemaVersion: 1,
      exportPolicy: EXPORT_POLICY,
    }),
  );
}
export function validateAdmission(input: unknown, release: unknown) {
  const report = ScanReportSchema.parse(input);
  const bound = ControlledReleaseSchema.parse(release);
  const json = JSON.stringify(report);
  if (
    report.summary.source !== "fixture" ||
    report.tribunalRuns.length ||
    !evidenceCatalog(report).evidence.length ||
    Buffer.byteLength(json) > RUN_LIMITS.inputBytes ||
    hash(json) !== bound.snapshotHash ||
    bound.snapshotHash !== fixtureSnapshotHash()
  )
    throw new Error("ADMISSION_DENIED");
  return { report: immutable(report), release: immutable(bound), json };
}
