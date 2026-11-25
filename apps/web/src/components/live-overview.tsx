"use client";

import type { ScanReport } from "@crossexam/contracts";
import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ScanComparison } from "../lib/live-checks";
import { LiveChecks } from "./live-checks";
import styles from "./live-report.module.css";

const SiteGraph = dynamic(() => import("./site-graph"), { ssr: false });

export function LiveOverview({
  report,
  comparison,
  affected,
  onFinding,
  onEvidence,
  onNavigate,
}: {
  report: ScanReport;
  comparison?: ScanComparison;
  affected: Record<string, number>;
  onFinding: (id: string) => void;
  onEvidence: (id: string) => void;
  onNavigate: (section: "site-map" | "evidence") => void;
}) {
  const chartPages = report.pages.slice(0, 6);
  const longestFetch = Math.max(1, ...chartPages.map((page) => page.durationMs));
  const problemCount = report.findings.length;
  const investigation = report.investigation;

  return (
    <div className="overview-editorial">
      <section className="executive-summary">
        <div>
          {comparison ? (
            <section className={styles.comparison} aria-labelledby="last-scan">
              <h2 id="last-scan">Since your last scan</h2>
              <p>
                <strong>{comparison.headline}</strong>
              </p>
              {comparison.details.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
              <Link
                className="text-link"
                href={`/report/${encodeURIComponent(comparison.previousId)}`}
              >
                View previous report
              </Link>
            </section>
          ) : (
            <h2>
              {problemCount
                ? `${problemCount} ${problemCount === 1 ? "problem" : "problems"}`
                : "No problems"}{" "}
              <em>flagged</em>
            </h2>
          )}
        </div>
        <dl className="scope-facts">
          <div>
            <dt>Pages checked</dt>
            <dd>{report.pages.length}</dd>
          </div>
          <div>
            <dt>Checks and observations</dt>
            <dd>
              <button type="button" onClick={() => onNavigate("evidence")}>
                {report.evidence.length}
                <ArrowUpRight size={17} />
              </button>
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
      <LiveChecks report={report} onFinding={onFinding} onEvidence={onEvidence} />
      <section className="overview-map">
        <div className="section-heading">
          <h2>
            How the pages <em>connect</em>
          </h2>
          <button type="button" className="text-link" onClick={() => onNavigate("site-map")}>
            Explore the site map <ArrowUpRight size={15} />
          </button>
        </div>
        <SiteGraph
          pages={report.pages}
          affected={affected}
          findings={report.findings}
          evidence={report.evidence}
          onEvidence={onEvidence}
          onFinding={onFinding}
          source="live"
          liveReport={report}
        />
      </section>
      <section className="network-note">
        <div>
          <h2 id="fetch-timing-title">How long each page took to download</h2>
          <p>
            These times cover downloading each page’s source. What visitors see may load
            differently.
          </p>
          {report.pages.length > chartPages.length && (
            <p>
              Showing the first {chartPages.length} of {report.pages.length} pages.
            </p>
          )}
        </div>
        {chartPages.length ? (
          <ul className={styles.fetchChart} aria-labelledby="fetch-timing-title">
            {chartPages.map((page) => (
              <li key={page.id}>
                <div className={styles.timingLabels}>
                  <span className={styles.pageName}>
                    {page.path === "/" ? "Homepage" : page.path}
                  </span>{" "}
                  <span className={styles.pageTime}>{page.durationMs} ms</span>
                </div>
                <svg
                  className={styles.timingBar}
                  aria-hidden="true"
                  width="100%"
                  height="10"
                  viewBox="0 0 1000 10"
                  preserveAspectRatio="none"
                >
                  <rect width="1000" height="10" rx="8" fill="#e0e6ef" />
                  <rect
                    width={(page.durationMs / longestFetch) * 1000}
                    height="10"
                    rx="8"
                    fill="#5477b0"
                  />
                </svg>
              </li>
            ))}
          </ul>
        ) : (
          <p>No page times were recorded.</p>
        )}
      </section>
      <section className={styles.coverage} aria-labelledby="live-coverage">
        <h2 id="live-coverage">What this scan covers</h2>
        <p>
          Veyra checked the source and responses for the pages listed above. This scan skips browser
          speed, accessibility testing, and AI review.
        </p>
        {investigation && (
          <details>
            <summary>Technical scan details</summary>
            <p>
              {investigation.requestCount} requests to <code>{investigation.finalOrigin}</code>,
              including site metadata.
            </p>
            <ul>
              {[...investigation.notes, ...investigation.limitations].map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
