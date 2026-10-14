"use client";

import { FileText, Globe2 } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useEffect, useId, useState } from "react";

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
    eyebrow: "Source surface",
    title: "Start with the pages in the record.",
    description:
      "The investigation begins with the exact target and page projection from the synthetic record.",
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
    eyebrow: "The interruption",
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
  const [inspecting, setInspecting] = useState(false);
  const [settled, setSettled] = useState(false);
  const sequenceId = useId().replaceAll(":", "");
  const stage = stages.find((item) => item.id === selected) ?? stages[0];

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopMotion = () => {
      if (preference.matches) setSettled(true);
    };
    stopMotion();
    preference.addEventListener("change", stopMotion);
    return () => preference.removeEventListener("change", stopMotion);
  }, []);

  function selectStage(id: StageId) {
    setSelected(id);
    setInspecting(true);
    setSettled(true);
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
    selectStage(nextStage.id);
    document.getElementById(`${sequenceId}-tab-${nextStage.id}`)?.focus();
  }

  return (
    <aside
      className="stage18-case-sequence stage181-case-sequence"
      aria-label="Demo investigation relationship"
      data-motion={settled ? "settled" : "intro"}
      onAnimationEnd={(event) => {
        if (event.animationName === "stage181-signature-in") setSettled(true);
      }}
    >
      <div className="stage18-case-sequence-topline stage181-case-topline">
        <span>Synthetic fixture · no process is running</span>
        <button type="button" onClick={() => setSettled(true)} disabled={settled}>
          {settled ? "Static scene" : "Skip intro"}
        </button>
      </div>
      <CinematicScene projection={projection} selected={selected} />
      <div
        className="stage18-case-tabs stage181-case-tabs"
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
      <details
        className="stage181-record-details"
        open={inspecting}
        onToggle={(event) => setInspecting(event.currentTarget.open)}
      >
        <summary>Inspect the selected fixture record</summary>
        <div
          className={`stage18-case-panel stage18-case-panel-${stage.id} stage181-case-panel`}
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
        <p className="stage18-case-caption stage181-case-caption">
          Website/pages → observations → evidence → claim → challenge → verdict.
        </p>
      </details>
    </aside>
  );
}

function CinematicScene({
  projection,
  selected,
}: {
  projection: Stage18Projection;
  selected: StageId;
}) {
  const evidence = projection.observation.evidence.slice(0, 2);
  const pages = projection.pages.slice(0, 5);
  const verdict = displayStatus(projection.verdict.status);

  return (
    <div className="stage181-cinematic-wrap">
      <div className="stage181-cinematic-scene" data-active-stage={selected} aria-hidden="true">
        <div className="stage181-scene-grid" />
        <div className="stage181-scene-glow stage181-scene-glow-blue" />
        <div className="stage181-scene-glow stage181-scene-glow-red" />
        <div className="stage181-scene-kicker">
          <span>C-005 / The causal question</span>
          <span>Illustration, not a scan</span>
        </div>
        <svg
          className="stage181-connections"
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          fill="none"
          role="img"
          aria-label="Website pages connect to evidence, a claim, a challenge, and a bounded verdict"
        >
          <title>Investigation relationship map</title>
          <path
            className="stage181-link stage181-link-pages"
            d="M210 150 C210 104 350 104 430 104"
          />
          <path
            className="stage181-link stage181-link-evidence"
            d="M430 132 C470 200 470 320 210 390"
          />
          <path
            className="stage181-link stage181-link-claim"
            d="M410 412 C490 412 440 225 540 225"
          />
          <path className="stage181-link stage181-link-challenge" d="M770 280 L770 342" />
          <path
            className="stage181-link stage181-link-reconnect"
            d="M420 418 C505 455 480 278 560 255"
          />
          <path className="stage181-link stage181-link-verdict" d="M770 439 L770 478" />
          <path className="stage181-challenge-cross" d="M695 295 L835 315" />
        </svg>

        <div className="stage181-object stage181-website-object" data-stage="website">
          <div className="stage181-browser-bar">
            <span className="stage181-browser-dots">
              <i />
              <i />
              <i />
            </span>
            <code>{projection.targetUrl}</code>
          </div>
          <div className="stage181-website-body">
            <div className="stage181-website-nav">
              <span />
              <span />
              <span />
            </div>
            <div className="stage181-website-hero">
              <b>THE SURFACE</b>
              <span />
              <span />
            </div>
            <div className="stage181-website-lines">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="stage181-website-status">
              <Globe2 size={12} /> HTTP surface
            </div>
          </div>
          <span className="stage181-object-label">WEBSITE / SOURCE</span>
        </div>

        <div className="stage181-object stage181-pages-object" data-stage="website">
          <div className="stage181-object-heading">
            <FileText size={13} />
            <span>PAGE RECORDS</span>
            <b>
              {pages.length} / {projection.pages.length}
            </b>
          </div>
          <div className="stage181-page-stack">
            {pages.map((page, index) => (
              <span
                key={page.id}
                className={page.statusCode >= 400 ? "is-error" : ""}
                style={{ "--page-index": index } as CSSProperties}
              >
                <code>{page.path}</code>
                <small>{page.statusCode}</small>
              </span>
            ))}
          </div>
        </div>

        <div className="stage181-object stage181-evidence-object" data-stage="observation">
          <div className="stage181-object-heading">
            <span className="stage181-signal-dot" /> <span>OBSERVATION / EVIDENCE</span>
          </div>
          {evidence.map((item) => (
            <div className="stage181-evidence-row" key={item.id}>
              <code>{item.id}</code>
              <span>{item.title}</span>
            </div>
          ))}
          <small className="stage181-object-foot">Script resource · synthetic evidence</small>
        </div>

        <div className="stage181-object stage181-claim-object" data-stage="claim">
          <div className="stage181-object-heading">
            <span>CLAIM</span>
            <code>{projection.claim.id}</code>
          </div>
          <strong>{projection.claim.statement}</strong>
          <small>{projection.claim.evidenceIds.join(" · ")} · narrow scope</small>
        </div>

        <div className="stage181-object stage181-challenge-object" data-stage="challenge">
          <div className="stage181-object-heading">
            <span className="stage181-red-marker" /> <span>CHALLENGE</span>
            <code>{projection.challenge.id}</code>
          </div>
          <strong>{projection.challenge.question}</strong>
          <small>causal leap remains open</small>
        </div>

        <div className="stage181-object stage181-verdict-object" data-stage="verdict">
          <div className="stage181-verdict-seal">?</div>
          <div>
            <span>VERDICT</span>
            <strong>{verdict}</strong>
          </div>
          <small>Not proven. More evidence needed.</small>
        </div>

        <div className="stage181-scene-signature">
          <strong>
            VEYRA<span>.</span>
          </strong>
          <span>Your website says it works. Prove it.</span>
        </div>
        <div className="stage181-scene-legend">
          {stages.map((item, index) => (
            <span key={item.id} className={item.id === selected ? "is-selected" : ""}>
              <b>0{index + 1}</b>
              {item.id === "observation"
                ? "evidence"
                : (item.label.split(" /")[0]?.toLowerCase() ?? item.label.toLowerCase())}
            </span>
          ))}
        </div>
      </div>

      <section className="stage181-mobile-sequence" aria-label="Synthetic investigation sequence">
        <MobileStep index="01" label="Website / pages" detail={projection.targetUrl} tone="blue" />
        <MobileStep
          index="02"
          label="Observations / evidence"
          detail={evidence.map((item) => item.id).join(" · ")}
          tone="blue"
        />
        <MobileStep index="03" label="Claim" detail={projection.claim.statement} tone="ink" />
        <MobileStep
          index="04"
          label="Challenge"
          detail={projection.challenge.question}
          tone="red"
        />
        <MobileStep index="05" label="Verdict" detail={`${verdict} · not proven`} tone="amber" />
        <div className="stage181-scene-signature" aria-hidden="true">
          <strong>
            VEYRA<span>.</span>
          </strong>
          <span>Your website says it works. Prove it.</span>
        </div>
      </section>
    </div>
  );
}

function MobileStep({
  index,
  label,
  detail,
  tone,
}: {
  index: string;
  label: string;
  detail: string;
  tone: "blue" | "ink" | "red" | "amber";
}) {
  return (
    <div className={`stage181-mobile-step stage181-mobile-step-${tone}`}>
      <span>{index}</span>
      <div>
        <b>{label}</b>
        <strong>{detail}</strong>
      </div>
    </div>
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
