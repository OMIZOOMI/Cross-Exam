import type { ScanReport } from "@crossexam/contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { provenanceMeanings } from "../lib/presentation";

export function VeyraWordmark() {
  return (
    <>
      <span className="brand-mark" aria-hidden="true">
        V
      </span>
      <span className="brand-name">VEYRA</span>
    </>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "compact" : ""}`} href="/" aria-label="Veyra home">
      <span>
        Veyra<span className="brand-period">.</span>
      </span>
    </Link>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const plainProvenanceLabels: Record<string, string> = {
  OBSERVED: "Recorded",
  DERIVED: "Calculated",
  INFERRED: "Interpretation",
  SIMULATED: "Example",
};

export function ProvenanceBadge({ value, plain = false }: { value: string; plain?: boolean }) {
  return (
    <span
      className={`provenance provenance-${value.toLowerCase()}`}
      title={provenanceMeanings[value]}
    >
      <span className="provenance-dot" />
      {plain && plainProvenanceLabels[value]
        ? plainProvenanceLabels[value]
        : value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
  );
}

export function ProvenanceKey({ liveReport }: { liveReport?: ScanReport } = {}) {
  return (
    <details className="provenance-key">
      <summary>{liveReport ? "How Veyra knows" : "How to read provenance"}</summary>
      <dl>
        {Object.entries(provenanceMeanings).map(([label, meaning]) => (
          <div key={label}>
            <dt>
              <ProvenanceBadge value={label} />
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
      <p>
        Source is separate: a synthetic demo’s OBSERVED label does not make it a live observation.
      </p>
      {liveReport && (
        <p>
          Report ID: <code>{liveReport.summary.id}</code> · ScanReport v{liveReport.schemaVersion}
        </p>
      )}
    </details>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
