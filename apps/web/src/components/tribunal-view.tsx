"use client";

import type { Challenge, Claim, Experiment, ScanReport, Verdict } from "@crossexam/contracts";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDashed,
  FlaskConical,
  Gavel,
  Link2,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { experimentLabel, reportClaims, verdictMeanings } from "../lib/presentation";
import { ProvenanceBadge } from "./ui";

type Props = {
  report: ScanReport;
  onEvidence: (id: string) => void;
  onFinding?: (id: string) => void;
  initialClaimId?: string;
};

const verdictLabels: Record<Verdict["status"], string> = {
  confirmed: "Confirmed",
  contested: "Contested",
  "insufficient-evidence": "Needs evidence",
  rejected: "Rejected",
};

function recordKind(source: ScanReport["summary"]["source"]) {
  return source === "fixture" ? "Synthetic fixture record" : "Deterministic report record";
}

function challengeFor(
  report: ScanReport,
  claim: Claim,
): { breaker: Challenge[]; skeptic: Challenge[] } {
  const attachedTribunal = report.tribunalRuns[0];
  const challenges = attachedTribunal?.claims.some((item) => item.id === claim.id)
    ? attachedTribunal.challenges.filter((item) => item.claimId === claim.id)
    : report.challenges.filter((item) => item.claimId === claim.id);
  return {
    breaker: challenges.filter((item) => item.raisedBy === "Breaker"),
    skeptic: challenges.filter((item) => item.raisedBy === "Skeptic"),
  };
}

function StateTag({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`tribunal-state tribunal-state-${tone}`}>{children}</span>;
}

function EvidenceLinks({
  report,
  ids,
  onEvidence,
}: {
  report: ScanReport;
  ids: string[];
  onEvidence: (id: string) => void;
}) {
  return (
    <div className="tribunal-evidence-links">
      {ids.map((id) => {
        const evidence = report.evidence.find((item) => item.id === id);
        return (
          <button type="button" key={id} onClick={() => onEvidence(id)}>
            <code>{id}</code>
            <span>{evidence?.title ?? "Evidence record"}</span>
            <ArrowUpRight size={13} />
          </button>
        );
      })}
    </div>
  );
}

function ChallengeRecord({
  challenge,
  report,
  onEvidence,
}: {
  challenge: Challenge;
  report: ScanReport;
  onEvidence: (id: string) => void;
}) {
  return (
    <div className="tribunal-record tribunal-challenge-record">
      <div className="tribunal-record-heading">
        <strong>{challenge.question}</strong>
        <span>
          {challenge.status === "addressed"
            ? "Addressed in fixture record"
            : "Open in fixture record"}
        </span>
      </div>
      <p>
        <code>{challenge.id}</code> · {challenge.category.replaceAll("-", " ")} · provenance{" "}
        {challenge.provenance}
      </p>
      {challenge.missingEvidence && <p>Missing evidence: {challenge.missingEvidence}</p>}
      {challenge.evidenceIds.length > 0 && (
        <EvidenceLinks report={report} ids={challenge.evidenceIds} onEvidence={onEvidence} />
      )}
    </div>
  );
}

function ReproducerState({
  experiment,
  live,
  report,
  onEvidence,
}: {
  experiment: Experiment | undefined;
  live: boolean;
  report: ScanReport;
  onEvidence: (id: string) => void;
}) {
  if (live) {
    return (
      <div className="tribunal-unavailable">
        <CircleDashed size={18} />
        <div>
          <strong>Unavailable for live reports</strong>
          <p>No reproduction artifact or controlled experiment is attached to this live report.</p>
        </div>
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="tribunal-unavailable">
        <CircleDashed size={18} />
        <div>
          <strong>No experiment record</strong>
          <p>The synthetic fixture contains no experiment entry for this claim.</p>
        </div>
      </div>
    );
  }

  const copy = {
    completed: {
      title: "Simulated/test-only record marked completed",
      body: "This fixture record is not an observed reproduction and does not establish a real-world repeat.",
      tone: "simulated",
    },
    planned: {
      title: "Planned in the synthetic fixture",
      body: "No experiment was run for this record.",
      tone: "planned",
    },
    inconclusive: {
      title: "Synthetic fixture record is inconclusive",
      body: "The fixture does not establish whether the challenge was resolved.",
      tone: "uncertain",
    },
    blocked: {
      title: "Synthetic fixture record is blocked",
      body: "No execution result is available in this report.",
      tone: "uncertain",
    },
  }[experiment.status];

  return (
    <div className="tribunal-record tribunal-reproducer-record">
      <div className="tribunal-record-heading">
        <strong>{copy.title}</strong>
        <StateTag tone={copy.tone}>{experimentLabel(experiment)}</StateTag>
      </div>
      <p>{copy.body}</p>
      <details>
        <summary>Show planned method and record links</summary>
        <p>{experiment.method}</p>
        <p>
          <code>{experiment.id}</code> → challenge <code>{experiment.challengeId}</code>
        </p>
        <EvidenceLinks report={report} ids={experiment.evidenceIds} onEvidence={onEvidence} />
      </details>
    </div>
  );
}

function VerdictState({
  report,
  verdict,
  live,
  onEvidence,
}: {
  report: ScanReport;
  verdict: Verdict | undefined;
  live: boolean;
  onEvidence: (id: string) => void;
}) {
  if (!verdict) {
    return (
      <div className="tribunal-unavailable">
        <CircleDashed size={18} />
        <div>
          <strong>Judge/verdict state unavailable</strong>
          <p>No verdict record is attached to this claim.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`tribunal-verdict-record verdict-${verdict.status}`}>
      <div className="tribunal-record-heading">
        <strong>
          {live ? "Deterministic rule result" : "Synthetic fixture verdict"}:{" "}
          {verdictLabels[verdict.status]}
        </strong>
        <StateTag tone={verdict.status}>
          {verdict.status === "confirmed" && <Check size={12} />}
          {verdictLabels[verdict.status]}
        </StateTag>
      </div>
      <p>{verdict.rationale}</p>
      <p>{verdictMeanings[verdict.status]}</p>
      <p className="tribunal-record-note">
        {live
          ? "JudgeReview is unavailable for live reports; this is a deterministic rule result, not a JudgeReview."
          : "No Stage 17 JudgeReview artifact is attached; this verdict belongs to the synthetic ScanReport fixture."}
      </p>
      <EvidenceLinks report={report} ids={verdict.evidenceIds} onEvidence={onEvidence} />
    </div>
  );
}

function ClaimChain({ claim, report, onEvidence, onFinding }: Props & { claim: Claim }) {
  const live = report.summary.source === "live";
  const finding = report.findings.find((item) => item.claimId === claim.id);
  const verdict = report.verdicts.find((item) => item.claimId === claim.id);
  const experiment = report.experiments.find((item) => item.claimId === claim.id);
  const challenges = challengeFor(report, claim);
  const hasAttachedTribunal = Boolean(
    report.tribunalRuns[0]?.claims.some((item) => item.id === claim.id),
  );

  return (
    <article className="tribunal-claim" aria-labelledby={`tribunal-claim-${claim.id}`}>
      <header className="tribunal-claim-header">
        <div>
          <div className="tribunal-claim-meta">
            <code>{claim.id}</code>
            <ProvenanceBadge value={claim.provenance} />
            <span>
              {hasAttachedTribunal ? "TribunalRun claim" : recordKind(report.summary.source)}
            </span>
          </div>
          <h3 id={`tribunal-claim-${claim.id}`}>{claim.statement}</h3>
        </div>
        {finding && onFinding && (
          <button
            type="button"
            className="tribunal-finding-link"
            onClick={() => onFinding(finding.id)}
          >
            Finding {finding.id} <ArrowUpRight size={14} />
          </button>
        )}
      </header>

      <ol className="tribunal-chain">
        <li className="tribunal-step">
          <span className="tribunal-step-index">01</span>
          <div>
            <p className="tribunal-step-label">Claim</p>
            <p>{claim.statement}</p>
            <details>
              <summary>Scope and falsifier</summary>
              <p>{claim.scope.observation}</p>
              {claim.scope.conditions.length > 0 && (
                <ul>
                  {claim.scope.conditions.map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              )}
              {claim.scope.limitations.length > 0 && (
                <ul>
                  {claim.scope.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              )}
              <p>
                <strong>Falsifier:</strong> {claim.falsifier}
              </p>
            </details>
          </div>
        </li>

        <li className="tribunal-step">
          <span className="tribunal-step-index">02</span>
          <div>
            <p className="tribunal-step-label">Supporting evidence</p>
            <p>
              {claim.evidenceIds.length} linked record{claim.evidenceIds.length === 1 ? "" : "s"} ·
              exact IDs retained
            </p>
            <EvidenceLinks report={report} ids={claim.evidenceIds} onEvidence={onEvidence} />
          </div>
        </li>

        <li className="tribunal-step">
          <span className="tribunal-step-index">03</span>
          <div>
            <p className="tribunal-step-label">Breaker challenge</p>
            {challenges.breaker.length > 0 ? (
              <>
                <StateTag tone={hasAttachedTribunal ? "attached" : "simulated"}>
                  {hasAttachedTribunal ? "Attached TribunalRun" : "Synthetic fixture record"}
                </StateTag>
                <div className="tribunal-record-list">
                  {challenges.breaker.map((challenge) => (
                    <ChallengeRecord
                      key={challenge.id}
                      challenge={challenge}
                      report={report}
                      onEvidence={onEvidence}
                    />
                  ))}
                </div>
                {!challenges.breaker.length && (
                  <p className="tribunal-muted">No Breaker challenge is present in this record.</p>
                )}
              </>
            ) : (
              <div className="tribunal-unavailable">
                <CircleDashed size={18} />
                <div>
                  <strong>{live ? "Unavailable for live reports" : "No challenge record"}</strong>
                  <p>
                    {live
                      ? "This live report has no attached TribunalRun."
                      : "The synthetic fixture contains no Breaker challenge for this claim."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </li>

        <li className="tribunal-step">
          <span className="tribunal-step-index">04</span>
          <div>
            <p className="tribunal-step-label">Skeptic availability</p>
            {challenges.skeptic.length > 0 ? (
              <div className="tribunal-record tribunal-skeptic-record">
                <div className="tribunal-record-heading">
                  <strong>Synthetic fixture challenge record present</strong>
                  <StateTag tone="simulated">No review artifact</StateTag>
                </div>
                <p>
                  {challenges.skeptic.length} Skeptic-attributed record
                  {challenges.skeptic.length === 1 ? "" : "s"} are shown, but no SkepticReview is
                  attached to this ScanReport.
                </p>
                {challenges.skeptic.map((challenge) => (
                  <ChallengeRecord
                    key={challenge.id}
                    challenge={challenge}
                    report={report}
                    onEvidence={onEvidence}
                  />
                ))}
              </div>
            ) : (
              <div className="tribunal-unavailable">
                <CircleDashed size={18} />
                <div>
                  <strong>
                    {live ? "Unavailable for live reports" : "No Skeptic review attached"}
                  </strong>
                  <p>
                    {live
                      ? "Live reports do not run or attach Skeptic review."
                      : "No Stage 15 SkepticReview artifact is present; fixture labels do not imply availability."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </li>

        <li className="tribunal-step">
          <span className="tribunal-step-index">05</span>
          <div>
            <p className="tribunal-step-label">Reproducer state</p>
            <ReproducerState
              experiment={experiment}
              live={live}
              report={report}
              onEvidence={onEvidence}
            />
          </div>
        </li>

        <li className="tribunal-step tribunal-step-final">
          <span className="tribunal-step-index">06</span>
          <div>
            <p className="tribunal-step-label">Judge / verdict state</p>
            <VerdictState report={report} verdict={verdict} live={live} onEvidence={onEvidence} />
          </div>
        </li>
      </ol>
    </article>
  );
}

export function TribunalView({ report, onEvidence, onFinding, initialClaimId }: Props) {
  const live = report.summary.source === "live";
  const attachedTribunal = report.tribunalRuns[0];
  const claims = reportClaims(report);
  const [selectedClaimId, setSelectedClaimId] = useState(initialClaimId ?? claims[0]?.id ?? "");
  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId) ?? claims[0];

  return (
    <section className="tribunal-view" aria-labelledby="tribunal-title">
      <header className="tribunal-hero">
        <div>
          <p className="section-kicker">The evidence chain</p>
          <h2 id="tribunal-title">A claim should survive each handoff.</h2>
          <p className="tribunal-hero-copy">
            Follow each claim from its supporting evidence through challenge, availability,
            experiment state, and the bounded verdict record. Every stage names what this report
            does and does not contain.
          </p>
        </div>
        <div className="tribunal-hero-mark" aria-hidden="true">
          <Gavel size={28} strokeWidth={1.3} />
          <span>Veyra / Tribunal</span>
        </div>
      </header>

      <aside
        className={`tribunal-boundary ${live ? "tribunal-boundary-live" : "tribunal-boundary-fixture"}`}
      >
        {live ? <ShieldAlert size={19} /> : <FlaskConical size={19} />}
        <div>
          <strong>
            {live
              ? "Tribunal and reproduction unavailable for this live report"
              : attachedTribunal
                ? "Fixture-source Tribunal record"
                : "Synthetic fixture boundary"}
          </strong>
          <p>
            {live
              ? "This report contains deterministic HTTP observations only. No TribunalRun, SkepticReview, Reproducer artifact, or Stage 17 JudgeReview is attached."
              : attachedTribunal
                ? `TribunalRun ${attachedTribunal.id} is attached. SkepticReview, Reproducer, and Stage 17 JudgeReview artifacts remain separate and are not included here.`
                : "This fixture has no attached TribunalRun and no Stage 17 JudgeReview artifact. Claims, challenges, experiments, agent rows, and verdicts below are synthetic fixture records; they are display data, not execution receipts."}
          </p>
        </div>
      </aside>
      {attachedTribunal && (
        <p className="view-intro">
          Recorded run status: {attachedTribunal.status}.{" "}
          {attachedTribunal.agentRuns.map((run) => `${run.role}: ${run.status}`).join(" · ")}.
          Completion is not agreement or a verdict.
        </p>
      )}

      <details className="tribunal-scope">
        <summary>
          <span>Scope and limitations</span>
          <ChevronDown size={16} />
        </summary>
        <div>
          <p>
            The view reads only the supplied <code>ScanReport</code>. It does not construct a
            JudgeReview, infer a missing run, or turn a synthetic record into an observed result.
          </p>
          <ul>
            <li>Evidence links preserve the report&apos;s exact evidence IDs.</li>
            <li>
              Fixture provenance is shown as fixture data even when a base record says completed.
            </li>
            <li>
              Live reports retain deterministic rule results but do not claim Tribunal, Skeptic, or
              reproduction work.
            </li>
          </ul>
        </div>
        <dl className="verdict-key">
          {Object.entries(verdictMeanings).map(([status, meaning]) => (
            <div key={status}>
              <dt>{status}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="archive-note">
          Separate offline Reproducer receipts may say none, planned-only, simulated-test-only, or
          outcome-unknown. No such receipt is attached here. Observed-accepted is unavailable in the
          admitted Stage 17 path. Legacy demo experiments are not these receipts.
        </p>
      </details>

      <section className="tribunal-index" aria-label="Tribunal claim index">
        <div>
          <span className="section-kicker">On the record</span>
          <strong>{selectedClaim ? `Claim ${selectedClaim.id}` : "No selected claim"}</strong>
        </div>
        <span>
          {claims.length} claim{claims.length === 1 ? "" : "s"} ·{" "}
          {attachedTribunal ? `Run ${attachedTribunal.id}` : "No attached TribunalRun"}
        </span>
      </section>

      {claims.length > 0 ? (
        <div className="tribunal-claim-workspace">
          <nav className="tribunal-claim-selector" aria-label="Claims in this record">
            {claims.map((claim) => {
              const finding = report.findings.find((item) => item.claimId === claim.id);
              const verdict = report.verdicts.find((item) => item.claimId === claim.id);
              return (
                <button
                  type="button"
                  key={claim.id}
                  className={selectedClaim?.id === claim.id ? "is-selected" : ""}
                  aria-pressed={selectedClaim?.id === claim.id}
                  onClick={() => setSelectedClaimId(claim.id)}
                >
                  <span>
                    <code>{claim.id}</code>
                    <strong>{finding?.title ?? claim.statement}</strong>
                  </span>
                  <small>{verdict?.status ?? "claim record"}</small>
                </button>
              );
            })}
          </nav>
          <div className="tribunal-claims">
            {selectedClaim && (
              <ClaimChain
                key={selectedClaim.id}
                claim={selectedClaim}
                report={report}
                onEvidence={onEvidence}
                onFinding={onFinding}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="tribunal-empty">
          <Link2 size={20} />
          <h3>No claim chain is available</h3>
          <p>
            This report has no claim records to connect to evidence or downstream review states.
          </p>
        </div>
      )}
    </section>
  );
}
