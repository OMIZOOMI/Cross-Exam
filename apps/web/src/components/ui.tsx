import { Crosshair } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "compact" : ""}`} href="/" aria-label="CrossExam home">
      <span className="brand-symbol">
        <Crosshair size={23} strokeWidth={1.7} />
      </span>
      <span>
        Cross<span className="brand-light">Exam</span>
        <span className="brand-period">.</span>
      </span>
    </Link>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ProvenanceBadge({ value }: { value: string }) {
  return (
    <span className={`provenance provenance-${value.toLowerCase()}`}>
      <span className="provenance-dot" />
      {value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
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
