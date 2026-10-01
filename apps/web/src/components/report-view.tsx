"use client";

import type { Finding, ScanReport } from "@crossexam/contracts";
import { summarizeVerdicts } from "@crossexam/engine";
import { ArrowUpRight, Check, ChevronRight, Download, FlaskConical, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { EvidenceArchive } from "./evidence-archive";
import { FindingRow } from "./finding-row";
import { LiveOverview } from "./live-overview";
import { ReportOverview } from "./report-overview";
import { ReportSolutions } from "./report-solutions";
import { Badge, Brand } from "./ui";

const SiteGraph = dynamic(() => import("./site-graph"), {
  ssr: false,
  loading: () => <div className="graph-loading">Preparing the site map…</div>,
});
const sections = [
  { id: "overview", label: "Overview" },
  { id: "site-map", label: "Site Map" },
  { id: "findings", label: "Findings" },
  { id: "evidence", label: "Evidence" },
  { id: "solutions", label: "Solutions" },
] as const;
type Section = (typeof sections)[number]["id"];

export function ReportView({ report }: { report: ScanReport }) {
  const live = report.summary.source === "live";
  const [section, setSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const counts = summarizeVerdicts(report);
  const affected = useMemo(
    () =>
      report.findings.reduce<Record<string, number>>((acc, finding) => {
        for (const path of finding.affectedPaths) acc[path] = (acc[path] ?? 0) + 1;
        return acc;
      }, {}),
    [report.findings],
  );

  function navigate(next: Section) {
    setSection(next);
    setQuery("");
    setSeverity("all");
    setOpenFinding(null);
  }
  function showEvidence(id: string) {
    setSection("evidence");
    setQuery(id);
    requestAnimationFrame(() => contentRef.current?.focus());
  }
  function showFinding(id: string) {
    setSection("findings");
    setSeverity("all");
    setOpenFinding(id);
    requestAnimationFrame(() => contentRef.current?.focus());
  }
  function exportReport() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = live
      ? `crossexam-${report.summary.id}.json`
      : "crossexam-fixture-report.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true);
  }

  function findingRow(finding: Finding) {
    return (
      <FindingRow
        key={finding.id}
        finding={finding}
        report={report}
        open={openFinding === finding.id}
        onToggle={() => setOpenFinding(openFinding === finding.id ? null : finding.id)}
        onEvidence={showEvidence}
      />
    );
  }

  return (
    <div className="report-document">
      <header className="report-masthead">
        <Brand />
        <div>
          <Link href="/">Workspace</Link>
          <ChevronRight size={13} />
          <span>
            {live ? `Investigation ${report.summary.id.slice(0, 8)}` : "Investigation 001"}
          </span>
        </div>
        <Link className="text-link" href="/">
          New examination <Plus size={15} />
        </Link>
      </header>
      <main id="main" className="report-paper">
        <div className={`fixture-notice ${live ? "live-notice" : ""}`}>
          <FlaskConical size={15} />
          <strong>{live ? "LIVE INVESTIGATION" : "Fixture investigation"}</strong>
          <span>
            {live
              ? "Real HTTP and HTML evidence. No browser or AI agents were run."
              : "No website was scanned and no AI agents were run."}
          </span>
        </div>
        <header className="case-heading">
          <div>
            <p className="section-kicker">
              Website investigation{" "}
              <span className="case-number">/ {live ? report.summary.id.slice(0, 8) : "001"}</span>
            </p>
            <h1>{new URL(report.summary.targetUrl).hostname}</h1>
            <div className="case-metadata">
              <code>{report.summary.targetUrl}</code>
              <span
                className={`status-pill ${live && report.summary.status === "partial" ? "unresolved" : "confirmed"}`}
              >
                <Check size={13} />
                {live
                  ? report.summary.status === "partial"
                    ? "Partial investigation"
                    : "Investigation complete"
                  : "Demo complete"}
              </span>
              <span>
                {live
                  ? `${report.summary.startedAt.slice(0, 10)} · ${report.summary.startedAt.slice(11, 19)} UTC · ${(report.summary.durationMs / 1000).toFixed(1)} s`
                  : "30 September 2026 · 10:24 UTC · 48.6 s"}
              </span>
            </div>
          </div>
          <button type="button" className="button button-secondary" onClick={exportReport}>
            <Download size={15} />
            {live ? "Export investigation" : "Export fixture"}
          </button>
        </header>
        <span className="sr-only" role="status">
          {exported
            ? live
              ? "Live report downloaded as JSON."
              : "Fixture report downloaded as JSON."
            : ""}
        </span>
        <nav className="report-navigation" aria-label="Investigation views">
          {sections.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => navigate(id)}
              aria-pressed={section === id}
            >
              {label}
              {id === "findings" && <span>{report.findings.length}</span>}
              {id === "evidence" && <span>{report.evidence.length}</span>}
            </button>
          ))}
          <span>Evidence, not assumptions.</span>
        </nav>
        <section
          ref={contentRef}
          tabIndex={-1}
          className="report-content"
          aria-label={`${sections.find((item) => item.id === section)?.label} content`}
        >
          {section === "overview" && live && (
            <LiveOverview
              report={report}
              affected={affected}
              onNavigate={navigate}
              onFinding={showFinding}
            />
          )}
          {section === "overview" && !live && (
            <ReportOverview
              report={report}
              counts={counts}
              affected={affected}
              onNavigate={navigate}
              onFinding={showFinding}
              onEvidence={showEvidence}
            />
          )}
          {section === "site-map" && (
            <section className="map-index">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">The public surface</p>
                  <h2>Every route has a context.</h2>
                </div>
                <span className="archive-count">
                  {report.pages.length} routes · {live ? "Live observations" : "Fixture data"}
                </span>
              </div>
              <p className="view-intro">
                Follow a connection, select a route, then inspect the findings attached to it.
              </p>
              <SiteGraph
                pages={report.pages}
                affected={affected}
                findings={report.findings}
                onFinding={showFinding}
                expanded
                source={report.summary.source}
              />
              <div className="route-table-wrap">
                <table className="route-table">
                  <caption className="sr-only">
                    {live
                      ? "Accessible route inventory; live document observations"
                      : "Accessible route inventory; all values are fixture data"}
                  </caption>
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Response</th>
                      <th>Time</th>
                      <th>Findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pages.map((page) => (
                      <tr key={page.id}>
                        <td>
                          <code>{page.path}</code>
                        </td>
                        <td>
                          <Badge tone={page.statusCode === 200 ? "green" : "coral"}>
                            {page.statusCode}
                          </Badge>
                        </td>
                        <td>{page.durationMs} ms</td>
                        <td>{affected[page.path] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {section === "findings" && (
            <section className="findings-index">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">The findings</p>
                  <h2>
                    {live
                      ? `${report.findings.length} findings. Each with a record.`
                      : "Five claims. Nothing taken on trust."}
                  </h2>
                </div>
                <label className="filter-label">
                  <span>Severity</span>
                  <select
                    value={severity}
                    onChange={(event) => setSeverity(event.target.value)}
                    aria-label="Filter severity"
                  >
                    <option value="all">All severities</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    {live && <option value="info">Info</option>}
                  </select>
                </label>
              </div>
              <p className="view-intro">
                {live
                  ? "These deterministic rules describe the recorded HTTP responses and returned HTML. They do not establish browser behavior or a complete security/accessibility assessment."
                  : "Three findings are confirmed in this example. The two uncertain claims stay visible, with their unanswered questions."}
              </p>
              <div className="finding-columns" aria-hidden="true">
                <span>Severity</span>
                <span>Finding / affected routes</span>
                <span>Evidence type</span>
                <span>Verdict</span>
                <span />
              </div>
              {report.findings
                .filter((finding) => severity === "all" || finding.severity === severity)
                .map(findingRow)}
              {!report.findings.filter(
                (finding) => severity === "all" || finding.severity === severity,
              ).length && (
                <p className="view-intro">
                  No findings match this view. Review the evidence and scope before drawing broader
                  conclusions.
                </p>
              )}
              <p className="archive-note">
                {live
                  ? "Open a finding to inspect its rule and supporting evidence. No AI challenge or reproduction experiment was performed."
                  : "Open any finding to follow its claim, challenge, experiment, and verdict. All records are fixture data."}
              </p>
            </section>
          )}
          {section === "evidence" && (
            <EvidenceArchive
              report={report}
              query={query}
              onQuery={setQuery}
              onFinding={showFinding}
            />
          )}
          {section === "solutions" && (
            <ReportSolutions report={report} onFinding={showFinding} onEvidence={showEvidence} />
          )}
        </section>
        <footer className="case-footer">
          <span>
            CrossExam <span>·</span> Every conclusion has a record.
          </span>
          <span>{live ? "Live observations" : "Fixture data"} · Schema v1</span>
          <a href="/#method">
            About the method <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
    </div>
  );
}
