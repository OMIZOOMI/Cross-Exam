import { readFileSync } from "node:fs";
import {
  createReproducerSession,
  createSkepticSession,
  createTribunalSession,
} from "@crossexam/agents";
import { ScanReportSchema } from "@crossexam/contracts";
import { hash, immutable } from "../../agents/src/provider";

// Exact hand-authored numeric parent from the accepted owned fixture; never a live observation.
// Dedicated source asset, no import of the test fixture table or paid-provider path.
export const INPUT_SNAPSHOT_HASH =
  "c418e840c4d0ea98cca6554fe008d41612423202e86e008c43e5088c1ee7c7ad";
const sourceIdentity = Object.freeze({
  provider: "owned-fixture-preflight-fake",
  model: "deterministic-v1",
});
const response = (payload: unknown) => ({ kind: "response" as const, payload });
export async function createOwnedPreflightParent() {
  const input = ScanReportSchema.parse(
    JSON.parse(readFileSync(new URL("./owned-preflight-input.json", import.meta.url), "utf8")),
  );
  if (hash(JSON.stringify(input)) !== INPUT_SNAPSHOT_HASH) throw new Error("OWNED_INPUT_MISMATCH");
  const report = await createTribunalSession(immutable(input), {
    Explorer: {
      provider: "owned-preflight-fake",
      model: "deterministic-v1",
      adapter: {
        run: async () =>
          response({
            schemaVersion: 1,
            claims: [
              {
                statement: "The fixed numeric fixture contains an HTTP status observation.",
                scope: {
                  observation: "Hand-authored owned numeric input.",
                  conditions: [],
                  limitations: ["No target was contacted."],
                },
                falsifier: "The fixed input contains no such status fact.",
                evidenceIds: ["E-owned-status"],
              },
            ],
          }),
      },
    },
    Breaker: {
      provider: "owned-preflight-fake",
      model: "deterministic-v1",
      adapter: {
        run: async (r) =>
          response({
            schemaVersion: 1,
            challenges: [
              {
                claimId: r.view.claims[0]?.id,
                category: "reproduction-gap",
                question:
                  "Can an owned operation produce a separately attested navigation receipt?",
                evidenceIds: ["E-owned-status"],
              },
            ],
          }),
      },
    },
  }).run();
  const skepticReview = await createSkepticSession(report, {
    executionMode: "injected-fake",
    ...sourceIdentity,
    adapter: { run: async () => response({ schemaVersion: 1, challenges: [] }) },
  }).run();
  const sourceRun = await createReproducerSession(
    report,
    {
      executionMode: "injected-fake",
      ...sourceIdentity,
      planner: {
        run: async (r) =>
          response({
            schemaVersion: 1,
            plans: [
              {
                claimId: r.view.claims[0]?.id,
                challengeId: r.view.challenges[0]?.id,
                operationId: "fixture-document-repeat-v1",
                evidenceIds: ["E-owned-status"],
              },
            ],
          }),
      },
    },
    { skepticReview },
  ).run();
  return { report, skepticReview, sourceRun, sourceIdentity };
}
