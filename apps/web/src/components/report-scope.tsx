import type { ScanReport } from "@crossexam/contracts";

export function ReportScope({
  report,
  onEvidence,
}: {
  report: ScanReport;
  onEvidence: (id: string) => void;
}) {
  const live = report.summary.source === "live";
  return (
    <section className="collection-scope" aria-label="Collection layers and limits">
      <div>
        <strong>Collection scope</strong>
        <p>{live ? "HTTP / returned HTML only" : "Synthetic demonstration only"}</p>
      </div>
      {["performance", "accessibility"].map((kind) => {
        const records = report.evidence.filter((item) => item.kind === kind);
        return (
          <details key={kind}>
            <summary>
              {kind === "performance" ? "Performance" : "Accessibility"}{" "}
              <span>{records.length ? `${records.length} records` : "Not measured"}</span>
            </summary>
            <p>
              {live
                ? kind === "performance"
                  ? "Document fetch times are not browser rendering or field performance. LCP, CLS and JavaScript execution were not measured."
                  : "Returned-HTML observations are not a rendered accessibility audit or compliance certification. No axe or browser was run."
                : "These are synthetic example records, not measurements from this website. No real browser or accessibility audit ran."}
            </p>
            {records.map((record) => (
              <button
                type="button"
                className="text-link"
                key={record.id}
                onClick={() => onEvidence(record.id)}
              >
                {record.id} · {record.title} ↗
              </button>
            ))}
          </details>
        );
      })}
      {live && report.summary.status === "partial" && (
        <p className="collection-partial">
          Partial coverage — missing pages are not a clean bill of health. Review collection notes
          below.
        </p>
      )}
    </section>
  );
}
