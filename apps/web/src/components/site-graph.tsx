"use client";

import type { Finding, Page } from "@crossexam/contracts";
import {
  Background,
  Controls,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { FileText, Globe2 } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import "@xyflow/react/dist/style.css";

type RouteNode = Node<{ page: Page; issueCount: number }, "route">;

function RouteCard({ data, selected }: NodeProps<RouteNode>) {
  const broken = data.page.statusCode >= 400;
  return (
    <div
      className={`route-node ${broken ? "route-broken" : ""} ${selected ? "route-selected" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="route-node-top">
        {data.page.path === "/" ? <Globe2 size={13} /> : <FileText size={13} />}
        <span>{data.page.title}</span>
        <span className={`route-code ${broken ? "bad" : ""}`}>{data.page.statusCode}</span>
      </div>
      <strong>{data.page.path}</strong>
      <div className="route-node-bottom">
        <span>{data.page.durationMs} ms</span>
        {data.issueCount > 0 ? (
          <span className="route-issues">
            {data.issueCount} {data.issueCount === 1 ? "finding" : "findings"}
          </span>
        ) : (
          <span className="route-clear">No findings</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { route: RouteCard };
const positions: Record<string, { x: number; y: number }> = {
  home: { x: 360, y: 0 },
  work: { x: 0, y: 165 },
  studio: { x: 240, y: 165 },
  journal: { x: 480, y: 165 },
  contact: { x: 720, y: 165 },
  atlas: { x: 0, y: 330 },
  design: { x: 380, y: 330 },
  legacy: { x: 620, y: 330 },
};

const compactPositions: Record<string, { x: number; y: number }> = {
  home: { x: 115, y: 0 },
  work: { x: 0, y: 135 },
  studio: { x: 240, y: 135 },
  journal: { x: 0, y: 270 },
  contact: { x: 240, y: 270 },
  atlas: { x: 0, y: 405 },
  design: { x: 240, y: 405 },
  legacy: { x: 115, y: 540 },
};
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
  onFinding,
  source = "fixture",
}: {
  source?: "fixture" | "live";
  pages: Page[];
  affected: Record<string, number>;
  expanded?: boolean;
  findings?: Finding[];
  onFinding?: (id: string) => void;
}) {
  const compact = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia("(max-width: 760px)").matches,
    () => false,
  );
  const [selectedId, setSelectedId] = useState(pages[0]?.id ?? "");
  const selected = pages.find((page) => page.id === selectedId);
  const nodes: RouteNode[] = useMemo(
    () =>
      pages.map((page, index) => ({
        id: page.id,
        type: "route",
        position: (compact ? compactPositions : positions)[page.id] ?? {
          x: (index % (compact ? 2 : 3)) * 240,
          y: Math.floor(index / (compact ? 2 : 3)) * 165,
        },
        selected: selectedId === page.id,
        data: { page, issueCount: affected[page.path] ?? 0 },
      })),
    [pages, selectedId, affected, compact],
  );
  const edges = useMemo(
    () =>
      pages.flatMap((page) =>
        page.linksTo.map((target) => ({
          id: `${page.id}-${target}`,
          source: page.id,
          target,
          type: "smoothstep",
          style: {
            stroke:
              pages.find((item) => item.id === target)?.statusCode === 404
                ? "#b5473d"
                : page.id === selectedId || target === selectedId
                  ? "#2458a6"
                  : "#bac4cd",
            strokeWidth: page.id === selectedId || target === selectedId ? 2 : 1,
            strokeDasharray:
              pages.find((item) => item.id === target)?.statusCode === 404 ? "4 4" : undefined,
          },
        })),
      ),
    [pages, selectedId],
  );
  return (
    <div className="site-graph-wrap">
      <div className={`site-graph ${expanded ? "expanded" : ""}`} data-testid="site-graph">
        <ReactFlow
          key={compact ? "compact" : "wide"}
          style={{ height: compact ? "calc(100% - 28px)" : "100%" }}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onNodesChange={(changes) => {
            const selection = changes.find((change) => change.type === "select" && change.selected);
            if (selection?.type === "select") setSelectedId(selection.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          edgesFocusable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          colorMode="light"
          aria-label={
            source === "live" ? "Interactive live document map" : "Interactive example site map"
          }
          ariaLabelConfig={{
            "node.a11yDescription.default":
              "Press Enter or Space to inspect this route. Use the route selector below the map as an alternative. Routes cannot be edited or deleted.",
          }}
        >
          <Background color="#d7dcdf" gap={19} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
        <div className="graph-legend">
          <span>
            <i className="legend-dot green" />
            200 response
          </span>
          <span>
            <i className="legend-dot coral" />
            404 response
          </span>
        </div>
      </div>
      <div className="graph-inspector">
        <div>
          <label htmlFor={expanded ? "route-select-full" : "route-select"}>Inspect route</label>
          <select
            id={expanded ? "route-select-full" : "route-select"}
            aria-label="INSPECT ROUTE"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.path}
              </option>
            ))}
          </select>
        </div>
        <div className="route-context" aria-live="polite">
          <h3>{selected?.title}</h3>
          <p className={selected && selected.statusCode >= 400 ? "route-failure" : ""}>
            {selected?.statusCode} response <span>· {selected?.durationMs} ms</span>
          </p>
          <p className="route-context-label">Related findings</p>
          {findings
            .filter((finding) => finding.affectedPaths.includes(selected?.path ?? ""))
            .map((finding) => (
              <button type="button" key={finding.id} onClick={() => onFinding?.(finding.id)}>
                <code>{finding.id}</code>
                <span>{finding.title} ↗</span>
              </button>
            ))}
          {!affected[selected?.path ?? ""] && (
            <p className="route-context-empty">
              No findings in this {source === "live" ? "sample" : "fixture"}. This is not a complete
              health assessment.
            </p>
          )}
          <small>Observed route data · {source === "live" ? "Live" : "Fixture"}</small>
        </div>
      </div>
    </div>
  );
}
