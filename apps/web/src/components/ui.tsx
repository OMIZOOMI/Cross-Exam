import Link from "next/link";
import type { ReactNode } from "react";
import { provenanceMeanings } from "../lib/presentation";

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

export function ProvenanceBadge({ value }: { value: string }) {
  return (
    <span
      className={`provenance provenance-${value.toLowerCase()}`}
      title={provenanceMeanings[value]}
    >
      <span className="provenance-dot" />
      {value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
  );
}

export function ProvenanceKey() {
  return (
    <details className="provenance-key">
      <summary>How to read provenance</summary>
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
