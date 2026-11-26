"use client";

import type { Evidence, Finding, Page, ScanReport } from "@crossexam/contracts";
import {
  Background,
  Controls,
  getViewportForBounds,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { ArrowUpRight, FileText, Globe2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { evidenceLabel, liveChecks, plainFinding } from "../lib/live-checks";
import { LiveCheckGroups } from "./live-checks";
import "@xyflow/react/dist/style.css";
import "../app/site-map-stage18.css";

type ViewMode = "graph" | "list";
type Point = { x: number; y: number };

type RouteNodeData = {
  page: Page;
  issueCount: number | undefined;
  live: boolean;
  onSelect: (id: string) => void;
};

type RouteNode = Node<RouteNodeData, "route">;

function statusLabel(statusCode: number) {
  const family = Math.floor(statusCode / 100);
  if (family >= 1 && family <= 5) return `${family}xx response`;
  return "non-standard response";
}

function isErrorStatus(statusCode: number) {
  return statusCode >= 400;
}

function issueLabel(issueCount: number | undefined, live: boolean) {
  if (live && issueCount !== undefined)
    return `${issueCount} ${issueCount === 1 ? "problem" : "problems"} flagged`;
  if (issueCount === undefined) return "Finding count unavailable";
  return `${issueCount} ${issueCount === 1 ? "finding record" : "finding records"}`;
}

function routeOrder(a: Page, b: Page) {
  return a.path.localeCompare(b.path) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Place pages into relationship-derived layers instead of relying on fixture IDs. */
function derivePositions(pages: Page[], compact: boolean, centerRows: boolean) {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const incoming = new Map(pages.map((page) => [page.id, 0]));

  for (const page of pages) {
    for (const target of page.linksTo) {
      if (incoming.has(target)) incoming.set(target, (incoming.get(target) ?? 0) + 1);
    }
  }

  const levels = new Map<string, number>();
  const queue = pages.filter((page) => incoming.get(page.id) === 0).sort(routeOrder);
  for (const page of queue) levels.set(page.id, page.depth ?? 0);

  for (let index = 0; index < queue.length; index += 1) {
    const page = queue[index];
    if (!page) break;
    const currentLevel = levels.get(page.id) ?? 0;
    for (const targetId of page.linksTo) {
      const target = pageById.get(targetId);
      if (!target) continue;
      const nextLevel = Math.max(currentLevel + 1, target.depth ?? 0);
      if (!levels.has(target.id)) {
        levels.set(target.id, nextLevel);
        queue.push(target);
      }
    }
  }

  const maxLevel = Math.max(0, ...levels.values());
  for (const page of pages) {
    if (!levels.has(page.id)) levels.set(page.id, page.depth ?? maxLevel + 1);
  }

  const byLevel = new Map<number, Page[]>();
  for (const page of pages) {
    const level = levels.get(page.id) ?? 0;
    const bucket = byLevel.get(level) ?? [];
    bucket.push(page);
    byLevel.set(level, bucket);
  }

  const columns = compact ? 2 : 4;
  const widestRow = Math.min(
    columns,
    Math.max(0, ...[...byLevel.values()].map((row) => row.length)),
  );
  const positions = new Map<string, Point>();
  let rowOffset = 0;
  for (const [, levelPages] of [...byLevel.entries()].sort(([a], [b]) => a - b)) {
    levelPages.sort(routeOrder);
    levelPages.forEach((page, index) => {
      const row = Math.floor(index / columns);
      const rowLength = Math.min(columns, levelPages.length - row * columns);
      positions.set(page.id, {
        x: ((index % columns) + (centerRows ? (widestRow - rowLength) / 2 : 0)) * 240,
        y: rowOffset + row * 165,
      });
    });
    rowOffset += Math.ceil(levelPages.length / columns) * 165;
  }
  return positions;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return null;
  }
}

function normalizePath(value: string) {
  try {
    const url = new URL(value, "https://route-record.invalid");
    const pathname = url.pathname || "/";
    const normalizedPath = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
    return `${normalizedPath}${url.search}`;
  } catch {
    return value === "/" ? value : value.replace(/\/+$/, "");
  }
}

function evidenceForPage(page: Page, evidence: Evidence[]) {
  const pageUrls = [page.finalUrl, page.requestedUrl]
    .filter((value): value is string => Boolean(value))
    .map(normalizeUrl)
    .filter((value): value is string => Boolean(value));

  if (pageUrls.length > 0) {
    return evidence.filter((item) => {
      const evidenceUrl = normalizeUrl(item.url);
      return evidenceUrl !== null && pageUrls.includes(evidenceUrl);
    });
  }

  const pagePath = normalizePath(page.path);
  return evidence.filter((item) => normalizePath(item.url) === pagePath);
}

function RouteCard({ data, id, selected }: NodeProps<RouteNode>) {
  const { page, issueCount, live, onSelect } = data;
  const error = isErrorStatus(page.statusCode);
  const hasIssues = issueCount !== undefined && issueCount > 0;
  return (
    <button
      type="button"
      className={`route-node site-map-route-node ${error ? "route-broken" : ""} ${selected ? "route-selected" : ""}`}
      aria-pressed={selected}
      aria-label={`Select ${page.path}, ${page.statusCode} ${statusLabel(page.statusCode)}`}
      onClick={() => onSelect(id)}
    >
      <Handle type="target" position={Position.Top} />
      <div className="route-node-top">
        {page.path === "/" ? (
          <Globe2 size={13} aria-hidden="true" />
        ) : (
          <FileText size={13} aria-hidden="true" />
        )}
        <span className="site-map-route-title">{page.title}</span>
        <span className={`route-code ${error ? "bad" : ""}`}>
          {page.statusCode} {!live && <span>{statusLabel(page.statusCode)}</span>}
        </span>
      </div>
      <strong title={page.path}>{live && page.path === "/" ? "Homepage" : page.path}</strong>
      <div className="route-node-bottom">
        {!live && <span>{page.durationMs} ms</span>}
        <span
          className={
            hasIssues ? "route-issues site-map-status-text" : "route-clear site-map-status-text"
          }
        >
          {issueLabel(issueCount, live)}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </button>
  );
}

const nodeTypes = { route: RouteCard };
const graphMinZoom = 0.3;
const graphMaxZoom = 1.5;

function FitLiveGraph() {
  const { getNodes, getNodesBounds, setViewport, viewportInitialized } = useReactFlow();
  const nodesReady = useStore(
    ({ nodeLookup }) =>
      nodeLookup.size > 0 &&
      Array.from(nodeLookup.values()).every(({ measured }) => measured.width && measured.height),
  );
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  useEffect(() => {
    if (viewportInitialized && nodesReady && width > 0 && height > 0) {
      const bounds = getNodesBounds(getNodes());
      void setViewport(
        getViewportForBounds(bounds, width, height, graphMinZoom, graphMaxZoom, 0.15),
      );
    }
  }, [getNodes, getNodesBounds, setViewport, viewportInitialized, nodesReady, width, height]);

  return null;
}

function subscribeToViewport(callback: () => void) {
  const media = window.matchMedia("(max-width: 760px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export default function SiteGraph({
  pages,
  affected,
  expanded = false,
  findings = [],
  evidence,
  onEvidence,
  onFinding,
  source = "fixture",
  liveReport,
}: {
  source?: "fixture" | "live";
  pages: Page[];
  affected: Record<string, number>;
  expanded?: boolean;
  findings?: Finding[];
  evidence?: Evidence[];
  onEvidence?: (id: string) => void;
  onFinding?: (id: string) => void;
  liveReport?: ScanReport;
}) {
  const live = Boolean(liveReport);
  const compact = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia("(max-width: 760px)").matches,
    () => false,
  );
  const [selectedId, setSelectedId] = useState(pages[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<ViewMode | "automatic">("automatic");
  const selected = pages.find((page) => page.id === selectedId);
  const activeView = viewMode === "automatic" ? (compact ? "list" : "graph") : viewMode;
  const selectPage = useCallback((id: string) => setSelectedId(id), []);

  useEffect(() => {
    if (!pages.some((page) => page.id === selectedId)) setSelectedId(pages[0]?.id ?? "");
  }, [pages, selectedId]);

  const positions = useMemo(() => derivePositions(pages, compact, live), [pages, compact, live]);
  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const nodes: RouteNode[] = useMemo(
    () =>
      pages.map((page, index) => ({
        id: page.id,
        type: "route",
        position: positions.get(page.id) ?? {
          x: (index % (compact ? 2 : 4)) * 240,
          y: Math.floor(index / (compact ? 2 : 4)) * 165,
        },
        selected: selectedId === page.id,
        data: {
          page,
          issueCount: affected[page.path],
          live,
          onSelect: selectPage,
        },
      })),
    [affected, compact, live, pages, positions, selectPage, selectedId],
  );
  const edges = useMemo(
    () =>
      pages.flatMap((page) =>
        page.linksTo.flatMap((target) => {
          const targetPage = pageById.get(target);
          if (!targetPage) return [];
          const connected = page.id === selectedId || target === selectedId;
          const routeHasError =
            isErrorStatus(page.statusCode) || isErrorStatus(targetPage.statusCode);
          return [
            {
              id: `${page.id}-${target}`,
              source: page.id,
              target,
              type: "smoothstep" as const,
              style: {
                stroke: connected ? "#2458a6" : routeHasError ? "#b5473d" : "#bac4cd",
                strokeWidth: connected ? 2 : 1,
                strokeDasharray: routeHasError ? "4 4" : undefined,
              },
            },
          ];
        }),
      ),
    [pageById, pages, selectedId],
  );
  const selectedFindings = selected
    ? findings.filter((finding) => finding.affectedPaths.includes(selected.path))
    : [];
  const selectedEvidence = selected ? evidenceForPage(selected, evidence ?? []) : [];
  const selectedChecks = liveReport
    ? liveChecks(liveReport).filter((check) =>
        selectedEvidence.some((item) => item.id === check.id),
      )
    : [];
  const remainingEvidence = selectedEvidence.filter(
    (item) => !selectedChecks.some((check) => check.id === item.id),
  );
  const hasFindingCount = selected ? Object.hasOwn(affected, selected.path) : false;
  const sourceLabel = source === "live" ? "Live report record" : "Synthetic fixture record";

  return (
    <div
      className={`site-graph-wrap site-map-stage18${expanded ? " site-map-expanded" : ""}${live ? " site-map-live" : ""}`}
    >
      <div className="site-map-panel">
        <div className="site-map-toolbar">
          <div>
            {!live && <p className="site-map-kicker">Site map view</p>}
            <fieldset className="site-map-view-toggle">
              <legend className="site-map-sr-only">Site map view</legend>
              <button
                type="button"
                className={activeView === "graph" ? "is-active" : ""}
                aria-pressed={activeView === "graph"}
                onClick={() => setViewMode("graph")}
              >
                Show graph
              </button>
              <button
                type="button"
                className={activeView === "list" ? "is-active" : ""}
                aria-pressed={activeView === "list"}
                onClick={() => setViewMode("list")}
              >
                Show route list
              </button>
            </fieldset>
          </div>
          {!live && (
            <span className="site-map-mode-note">
              {activeView === "list" ? "Route list with selected detail" : "Connected route graph"}
            </span>
          )}
        </div>

        {pages.length === 0 ? (
          <div className="site-map-empty" role="status">
            <strong>No route records available.</strong>
            <p>No page responses were collected for this report.</p>
          </div>
        ) : activeView === "graph" ? (
          <div
            className={`site-graph site-map-graph ${expanded ? "expanded" : ""}`}
            data-testid="site-graph"
          >
            <ReactFlowProvider key={compact ? "compact" : "wide"}>
              <div className="site-map-canvas">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodeClick={(_, node) => selectPage(node.id)}
                  onNodesChange={(changes) => {
                    const selection = changes.find(
                      (change) => change.type === "select" && change.selected,
                    );
                    if (selection?.type === "select") selectPage(selection.id);
                  }}
                  fitView={!live}
                  fitViewOptions={{ padding: 0.12 }}
                  minZoom={graphMinZoom}
                  maxZoom={graphMaxZoom}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  deleteKeyCode={null}
                  multiSelectionKeyCode={null}
                  edgesFocusable={false}
                  zoomOnScroll={false}
                  preventScrolling={false}
                  colorMode="light"
                  aria-label={
                    source === "live"
                      ? "Interactive live route graph"
                      : "Interactive synthetic fixture route graph"
                  }
                  ariaLabelConfig={{
                    "node.a11yDescription.default":
                      "Select this route with Enter or Space to inspect it. Routes cannot be edited or deleted.",
                  }}
                >
                  <Background color="#d7dcdf" gap={19} size={1} />
                  {!compact && <Controls showInteractive={false} position="bottom-left" />}
                  {live && <FitLiveGraph />}
                </ReactFlow>
              </div>
              {compact && (
                <div className="site-map-controls-row">
                  <Controls showInteractive={false} orientation="horizontal" />
                </div>
              )}
            </ReactFlowProvider>
            {!live && (
              <div className="graph-legend" role="note">
                <span>Edges represent recorded page.linksTo relationships.</span>
                <span>
                  <i className="legend-dot coral" aria-hidden="true" />
                  4xx/5xx statuses are marked as errors with text and dashed edges.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="site-map-route-list" data-testid="site-route-list">
            {!live && (
              <div className="site-map-list-heading">
                <p className="site-map-kicker">Routes</p>
                <span>Select a route to inspect its record.</span>
              </div>
            )}
            <ul>
              {pages.map((page) => {
                const error = isErrorStatus(page.statusCode);
                return (
                  <li key={page.id}>
                    <button
                      type="button"
                      className={selectedId === page.id ? "is-selected" : ""}
                      aria-pressed={selectedId === page.id}
                      onClick={() => selectPage(page.id)}
                    >
                      <code title={page.path}>
                        {live && page.path === "/" ? "Homepage" : page.path}
                      </code>
                      <span className={`site-map-list-status ${error ? "is-error" : ""}`}>
                        {error && <b aria-hidden="true">!</b>}
                        <strong>{page.statusCode}</strong>
                        {!live && <span>{statusLabel(page.statusCode)}</span>}
                      </span>
                      <small>{issueLabel(affected[page.path], live)}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <aside
        className={`graph-inspector site-map-inspector${liveReport ? " site-map-inspector-live" : ""}`}
        aria-live="polite"
      >
        {selected ? (
          <>
            <label>
              {liveReport ? "Choose a page" : "Inspect route"}
              <select
                aria-label={liveReport ? "Choose a page" : "INSPECT ROUTE"}
                value={selectedId}
                onChange={(event) => selectPage(event.target.value)}
              >
                {pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {live && page.path === "/" ? "Homepage" : page.path}
                  </option>
                ))}
              </select>
            </label>
            <div className="site-map-detail-heading">
              {!live && <p className="site-map-kicker">Selected route</p>}
              <h3>{selected.title}</h3>
              <code title={selected.path}>
                {live && selected.path === "/" ? "Homepage" : selected.path}
              </code>
            </div>
            <p
              className={`site-map-detail-status ${isErrorStatus(selected.statusCode) ? "is-error" : ""}`}
            >
              {isErrorStatus(selected.statusCode) && <b aria-hidden="true">!</b>}
              {liveReport ? (
                <>
                  <strong>
                    {selected.statusCode === 404
                      ? "Page not found"
                      : selected.statusCode >= 200 && selected.statusCode < 300
                        ? "Page responded successfully"
                        : "Page returned status"}
                  </strong>{" "}
                  ({selected.statusCode})
                </>
              ) : (
                <>
                  <strong>{selected.statusCode}</strong> response ·{" "}
                  {statusLabel(selected.statusCode)}
                </>
              )}
              <span> · {selected.durationMs} ms</span>
            </p>

            <p className="site-map-detail-label">Problems on this page</p>
            {selectedFindings.length > 0 ? (
              <div className="site-map-detail-links">
                {selectedFindings.map((finding) => (
                  <button type="button" key={finding.id} onClick={() => onFinding?.(finding.id)}>
                    <code>{`Problem ${findings.indexOf(finding) + 1}`}</code>
                    <span>
                      {liveReport ? plainFinding(liveReport, finding).title : finding.title}
                    </span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="site-map-detail-empty">
                {hasFindingCount && affected[selected.path] === 0
                  ? liveReport
                    ? "Veyra flagged no problems on this page."
                    : "No finding records are attached to this route."
                  : hasFindingCount
                    ? "Finding records are not available in this view."
                    : "Finding count is not available for this route."}
              </p>
            )}

            <p className="site-map-detail-label">
              {liveReport ? "Checks on this page" : "Evidence records"}
            </p>
            {liveReport && (
              <LiveCheckGroups checks={selectedChecks} onEvidence={onEvidence} showPage={false} />
            )}
            {!liveReport && evidence === undefined ? (
              <p className="site-map-detail-empty">
                Evidence records are not attached to this view.
              </p>
            ) : remainingEvidence.length > 0 ? (
              <div className="site-map-detail-links site-map-evidence-links">
                {remainingEvidence.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    disabled={!onEvidence}
                    onClick={() => onEvidence?.(item.id)}
                    title={item.url}
                  >
                    <code>{evidenceLabel(evidence ?? [], item.id)}</code>
                    <span>{item.title}</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              !liveReport && (
                <p className="site-map-detail-empty">No evidence records match this route URL.</p>
              )
            )}

            {!live && (
              <small className="site-map-record-note">
                {sourceLabel}. Status and duration are recorded route fields; no overall health
                claim is made.
              </small>
            )}
          </>
        ) : (
          <div className="site-map-empty site-map-empty-detail" role="status">
            <strong>Select a route to inspect its record.</strong>
          </div>
        )}
      </aside>
    </div>
  );
}
