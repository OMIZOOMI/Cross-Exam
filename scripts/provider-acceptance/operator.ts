import { evidenceCatalog, roleView } from "../../packages/agents/src/evidence-digest";
import { EXPORT_POLICY, externalExportDescriptor } from "../../packages/agents/src/external-data";
import { immutable } from "../../packages/agents/src/provider";
import { TRIBUNAL_INSTRUCTIONS, TRIBUNAL_LIMITS } from "../../packages/contracts/src/tribunal";
import {
  type RecoveryReceipt,
  runControlledProvider,
} from "../../packages/controlled-provider/src/index";
import {
  createControlledRelease,
  FIXTURE_KEY,
  fixtureSnapshotHash,
  ownedNumericFixture,
  ReleaseIdSchema,
  RUN_LIMITS,
} from "../../packages/controlled-provider/src/release";
import { StoreError } from "../../packages/controlled-provider/src/storage";
import { createOpenAIProvider } from "../../packages/provider-openai/src/index";
import {
  ENDPOINT,
  MODEL,
  PROFILE,
  prepareWire,
  WIRE_LIMITS,
} from "../../packages/provider-openai/src/wire";

export class OperatorError extends Error {
  constructor(readonly code: "OPERATOR_ARGUMENTS" | "OPERATOR_CONFIGURATION" | "PREVIEW_LIMIT") {
    super(code);
  }
}

/** Pure preparation: no adapter, credential lookup, release creation or filesystem access. */
export function previewAcceptance() {
  const report = ownedNumericFixture();
  const wire = prepareWire({
    schemaVersion: 1,
    role: "Explorer",
    instructions: TRIBUNAL_INSTRUCTIONS,
    view: roleView(report, "Explorer", evidenceCatalog(report)),
    maxOutputTokens: TRIBUNAL_LIMITS.explorerTokens,
    timeoutMs: 20000,
    semanticRetries: 0,
  });
  if (wire.requestBytes > RUN_LIMITS.outboundBytes) throw new OperatorError("PREVIEW_LIMIT");
  return immutable({
    operation: "preview" as const,
    fixture: {
      key: FIXTURE_KEY,
      snapshotHash: fixtureSnapshotHash(),
      scanId: report.summary.id,
      source: report.summary.source,
      reportSchemaVersion: report.schemaVersion,
      description: "Hand-authored owned numeric/presence fixture; no website was contacted.",
    },
    endpoint: ENDPOINT,
    profile: PROFILE,
    model: MODEL,
    explorer: {
      body: wire.json,
      bytes: wire.requestBytes,
      requestHash: wire.requestHash,
      maximumBytes: RUN_LIMITS.outboundBytes,
      withinAcceptanceLimit: true,
    },
    breaker: {
      exactBodyAvailable: false,
      reason:
        "The exact request depends on future host-accepted Explorer claims; none are invented.",
      exportPolicy: EXPORT_POLICY,
      dataFields: [
        "schemaVersion",
        "exportPolicy",
        "role",
        "layers",
        "limitations",
        "dataTrust",
        "evidence",
        "claims",
        "omittedEvidence",
      ],
      evidenceFields: externalExportDescriptor.evidenceKeys,
      claimFields: externalExportDescriptor.claimKeys,
      variableFields: [
        "claims[].id",
        "claims[].statement",
        "claims[].scope.observation",
        "claims[].scope.conditions",
        "claims[].scope.limitations",
        "claims[].falsifier",
        "claims[].evidenceIds",
      ],
      maximumClaims: TRIBUNAL_LIMITS.claims,
      maximumReferencesPerClaim: TRIBUNAL_LIMITS.references,
      maximumBytes: RUN_LIMITS.outboundBytes,
      maximumChallenges: TRIBUNAL_LIMITS.challenges,
    },
    limits: {
      roleDeadlineMs: TRIBUNAL_LIMITS.roleMs,
      tribunalDeadlineMs: TRIBUNAL_LIMITS.totalMs,
      transportTimeoutMs: WIRE_LIMITS.timeoutMs,
      explorerOutputTokens: TRIBUNAL_LIMITS.explorerTokens,
      breakerOutputTokens: TRIBUNAL_LIMITS.breakerTokens,
      maximumCalls: 2,
      retries: 0,
    },
    releaseReserved: false,
    providerCalls: 0,
  });
}

type Dependencies = {
  // Only the trusted CLI/bootstrap supplies this callback. Preview never invokes it.
  readCredential?: () => string | undefined;
  transport?: typeof fetch;
  directory?: string;
  signal?: AbortSignal;
};

/** Print only host receipt metadata, never canonical model text or a provider envelope. */
function safeReceipt(receipt: RecoveryReceipt) {
  const audits =
    receipt.report?.tribunalRuns[0]?.agentRuns ??
    [receipt.explorer?.audit, receipt.breaker?.audit].filter((a) => a !== undefined);
  return immutable({
    operation: "execute" as const,
    releaseId: receipt.releaseId,
    status: receipt.status,
    resultHash: receipt.resultHash ?? null,
    roles: audits.map((a) => ({
      role: a.role,
      status: a.status,
      calls: a.calls,
      acceptedCount: a.acceptedIds.length,
    })),
    note: "This is a durable host receipt, not paid-provider acceptance or a billing attestation.",
  });
}

/** Operator-only; cannot accept reports, endpoints, models or implicit release IDs. */
export async function runOperator(args: readonly string[], dependencies: Dependencies = {}) {
  if (args.length === 1 && args[0] === "preview") return previewAcceptance();
  if (
    args.length !== 3 ||
    args[0] !== "execute" ||
    args[1] !== "--release-id" ||
    !ReleaseIdSchema.safeParse(args[2]).success
  )
    throw new OperatorError("OPERATOR_ARGUMENTS");
  let credential: string | undefined;
  try {
    credential = dependencies.readCredential?.();
  } catch {
    throw new OperatorError("OPERATOR_CONFIGURATION");
  }
  if (
    typeof credential !== "string" ||
    !credential.length ||
    credential.length > 4096 ||
    /\s/.test(credential) ||
    [...credential].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new OperatorError("OPERATOR_CONFIGURATION");
  const release = createControlledRelease(args[2] as string);
  const provider = createOpenAIProvider({
    apiKey: credential,
    ...(dependencies.transport ? { transport: dependencies.transport } : {}),
  });
  return safeReceipt(
    await runControlledProvider(ownedNumericFixture(), release, provider, {
      directory: dependencies.directory,
      signal: dependencies.signal,
    }),
  );
}

export function safeOperatorError(error: unknown) {
  return {
    error:
      error instanceof OperatorError || error instanceof StoreError
        ? error.code
        : "OPERATOR_FAILED",
    note: "No automatic retry. Preserve the release and storage for provider-free recovery.",
  };
}

export function renderOperatorOutput(output: Awaited<ReturnType<typeof runOperator>>): string {
  if (output.operation !== "preview") return JSON.stringify(output);
  return [
    "CROSSEXAM CONTROLLED ACCEPTANCE PREVIEW — NO CALL / NO RELEASE",
    `Fixture: ${output.fixture.key}`,
    `Snapshot SHA-256: ${output.fixture.snapshotHash}`,
    `Profile: ${output.profile}; model: ${output.model}`,
    `Explorer: ${output.explorer.bytes} UTF-8 bytes / ${output.explorer.maximumBytes} maximum`,
    `Explorer request SHA-256: ${output.explorer.requestHash}`,
    "Exact Explorer body (one JSON line; display delimiters/newlines are not sent):",
    "--- BEGIN EXPLORER BODY ---",
    output.explorer.body,
    "--- END EXPLORER BODY ---",
    `Breaker policy: ${JSON.stringify(output.breaker)}`,
    `Limits: ${JSON.stringify(output.limits)}`,
    "Preview performed no credential lookup, network call, release reservation or storage write.",
  ].join("\n");
}
