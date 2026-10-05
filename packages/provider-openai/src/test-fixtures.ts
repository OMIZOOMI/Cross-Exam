import type { ProviderRequest } from "@crossexam/agents";
import { type Claim, TRIBUNAL_INSTRUCTIONS } from "@crossexam/contracts";
import { evidenceCatalog, roleView } from "../../agents/src/evidence-digest";
import { ownedNumericFixture } from "../../controlled-provider/src/release";

export const explorerProposal = () => ({
  schemaVersion: 1,
  claims: [
    {
      statement: "The owned response fixture has status 200.",
      scope: {
        observation: "One owned response fixture.",
        conditions: [],
        limitations: ["No independent reproduction."],
      },
      falsifier: "A different observed status in the same fixture.",
      evidenceIds: ["E-owned-status"],
    },
  ],
});
export const breakerProposal = (claimId: string) => ({
  schemaVersion: 1,
  challenges: [
    {
      claimId,
      category: "collection-limitation",
      question: "Does the result hold beyond this collection?",
      evidenceIds: ["E-owned-status"],
      missingEvidence: null,
    },
  ],
});
export function providerRequest(
  role: "Explorer" | "Breaker" = "Explorer",
  claims: Claim[] = [],
): ProviderRequest {
  const report = ownedNumericFixture();
  return {
    schemaVersion: 1,
    role,
    instructions: TRIBUNAL_INSTRUCTIONS,
    view: roleView(report, role, evidenceCatalog(report), claims),
    maxOutputTokens: role === "Explorer" ? 768 : 1024,
    timeoutMs: 20000,
    semanticRetries: 0,
  };
}
export function completed(value: unknown = explorerProposal(), usage: unknown = undefined) {
  return {
    status: "completed",
    output: [
      {
        type: "reasoning",
        encrypted_content: "DISCARD_REASONING",
        summary: [{ text: "DISCARD_REASONING" }],
      },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: typeof value === "string" ? value : JSON.stringify(value) },
        ],
      },
    ],
    ...(usage === undefined ? {} : { usage }),
  };
}
export const jsonResponse = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
/** Fake transport; never contacts any endpoint. */
export function validTransport(onRequest?: (body: string) => void): typeof fetch {
  return async (_url, init) => {
    onRequest?.(String(init?.body));
    const body = JSON.parse(String(init?.body));
    const data = JSON.parse(body.input[0].content);
    return jsonResponse(
      completed(
        data.role === "Explorer" ? explorerProposal() : breakerProposal(data.claims[0].id),
        { input_tokens: 120, output_tokens: 80, output_tokens_details: { reasoning_tokens: 0 } },
      ),
    );
  };
}
