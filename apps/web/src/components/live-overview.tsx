"use client";

import type { ScanReport } from "@crossexam/contracts";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import { ProvenanceBadge } from "./ui";

const SiteGraph = dynamic(() => import("./site-graph"), { ssr: false });
const ResponseChart = dynamic(() => import("./response-chart"), { ssr: false });

export function LiveOverview({
  report,
  affected,
  onFinding,
  onNavigate,
}: {
  report: ScanReport;
  affected: Record<string, number>;
  onFinding: (id: string) => void;
  onNavigate: (section: "site-map" | "findings" | "evidence" | "solutions") => void;
}) {
  const first = report.findings[0];
  return (
    <div className="overview-editorial">
      <section className="executive-summary">
        <div>
          <p className="section-kicker">The document investigation</p>
          <h2>
            {report.findings.length} findings
            <br />
            <em>grounded in HTML.</em>
          </h2>
          <p>
            {report.pages.length} document responses collected. Each finding traces to a measured
            response or parsed HTML. No browser or AI agents ran.
          </p>
          <div className="summary-verdicts">
            <span
              className={`status-pill ${report.summary.status === "partial" ? "unresolved" : "confirmed"}`}
            >
              {report.summary.status === "partial"
                ? "Partial investigation"
                : "Bounded investigation complete"}
            </span>
            <ProvenanceBadge value="OBSERVED" />
          </div>
        </div>
        <dl className="scope-facts">
          <div>
            <dt>Pages mapped</dt>
            <dd>
              {report.pages.length}
              <small>document responses</small>
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
            <dt>Scan duration</dt>
            <dd>
              {(report.summary.durationMs / 1000).toFixed(1)}
              <small>seconds</small>
            </dd>
          </div>
        </dl>
      </section>
      {first ? (
        <section className="priority-editorial" aria-labelledby="priority-title">
          <div className="priority-main">
            <div className="priority-byline">
              <span className="priority-marker" />
              Start with the evidence<code>{first.id}</code>
            </div>
            <h2 id="priority-title">{first.title}</h2>
            <p>{first.description}</p>
            <div className="priority-labels">
              <span>{first.category}</span>
              <ProvenanceBadge value="DERIVED" />
            </div>
            <button type="button" className="text-link" onClick={() => onFinding(first.id)}>
              Examine this finding <ArrowRight size={15} />
            </button>
          </div>
          <div className="priority-main">
            <p className="section-kicker">What was established</p>
            <p>
              Confirmed means the deterministic rule matches this recorded observation. It does not
              mean independent reproduction, browser verification, or a security certification.
            </p>
            <p>{first.recommendation}</p>
          </div>
        </section>
      ) : (
        <section className="network-note">
          <div>
            <h2>
              No rules matched
              <br />
              this small sample.
            </h2>
            <p>
              This does not establish that the website is healthy, accessible, or secure. The
              evidence remains available for inspection.
            </p>
          </div>
        </section>
      )}
      {report.findings.length > 1 && (
        <div className="also-confirmed">
          <span>Also observed</span>
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
      )}
      <section className="overview-map">
        <div className="section-heading">
          <div>
            <p className="section-kicker">The inspected surface</p>
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
          source="live"
        />
        <p className="figure-caption">
          {report.pages.length} fetched documents. Connections represent discovered navigational
          links between collected pages.
        </p>
      </section>
      <section className="network-note">
        <div>
          <p className="section-kicker">A supporting observation</p>
          <h2>
            Fetch time measures
            <br />a document request.
          </h2>
          <p>
            These durations include DNS, connection, redirects, and body transfer from this scanner.
            Browser rendering and field performance were not measured.
          </p>
        </div>
        <div>
          <ResponseChart pages={report.pages} source="live" />
          <p className="figure-caption">
            Up to six collected documents · Fetch duration in milliseconds
          </p>
        </div>
      </section>
      <section className="claim-story">
        <p className="section-kicker">Scope and limitations</p>
        <h2>What this investigation can establish.</h2>
        <p>
          Final origin: <code>{report.investigation?.finalOrigin}</code>.{" "}
          {report.investigation?.requestCount} bounded requests, including conventional metadata.
        </p>
        <ul>
          {report.investigation?.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          {report.investigation?.limitations.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
      <div className="overview-next">
        <span>Every conclusion has a record.</span>
        <button type="button" className="text-link" onClick={() => onNavigate("evidence")}>
          Review the evidence <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
