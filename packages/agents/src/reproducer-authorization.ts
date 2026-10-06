import type {
  ReproducerAuthorizationMetadata,
  ReproducerOperationId,
  ReproducerPlan,
} from "@crossexam/contracts";
import { hash, immutable } from "./provider";

/** Interface registry, not operation implementations or target/parameter admission. */
export const REPRODUCER_OPERATIONS = immutable([
  {
    id: "fixture-document-repeat-v1" as const,
    executionMode: "injected-fake" as const,
    parametersAllowed: false as const,
  },
]);
export const OPERATION_POLICY_HASH = hash(
  JSON.stringify({
    version: 1,
    operations: REPRODUCER_OPERATIONS,
    execution: "injected-fake-only; no-real-operation; no-parameters",
    timeoutMs: 5000,
  }),
);

declare const operationBrand: unique symbol;
/** Opaque in-process object delivered only to the trusted fake executor, never a provider. */
export interface ReproducerOperationCapability {
  readonly [operationBrand]: true;
}
const operations = new WeakMap<
  ReproducerOperationCapability,
  Readonly<{
    operation: Readonly<{
      id: ReproducerOperationId;
      executionMode: "injected-fake";
      parametersAllowed: false;
    }>;
    bindingHash: string;
  }>
>();
/** Trusted executor inspection, not a serializable authorization or model input. */
export function resolveFakeOperation(capability: ReproducerOperationCapability) {
  const operation = operations.get(capability);
  if (!operation) throw new Error("INVALID_OPERATION_CAPABILITY");
  return operation.operation;
}

/** Internal trusted-host issuance. Nothing returned here is exported in an artifact/view. */
export function issueReproducerAuthorization(binding: {
  runId: string;
  sessionId: string;
  parentSnapshotHash: string;
  parentSkepticReviewHash: string | null;
  plan: ReproducerPlan;
}) {
  const operation = REPRODUCER_OPERATIONS.find((o) => o.id === binding.plan.operationId);
  if (!operation || binding.plan.runId !== binding.runId)
    throw new Error("INVALID_AUTHORIZATION_BINDING");
  const bound = immutable({
    runId: binding.runId,
    sessionId: binding.sessionId,
    planId: binding.plan.id,
    parentSnapshotHash: binding.parentSnapshotHash,
    parentSkepticReviewHash: binding.parentSkepticReviewHash,
    planHash: hash(JSON.stringify(binding.plan)),
    operationPolicyHash: OPERATION_POLICY_HASH,
  });
  const bindingHash = hash(JSON.stringify(bound));
  const issuedAt = new Date().toISOString();
  let consumed = false;
  return Object.freeze({
    consume(expectedBindingHash: string): {
      readonly capability: ReproducerOperationCapability;
      readonly metadata: ReproducerAuthorizationMetadata;
    } {
      if (consumed || expectedBindingHash !== bindingHash)
        throw new Error("AUTHORIZATION_NOT_AVAILABLE");
      // Synchronous consume precedes capability creation and every executor invocation.
      consumed = true;
      const capability = Object.freeze(Object.create(null)) as ReproducerOperationCapability;
      operations.set(capability, Object.freeze({ operation, bindingHash }));
      return Object.freeze({
        capability,
        metadata: immutable({
          schemaVersion: 1 as const,
          ...bound,
          bindingHash,
          issuedAt,
          consumedAt: new Date().toISOString(),
          attempts: 1 as const,
          guarantee: "one-trusted-host-attempt-per-capability-in-one-process" as const,
        }),
      });
    },
    bindingHash,
  });
}
