"use client";

import type { ScanReport } from "@crossexam/contracts";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { ProvenanceBadge } from "./ui";

export function EvidenceArchive({
  report,
  query,
  onQuery,
  onFinding,
}: {
  report: ScanReport;
  query: string;
  onQuery: (value: string) => void;
  onFinding: (id: string) => void;
}) {
  const live = report.summary.source === "live";
  const [kind, setKind] = useState("all");
  const records = report.evidence.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      `${item.id} ${item.title} ${item.url} ${item.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function clear() {
    onQuery("");
    setKind("all");
  }
  return (
    <section className="evidence-archive">
      <div className="section-heading">
        <div>
          <p className="section-kicker">The evidence archive</p>
          <h2>Every conclusion starts somewhere.</h2>
        </div>
        <span className="archive-count">
          {records.length} of {report.evidence.length} records
        </span>
      </div>
      <p className="view-intro">
        {live
          ? "Inspect the recorded response and parsed HTML, then follow the deterministic claims they support. Reference lists and text are bounded; resources were not fetched."
          : "Inspect the source, then follow the claims it supports. “Observed” describes the evidence type; every record here is synthetic fixture data."}
      </p>
      <div className="archive-toolbar">
        <div className="evidence-search">
          <Search size={17} />
          <label htmlFor="evidence-search" className="sr-only">
            Search evidence
          </label>
          <input
            id="evidence-search"
            placeholder="Search by ID, observation, or URL…"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              aria-label="Clear evidence search"
              onClick={() => onQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <label className="filter-label">
          <span>Category</span>
          <select
            aria-label="Filter evidence category"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">All evidence</option>
            {[...new Set(report.evidence.map((item) => item.kind))].map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="archive-columns" aria-hidden="true">
        <span>Record / type</span>
        <span>Observation / source</span>
        <span>Captured / referenced claims</span>
      </div>
      <div className="evidence-list">
        {records.map((item) => {
          const claims = report.claims.filter((claim) => claim.evidenceIds.includes(item.id));
          return (
            <article className="evidence-record" key={item.id}>
              <div className="evidence-identity">
                <code>{item.id}</code>
                <ProvenanceBadge value={item.provenance} />
                <span>{item.kind}</span>
              </div>
              <div className="evidence-observation">
                <h3>{item.title}</h3>
                <code className="evidence-source">{item.url}</code>
                <details open={query.trim().toUpperCase() === item.id}>
                  <summary>Read observation</summary>
                  <p>{item.detail}</p>
                  <small>
                    Collector: {item.collector} · Source: {item.source}
                  </small>
                  {item.data && (
                    <dl className="observation-data">
                      {Object.entries(item.data).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>
                            {value === null
                              ? "Not observed"
                              : Array.isArray(value)
                                ? value.length
                                  ? value.join("\n")
                                  : "None recorded"
                                : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </details>
              </div>
              <div className="evidence-references">
                <time dateTime={item.capturedAt}>
                  {new Date(item.capturedAt).toISOString().slice(11, 19)} UTC
                  <span>
                    {new Date(item.capturedAt).toISOString().slice(0, 10)} ·{" "}
                    {live ? "Live" : "Fixture"}
                  </span>
                </time>
                <div>
                  {claims.length ? (
                    claims.map((claim) => {
                      const finding = report.findings.find(
                        (finding) => finding.claimId === claim.id,
                      );
                      return finding ? (
                        <button
                          type="button"
                          key={claim.id}
                          onClick={() => onFinding(finding.id)}
                          aria-label={`Review claim ${claim.id}`}
                        >
                          <code>{claim.id}</code> ↗
                        </button>
                      ) : (
                        <code key={claim.id}>{claim.id}</code>
                      );
                    })
                  ) : (
                    <span>Context record · No direct claim</span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!records.length && (
        <div className="empty-state">
          <Search size={28} />
          <h3>No evidence matches “{query}”</h3>
          <p>Try a record ID such as E-001, a route, or another category.</p>
          <button type="button" className="button button-secondary" onClick={clear}>
            Clear search
          </button>
        </div>
      )}
      <p className="archive-note">
        {live
          ? "Observed means captured by this HTTP collector under the recorded conditions. It does not imply browser execution or independent reproduction."
          : "Evidence classification describes how a statement was obtained. It does not make a synthetic record a live observation."}
      </p>
    </section>
  );
}
