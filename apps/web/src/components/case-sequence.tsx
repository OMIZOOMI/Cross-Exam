"use client";

import { ChevronRight } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";

export type Stage18Projection = {
  source: string;
  targetUrl: string;
  pages: Array<{
    id: string;
    path: string;
    title: string;
    statusCode: number;
  }>;
  observation: {
    pagePaths: string[];
    evidence: Array<{
      id: string;
      title: string;
      kind: string;
    }>;
  };
  claim: {
    id: string;
    statement: string;
    evidenceIds: string[];
    affectedPaths: string[];
  };
  challenge: {
    id: string;
    question: string;
    evidenceIds: string[];
    status: string;
    raisedBy: string;
  };
  verdict: {
    id: string;
    status: string;
    rationale: string;
    evidenceIds: string[];
  };
};

const stages = [
  {
    id: "website",
    label: "Website / pages",
    eyebrow: "Fixture scope",
    title: "Start with the pages in the record.",
    description:
      "The illustration begins with the exact target and page projection from the demo report.",
  },
  {
    id: "observation",
    label: "Observation / evidence",
    eyebrow: "Supporting records",
    title: "Keep the observation attached to evidence.",
    description: "The C-005 chain cites the evidence IDs already attached to its fixture claim.",
  },
  {
    id: "claim",
    label: "Claim",
    eyebrow: "What is being asked",
    title: "State the claim without promoting it to fact.",
    description: "The claim remains the report’s own statement, affected path, and evidence links.",
  },
  {
    id: "challenge",
    label: "Challenge",
    eyebrow: "What could be missing",
    title: "Give the claim a specific challenge.",
    description:
      "The matching challenge keeps the causal leap open instead of inventing a resolution.",
  },
  {
    id: "verdict",
    label: "Verdict",
    eyebrow: "Bounded result",
    title: "Let the verdict carry its limitation.",
    description: "The matching fixture verdict shows what this record says and where it stops.",
  },
] as const;

type StageId = (typeof stages)[number]["id"];

function displayStatus(value: string) {
  return value.replaceAll("-", " ");
}

export function CaseSequence({ projection }: { projection: Stage18Projection }) {
  const [selected, setSelected] = useState<StageId>("website");
  const sequenceId = useId().replaceAll(":", "");
  const stage = stages.find((item) => item.id === selected) ?? stages[0];

  function selectStage(id: StageId) {
    setSelected(id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? stages.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (index + 1) % stages.length
            : (index - 1 + stages.length) % stages.length;
    const nextStage = stages[nextIndex] ?? stages[0];
    setSelected(nextStage.id);
    document.getElementById(`${sequenceId}-tab-${nextStage.id}`)?.focus();
  }

  return (
    <aside className="stage18-case-sequence" aria-label="Demo investigation relationship">
      <div className="stage18-case-sequence-topline">
        <span>How it works · fixture projection</span>
        <span>{projection.source}</span>
      </div>
      <div className="stage18-sequence-relationship" aria-hidden="true">
        {stages.map((item, index) => (
          <span key={item.id} className={item.id === stage.id ? "is-selected" : ""}>
            {item.label}
            {index < stages.length - 1 ? <ChevronRight size={14} /> : null}
          </span>
        ))}
      </div>
      <div
        className="stage18-case-tabs"
        role="tablist"
        aria-label="Investigation relationship stages"
      >
        {stages.map((item, index) => (
          <button
            className={`stage18-case-tab ${item.id === selected ? "is-selected" : ""}`}
            id={`${sequenceId}-tab-${item.id}`}
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === selected}
            aria-controls={`${sequenceId}-panel`}
            tabIndex={item.id === selected ? 0 : -1}
            onClick={() => selectStage(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="stage18-case-tab-number">0{index + 1}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div
        className={`stage18-case-panel stage18-case-panel-${stage.id}`}
        id={`${sequenceId}-panel`}
        role="tabpanel"
        aria-labelledby={`${sequenceId}-tab-${stage.id}`}
      >
        <div className="stage18-case-panel-copy">
          <p className="stage18-case-panel-eyebrow">{stage.eyebrow}</p>
          <h2>{stage.title}</h2>
          <p>{stage.description}</p>
          <p className="stage18-case-panel-note">
            <span className="stage18-status-dot" aria-hidden="true" />
            Static demo data · no process is running
          </p>
        </div>
        <div className="stage18-case-panel-record">{renderRecord(stage.id, projection)}</div>
      </div>
      <p className="stage18-case-caption">
        The selected record follows website/pages → evidence → claim → challenge → verdict.
      </p>
    </aside>
  );
}

function renderRecord(stage: StageId, projection: Stage18Projection) {
  if (stage === "website") {
    return (
      <>
        <div className="stage18-record-heading">
          <span>WEBSITE</span>
          <span>{projection.pages.length} pages</span>
        </div>
        <div className="stage18-record-rule" aria-hidden="true" />
        <strong className="stage18-record-url">{projection.targetUrl}</strong>
        <div className="stage18-page-list">
          {projection.pages.map((page) => (
            <span className={page.statusCode === 200 ? "" : "is-error"} key={page.id}>
              {page.path} <small>{page.statusCode}</small>
            </span>
          ))}
        </div>
      </>
    );
  }

  if (stage === "observation") {
    return (
      <>
        <div className="stage18-record-heading">
          <span>OBSERVATION / EVIDENCE</span>
          <span>{projection.observation.pagePaths.join(" · ")}</span>
        </div>
        <div className="stage18-record-rule" aria-hidden="true" />
        <div className="stage18-evidence-list">
          {projection.observation.evidence.map((item) => (
            <div key={item.id}>
              <code>{item.id}</code>
              <span>
                {item.title}
                <small>{item.kind}</small>
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (stage === "claim") {
    return (
      <>
        <div className="stage18-record-heading">
          <span>CLAIM</span>
          <code>{projection.claim.id}</code>
        </div>
        <div className="stage18-record-rule" aria-hidden="true" />
        <strong className="stage18-record-statement">{projection.claim.statement}</strong>
        <div className="stage18-record-meta">
          <span>Path: {projection.claim.affectedPaths.join(" · ")}</span>
          <span>Evidence: {projection.claim.evidenceIds.join(" · ")}</span>
        </div>
      </>
    );
  }

  if (stage === "challenge") {
    return (
      <>
        <div className="stage18-record-heading">
          <span>CHALLENGE</span>
          <code>{projection.challenge.id}</code>
        </div>
        <div className="stage18-record-rule" aria-hidden="true" />
        <strong className="stage18-record-statement">{projection.challenge.question}</strong>
        <div className="stage18-record-meta">
          <span>
            {projection.challenge.raisedBy} · {displayStatus(projection.challenge.status)}
          </span>
          <span>Evidence: {projection.challenge.evidenceIds.join(" · ")}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="stage18-record-heading">
        <span>VERDICT</span>
        <code>{projection.verdict.id}</code>
      </div>
      <div className="stage18-record-rule" aria-hidden="true" />
      <strong className="stage18-record-status">{displayStatus(projection.verdict.status)}</strong>
      <p className="stage18-record-rationale">{projection.verdict.rationale}</p>
      <div className="stage18-record-meta">
        <span>Evidence: {projection.verdict.evidenceIds.join(" · ")}</span>
      </div>
    </>
  );
}
