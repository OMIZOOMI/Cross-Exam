"use client";

import type { ScanReport } from "@crossexam/contracts";
import { ArrowRight, ArrowUpRight, Check, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { Badge, ProvenanceBadge } from "./ui";

const SiteGraph = dynamic(() => import("./site-graph"), {
  ssr: false,
  loading: () => <div className="graph-loading">Preparing the site map…</div>,
});
const ResponseChart = dynamic(() => import("./response-chart"), {
  ssr: false,
  loading: () => <div className="chart-loading">Preparing response timings…</div>,
});

type Props = {
  report: ScanReport;
  counts: { confirmed: number; contested: number; unresolved: number; rejected: number };
  affected: Record<string, number>;
  onNavigate: (section: "site-map" | "findings" | "evidence" | "solutions") => void;
  onFinding: (id: string) => void;
  onEvidence: (id: string) => void;
};

function subscribeToViewport(callback: () => void) {
  const media = window.matchMedia("(max-width: 760px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function ReportOverview({
  report,
  counts,
  affected,
  onNavigate,
  onFinding,
  onEvidence,
}: Props) {
  const compact = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia("(max-width: 760px)").matches,
    () => false,
  );
  const challenged = new Set(report.challenges.map((item) => item.claimId)).size;
  const tested = new Set(
    report.experiments.filter((item) => item.status === "completed").map((item) => item.claimId),
  ).size;
  return (
    <div className="overview-editorial">
      <section className="executive-summary">
        <div>
          <p className="section-kicker">The short version</p>
          <h2>
            {counts.confirmed} findings
            <br />
            <em>survived scrutiny.</em>
          </h2>
          <p>
            Five claims raised. Three reproduced and confirmed. One remains contested; one needs
            more evidence.
          </p>
          <div className="summary-verdicts">
            <span className="status-pill confirmed">
              <i />
              {counts.confirmed} confirmed
            </span>
            <span className="status-pill contested">
              <i />
              {counts.contested} contested
            </span>
            <span className="status-pill unresolved">
              <i />
              {counts.unresolved} unresolved
            </span>
          </div>
        </div>
        <dl className="scope-facts">
          <div>
            <dt>Pages mapped</dt>
            <dd>
              {report.pages.length}
              <small>public routes</small>
            </dd>
          </div>
          <div>
            <dt>Evidence collected</dt>
            <dd>
              <button type="button" onClick={() => onNavigate("evidence")}>
                {report.evidence.length}
                <ArrowUpRight size={17} />
              </button>
              <small>inspectable records</small>
            </dd>
          </div>
          <div>
            <dt>Example duration</dt>
            <dd>
              {(report.summary.durationMs / 1000).toFixed(1)}
              <small>seconds</small>
            </dd>
          </div>
        </dl>
      </section>
      <section className="priority-editorial" aria-labelledby="priority-title">
        <div className="priority-main">
          <div className="priority-byline">
            <span className="priority-marker" />
            Most important finding<code>F-001</code>
          </div>
          <h2 id="priority-title">
            The first impression
            <br />
            takes <em>4.2 seconds.</em>
          </h2>
          <p>
            The homepage hero paints late in both example runs. The delay is repeatable; its cause
            is still open.
          </p>
          <div className="priority-labels">
            <span>Performance</span>
            <span className="status-pill confirmed">
              <Check size={13} />
              Confirmed
            </span>
            <ProvenanceBadge value="DERIVED" />
          </div>
          <button type="button" className="text-link" onClick={() => onFinding("F-001")}>
            Examine this finding <ArrowRight size={15} />
          </button>
        </div>
        <div className="paint-comparison">
          <div className="paint-chart-header">
            <span>Two runs. The same delay.</span>
            <span>Largest contentful paint</span>
          </div>
          <div className="paint-row">
            <button type="button" onClick={() => onEvidence("E-001")}>
              Run A<code>E-001 ↗</code>
            </button>
            <div>
              <span style={{ width: "86%" }} />
            </div>
            <strong>
              4.3<small>s</small>
            </strong>
          </div>
          <div className="paint-row">
            <button type="button" onClick={() => onEvidence("E-002")}>
              Run B<code>E-002 ↗</code>
            </button>
            <div>
              <span style={{ width: "82%" }} />
            </div>
            <strong>
              4.1<small>s</small>
            </strong>
          </div>
          <p>Same conditions · Cold cache · Synthetic lab data</p>
        </div>
      </section>
      <div className="also-confirmed">
        <span>Also confirmed</span>
        {report.findings.slice(1, 3).map((finding) => (
          <button type="button" key={finding.id} onClick={() => onFinding(finding.id)}>
            <span className={`small-severity ${finding.severity}`} />
            <span>
              <strong>{finding.title}</strong>
              <small>
                {finding.category} · {finding.affectedPaths.join(", ")}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      <section className="overview-map">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Where the problems are</p>
            <h2>A connected view of the evidence.</h2>
          </div>
          <button type="button" className="text-link" onClick={() => onNavigate("site-map")}>
            Explore the site map <ArrowUpRight size={15} />
          </button>
        </div>
        <SiteGraph
          pages={report.pages}
          affected={affected}
          findings={report.findings}
          onFinding={onFinding}
        />
        <p className="figure-caption">
          <span>Fig. 01</span> Eight example routes. Select a page to inspect its response and
          associated findings.
        </p>
      </section>
      <section className="investigation-analysis">
        <div className="claim-story">
          <p className="section-kicker">The cross-examination</p>
          <h2>
            Agreement isn’t the goal.
            <br />
            <em>Evidence is.</em>
          </h2>
          <p>
            The example checks support three narrow claims. They don’t explain everything. A larger
            script payload, for instance, does not prove what delayed the hero.
          </p>
          <button type="button" className="text-link" onClick={() => onFinding("F-005")}>
            See the contested claim <ArrowUpRight size={15} />
          </button>
          <div
            className="claim-flow"
            role="img"
            aria-label={`${report.claims.length} claims raised, ${challenged} challenged, ${tested} tested, ${counts.confirmed} confirmed`}
          >
            {[
              { label: "Raised", count: report.claims.length },
              { label: "Challenged", count: challenged },
              { label: "Tested", count: tested },
              { label: "Confirmed", count: counts.confirmed },
            ].map((item, index) => (
              <div key={item.label}>
                <strong>{item.count}</strong>
                <span>{item.label}</span>
                {index < 3 && <ChevronRight size={17} />}
              </div>
            ))}
          </div>
          <p className="flow-note">Completed example experiments only. Two remain planned.</p>
        </div>
        <details className="investigation-log" open={!compact}>
          <summary>
            <span>Investigation record</span>
            <ProvenanceBadge value="SIMULATED" />
          </summary>
          <ol>
            {report.agentRuns.map((run) => (
              <li key={run.id}>
                <div>
                  <strong>{run.role}</strong>
                  <time>{(run.elapsedMs / 1000).toFixed(1)}s</time>
                </div>
                <p>{run.summary}</p>
              </li>
            ))}
          </ol>
        </details>
      </section>
      <section className="network-note">
        <div>
          <p className="section-kicker">A supporting observation</p>
          <h2>
            Response time isn’t
            <br />
            the whole story.
          </h2>
          <p>
            The homepage responds in 320 ms, but its hero paints at 4.2 s. Server response and
            visible content measure different parts of the experience.
          </p>
          <button type="button" className="text-link" onClick={() => onEvidence("E-011")}>
            Inspect timing evidence <ArrowUpRight size={15} />
          </button>
        </div>
        <div>
          <ResponseChart pages={report.pages} />
          <p className="figure-caption">
            Six primary routes · Synthetic response times, in milliseconds
          </p>
        </div>
      </section>
      <div className="overview-next">
        <span>
          <Badge tone="green">Next step</Badge>Start with the verified findings.
        </span>
        <button type="button" className="text-link" onClick={() => onNavigate("findings")}>
          Review all five findings <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
