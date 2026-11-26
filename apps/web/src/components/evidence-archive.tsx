"use client";

import type { Evidence, ScanReport } from "@crossexam/contracts";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { evidenceLabel, liveChecks } from "../lib/live-checks";
import { claimLabel, reportClaims } from "../lib/presentation";
import { ProvenanceBadge } from "./ui";

const evidenceLayers = [
  {
    id: "surface",
    name: "Surface",
    liveName: "Page details",
    empty: "No page metadata was recorded.",
    liveEmpty: "No page titles or descriptions were recorded.",
  },
  {
    id: "structure",
    name: "DOM & components",
    liveName: "Page structure",
    empty: "No page structure was recorded.",
    liveEmpty: "No page structure was recorded.",
  },
  {
    id: "routes",
    name: "Routes & resources",
    liveName: "Links & files",
    empty: "No routes or resource references were recorded.",
    liveEmpty: "No links or file references were recorded.",
  },
  {
    id: "requests",
    name: "Requests & dependencies",
    liveName: "Requests",
    empty: "No separate request records. Page response codes appear in Responses & behavior.",
    liveEmpty: "No separate request records. See Server responses for page response codes.",
  },
  {
    id: "responses",
    name: "Responses & behavior",
    liveName: "Server responses",
    empty: "No responses were recorded.",
    liveEmpty: "No responses were recorded.",
  },
] as const;
type Layer = (typeof evidenceLayers)[number]["id"];

const layersByCode: Record<NonNullable<Evidence["code"]>, Layer> = {
  DOCUMENT_METADATA: "surface",
  DOCUMENT_STRUCTURE: "structure",
  BROWSER_RENDERED_DOM: "structure",
  BROWSER_ACCESSIBILITY_OBSERVATION: "structure",
  BROWSER_ACCESSIBILITY_RULES: "structure",
  RESOURCE_REFERENCES: "routes",
  ROBOTS_TXT: "routes",
  SITEMAP_XML: "routes",
  BROWSER_NAVIGATION: "routes",
  FETCH_FAILURE: "requests",
  BROWSER_REQUESTS: "requests",
  HTTP_STATUS: "responses",
  RESPONSE_HEADERS: "responses",
  BROWSER_RESPONSES: "responses",
  BROWSER_CONSOLE: "responses",
  BROWSER_PAGE_ERRORS: "responses",
  BROWSER_PERFORMANCE: "responses",
  BROWSER_RUNTIME_ANALYSIS: "responses",
};
const layersByKind: Record<Evidence["kind"], Layer> = {
  metadata: "surface",
  navigation: "routes",
  accessibility: "structure",
  network: "requests",
  headers: "responses",
  performance: "responses",
};

const liveCategoryLabels: Record<Evidence["kind"], string> = {
  metadata: "Page details",
  navigation: "Links",
  accessibility: "Accessibility",
  network: "Page responses",
  headers: "Server instructions",
  performance: "Download times",
};

function recordedStatus(item: Evidence) {
  const status = item.data?.statusCode;
  if (item.code === "FETCH_FAILURE") return "Not collected";
  if (item.code === "RESPONSE_HEADERS" && item.data?.["content-security-policy"] === null)
    return "Header missing";
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599)
    return status === 200 ? "200 OK" : String(status);
}

export function EvidenceArchive({
  report,
  query,
  onQuery,
  onFinding,
  onClaim,
}: {
  report: ScanReport;
  query: string;
  onQuery: (value: string) => void;
  onFinding: (id: string) => void;
  onClaim: (id: string) => void;
}) {
  const live = report.summary.source === "live";
  const [kind, setKind] = useState("all");
  const search = query.trim().toLowerCase();
  const labels = new Map(
    report.evidence.map((item) => [item.id, evidenceLabel(report.evidence, item.id)]),
  );
  const checks = live ? liveChecks(report) : [];
  const exactId = report.evidence.find(
    (item) => item.id.toLowerCase() === search || labels.get(item.id)?.toLowerCase() === search,
  )?.id;
  const records = report.evidence.filter((item) =>
    exactId
      ? item.id === exactId
      : (kind === "all" || item.kind === kind) &&
        `${labels.get(item.id)} ${checks.find((check) => check.id === item.id)?.question ?? ""} ${item.title} ${item.url} ${item.detail}`
          .toLowerCase()
          .includes(query.toLowerCase()),
  );
  const layers = evidenceLayers
    .map((layer, index) => ({
      ...layer,
      number: String(index + 1).padStart(2, "0"),
      items: records.filter(
        (item) => (item.code ? layersByCode[item.code] : layersByKind[item.kind]) === layer.id,
      ),
    }))
    .filter((layer) => layer.items.length || (!search && kind === "all"));
  function clear() {
    onQuery("");
    setKind("all");
  }
  return (
    <section className="evidence-archive">
      <div className="section-heading">
        <div>
          <p className="section-kicker">The evidence archive</p>
          <h2>
            Every conclusion starts with <em>evidence.</em>
          </h2>
        </div>
        <span className="archive-count">
          {records.length} of {report.evidence.length} records
        </span>
      </div>
      <p className="view-intro">
        {live
          ? "See what Veyra checked and which problems each check helps explain. Open the recorded details for the original evidence."
          : "See what each example check recorded and which problems it helps explain. All results on this page are sample data."}
      </p>
      <div className="archive-toolbar">
        <div className="evidence-search">
          <Search size={17} />
          <label htmlFor="evidence-search" className="sr-only">
            Search evidence
          </label>
          <input
            id="evidence-search"
            placeholder={live ? "Search checks or pages…" : "Search by evidence number or page…"}
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
                {live ? liveCategoryLabels[value] : value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="evidence-list">
        {layers.map((layer) => {
          const rows = layer.items.map((item) => {
            const check = checks.find((entry) => entry.id === item.id);
            const status = live ? recordedStatus(item) : undefined;
            const claims = reportClaims(report).filter((claim) =>
              claim.evidenceIds.includes(item.id),
            );
            return (
              <article className="evidence-record" key={item.id}>
                <div className="evidence-identity">
                  <code>{labels.get(item.id)}</code>
                  {status && <code className="evidence-status">{status}</code>}
                  <ProvenanceBadge value={item.provenance} plain={live} />
                </div>
                <div className="evidence-observation">
                  <h3>{check?.question ?? item.title}</h3>
                  <code className="evidence-source">{item.url}</code>
                  {check && (
                    <p>
                      <strong>Result</strong> {check.result}
                    </p>
                  )}
                  <details open={exactId === item.id}>
                    <summary>{live ? "Show recorded details" : "See check details"}</summary>
                    <p>{item.detail}</p>
                    <small>
                      {live && <>Classification: {item.provenance} · </>}Collector: {item.collector}{" "}
                      · Source: {item.source}
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
                      {live ? "Live" : "Demo"}
                    </span>
                  </time>
                  <div>
                    {claims.length ? (
                      claims.map((claim) => {
                        const finding = report.findings.find(
                          (finding) => finding.claimId === claim.id,
                        );
                        const label = finding
                          ? `Problem ${report.findings.indexOf(finding) + 1}`
                          : claimLabel(report, claim.id);
                        return finding ? (
                          <button
                            type="button"
                            key={claim.id}
                            onClick={() => onFinding(finding.id)}
                            aria-label={`Review ${label}`}
                          >
                            {label} ↗
                          </button>
                        ) : (
                          <button
                            type="button"
                            key={claim.id}
                            onClick={() => onClaim(claim.id)}
                            aria-label={`Review ${label}`}
                          >
                            {label} ↗
                          </button>
                        );
                      })
                    ) : (
                      <span>Background information</span>
                    )}
                  </div>
                </div>
              </article>
            );
          });
          return (
            <section
              className="evidence-layer"
              key={layer.id}
              aria-labelledby={`evidence-${layer.id}`}
            >
              <header>
                <h3 id={`evidence-${layer.id}`} className="report-label">
                  {layer.number} · {live ? layer.liveName : layer.name}
                </h3>
                <span className="archive-count">
                  {layer.items.length} {layer.items.length === 1 ? "record" : "records"}
                </span>
              </header>
              {rows.length ? (
                rows
              ) : (
                <p className="evidence-layer-empty">{live ? layer.liveEmpty : layer.empty}</p>
              )}
            </section>
          );
        })}
      </div>
      {!records.length && (
        <div className="empty-state">
          <Search size={28} />
          <h3>No evidence matches “{query}”</h3>
          <p>
            {live
              ? "Try a check number, a page address, or another category."
              : "Try an evidence number, a page address, or another category."}
          </p>
          <button type="button" className="button button-secondary" onClick={clear}>
            Clear search
          </button>
        </div>
      )}
      <p className="archive-note">
        {live
          ? "These records show what the website sent back when Veyra checked it. Browser behavior and the contents of linked files were not tested."
          : "Evidence classification describes how a statement was obtained. It does not make a synthetic record a live observation."}
      </p>
    </section>
  );
}
