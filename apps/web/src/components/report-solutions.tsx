"use client";

import type { ScanReport } from "@crossexam/contracts";
import { ArrowUpRight } from "lucide-react";
import { verdictLabels } from "./finding-row";
import { ProvenanceBadge } from "./ui";

const outcomes: Record<string, string> = {
  "F-001":
    "Earlier visible content on the homepage. The size of any improvement must be measured under the same conditions.",
  "F-002":
    "A working destination for readers following the journal link, with no repeat 404 response.",
  "F-003":
    "Project images and linked destinations that make sense to people using a screen reader.",
  "F-004":
    "Clearer page descriptions if the missing metadata is confirmed. No ranking improvement is established by this evidence.",
  "F-005":
    "A controlled result that either supports or rejects the JavaScript hypothesis. No performance gain is established yet.",
};

export function ReportSolutions({
  report,
  onFinding,
  onEvidence,
}: {
  report: ScanReport;
  onFinding: (id: string) => void;
  onEvidence: (id: string) => void;
}) {
  const live = report.summary.source === "live";
  return (
    <section className="solutions-index">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Proposed corrections</p>
          <h2>A next step, with a way to verify it.</h2>
        </div>
        <span className="planned-feature">
          Cross-Exam Fix <span>— planned</span>
        </span>
      </div>
      <p className="view-intro">
        These are proposals, not applied fixes. Start with confirmed problems; investigate uncertain
        claims before treating them as causes.
      </p>
      <div className="proposal-key">
        {!live && <ProvenanceBadge value="INFERRED" />}
        <span>
          {live
            ? "Rule-based suggestions for review. No website has been modified."
            : "Expected results are hypotheses. No website has been modified."}
        </span>
      </div>
      {report.findings.map((finding, index) => {
        const verdict = report.verdicts.find((item) => item.id === finding.verdictId);
        return (
          <article className="solution-row" key={finding.id}>
            <div className="solution-number">
              <span>0{index + 1}</span>
              <code>{finding.id}</code>
            </div>
            <div className="solution-body">
              <div className="solution-title">
                <h3>{finding.title}</h3>
                <span className={`verdict-label verdict-${verdict?.status}`}>
                  <i />
                  {live ? "Rule matched" : verdictLabels[verdict?.status ?? ""]}
                </span>
              </div>
              <p className="solution-problem">{finding.description}</p>
              <div className="solution-evidence">
                <span>Supporting evidence</span>
                {finding.evidenceIds.map((id) => (
                  <button type="button" key={id} onClick={() => onEvidence(id)}>
                    <code>{id}</code> ↗
                  </button>
                ))}
              </div>
              <div className="solution-reasoning">
                <div>
                  <h4>
                    {verdict?.status === "confirmed"
                      ? "Recommended correction"
                      : "Recommended investigation"}
                  </h4>
                  <p>{finding.recommendation}</p>
                  <button type="button" className="text-link" onClick={() => onFinding(finding.id)}>
                    Review {finding.id} and its evidence <ArrowUpRight size={14} />
                  </button>
                </div>
                <div className="solution-outcome">
                  <h4>Intended result</h4>
                  <p>
                    {(!live ? outcomes[finding.id] : undefined) ??
                      "Reassess the finding after verifying the proposed change."}
                  </p>
                  <details>
                    <summary>How to verify</summary>
                    <p>{finding.verification}</p>
                  </details>
                </div>
              </div>
            </div>
          </article>
        );
      })}
      {!report.findings.length && (
        <p className="view-intro">
          No corrections were proposed for this limited sample. Review the evidence and scope.
        </p>
      )}
      <p className="archive-note">
        {live
          ? "Recommendations follow deterministic observations. Changes and their effects have not been tested."
          : "Recommendations belong to this fixture investigation. They have not been tested against a live website."}
      </p>
    </section>
  );
}
