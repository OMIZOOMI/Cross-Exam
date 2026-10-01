"use client";

import type { Finding, ScanReport } from "@crossexam/contracts";
import { ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { ProvenanceBadge } from "./ui";

export const verdictLabels: Record<string, string> = {
  confirmed: "Confirmed",
  contested: "Contested",
  "insufficient-evidence": "Needs evidence",
  rejected: "Rejected",
};

export function FindingRow({
  finding,
  report,
  open,
  onToggle,
  onEvidence,
}: {
  finding: Finding;
  report: ScanReport;
  open: boolean;
  onToggle: () => void;
  onEvidence: (id: string) => void;
}) {
  const live = report.summary.source === "live";
  const claim = report.claims.find((item) => item.id === finding.claimId);
  const verdict = report.verdicts.find((item) => item.id === finding.verdictId);
  const challenge = report.challenges.find((item) => item.claimId === finding.claimId);
  const experiment = report.experiments.find((item) => item.claimId === finding.claimId);
  return (
    <article className={`finding-row ${open ? "finding-open" : ""}`}>
      <button
        type="button"
        className="finding-trigger"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? `detail-${finding.id}` : undefined}
      >
        <span className={`finding-severity ${finding.severity}`}>
          <i />
          {finding.severity}
          <code>{finding.id}</code>
        </span>
        <span className="finding-main">
          <span className="finding-title">{finding.title}</span>
          <span className="finding-meta">
            <span>{finding.category}</span>
            {finding.affectedPaths.map((path) => (
              <code key={path}>{path}</code>
            ))}
          </span>
        </span>
        <ProvenanceBadge value={finding.provenance} />
        <span className={`verdict-label verdict-${verdict?.status}`}>
          {verdict?.status === "confirmed" ? <Check size={13} /> : <i />}
          {live ? "Rule matched" : verdictLabels[verdict?.status ?? ""]}
        </span>
        <ChevronDown className={open ? "rotated" : ""} size={16} />
      </button>
      {open && (
        <div className="finding-detail" id={`detail-${finding.id}`}>
          <div className="finding-context">
            <p>{finding.description}</p>
            <span>
              {live
                ? "Derived by a deterministic rule from returned HTML or response headers. No AI review or browser verification."
                : "This is an example investigation. Every step and record is fixture data."}
            </span>
          </div>
          <ol className="case-chain">
            <li>
              <span className="chain-number">1</span>
              <div className="chain-label">
                <strong>Claim</strong>
                <code>{claim?.id}</code>
              </div>
              <p>{claim?.statement}</p>
            </li>
            {!live && (
              <li>
                <span className="chain-number">2</span>
                <div className="chain-label">
                  <strong>Challenge</strong>
                  <span>
                    {challenge?.raisedBy} · {challenge?.status}
                  </span>
                </div>
                <p>{challenge?.question}</p>
              </li>
            )}
            {!live && (
              <li>
                <span className="chain-number">3</span>
                <div className="chain-label">
                  <strong>Experiment</strong>
                  <span>
                    {experiment?.status === "completed"
                      ? "Reproduced in the example"
                      : "Planned · not yet tested"}
                  </span>
                </div>
                <p>{experiment?.method}</p>
              </li>
            )}
            <li className={`chain-verdict ${verdict?.status}`}>
              <span className="chain-number">{live ? "2" : "4"}</span>
              <div className="chain-label">
                <strong>{live ? "Rule result" : "Verdict"}</strong>
                <span>{live ? "Rule matched" : verdictLabels[verdict?.status ?? ""]}</span>
              </div>
              <p>{verdict?.rationale}</p>
            </li>
          </ol>
          <div className="finding-evidence">
            <span>Follow the supporting evidence</span>
            {finding.evidenceIds.map((id) => (
              <button type="button" key={id} onClick={() => onEvidence(id)}>
                {id}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
