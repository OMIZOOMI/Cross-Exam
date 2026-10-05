import { hash } from "./provider";

export const normalize = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export const challengeKey = (c: {
  claimId: string;
  category: string;
  question: string;
  evidenceIds: string[];
  missingEvidence?: string;
}) =>
  hash(
    JSON.stringify([
      c.claimId,
      c.category,
      normalize(c.question),
      [...c.evidenceIds].sort(),
      normalize(c.missingEvidence ?? ""),
    ]),
  );
/** Secondary output privacy guard, not URL authorization or a general secret detector. */
export function exportableText(value: unknown): boolean {
  if (typeof value === "string")
    return !/(?:\b[a-z][a-z0-9+.-]*:\/\/|\b(?:data|file|javascript):|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[a-f0-9]{0,4}:){2,}[a-f0-9:]+|(?:^|\s)\/(?:[^\s/]+\/)+|[a-z]:\\|\b(?:authorization|proxy-authorization|set-cookie|cookie|password|passwd|token|api[_ -]?key|secret)\s*[:=]|\bBearer\s+\S+|\b(?:sk-(?:proj-)?|AKIA|AIza)[A-Za-z0-9_-]{12,}|<[!/]?[a-z][^>]*>)/i.test(
      value,
    );
  if (Array.isArray(value)) return value.every(exportableText);
  if (value && typeof value === "object") return Object.values(value).every(exportableText);
  return true;
}
