import type { ScanReport } from "@crossexam/contracts";
import { type LiveCheck, liveChecks, pageLabel, plainFinding } from "../lib/live-checks";

const groups = [
  { state: "failed", label: "Failed" },
  { state: "passed", label: "Passed" },
  { state: "unchecked", label: "Couldn’t check" },
] as const;

export function LiveCheckGroups({
  checks,
  onEvidence,
  showPage = true,
}: {
  checks: LiveCheck[];
  onEvidence?: (id: string) => void;
  showPage?: boolean;
}) {
  if (!checks.length) return <p>There are no recorded page checks to show.</p>;
  return groups.map(({ state, label }) => {
    const entries = checks.filter((check) => check.state === state);
    if (!entries.length) return null;
    return (
      <details className={`live-check-group live-check-${state}`} key={state}>
        <summary>{`${label} · ${entries.length} ${entries.length === 1 ? "check" : "checks"}`}</summary>
        <ol className="live-check-list">
          {entries.map((check) => (
            <li key={check.id} value={check.number}>
              <strong>{check.question}</strong>
              {showPage && <p>Page: {pageLabel(check.path)}</p>}
              <p>
                <strong>Result</strong> {check.result}
              </p>
              {onEvidence && (
                <button type="button" className="text-link" onClick={() => onEvidence(check.id)}>
                  Show evidence for Check {check.number}
                </button>
              )}
            </li>
          ))}
        </ol>
      </details>
    );
  });
}

export function LiveChecks({
  report,
  onFinding,
  onEvidence,
}: {
  report: ScanReport;
  onFinding: (id: string) => void;
  onEvidence: (id: string) => void;
}) {
  const checks = liveChecks(report);
  const partial = report.summary.status === "partial";

  return (
    <div className="live-checks">
      <section aria-labelledby="live-attention">
        <h2 id="live-attention">What needs attention</h2>
        {report.findings.length ? (
          <ol className="live-check-list">
            {report.findings.map((finding, index) => {
              const plain = plainFinding(report, finding);
              return (
                <li key={finding.id} className="live-check-issue">
                  <h3>{plain.title}</h3>
                  {plain.brokenLink ? (
                    <>
                      {plain.brokenLink.pagesToEdit.length ? (
                        <p>
                          <strong>
                            {plain.brokenLink.pagesToEdit.length === 1
                              ? "Page to edit:"
                              : "Pages to edit:"}
                          </strong>{" "}
                          {plain.brokenLink.pagesToEdit.join(", ")}
                        </p>
                      ) : (
                        <p>
                          <strong>Missing page</strong>
                        </p>
                      )}
                      <p>
                        <strong>
                          {plain.brokenLink.redirected ? "Redirect failed at:" : "Missing address:"}
                        </strong>{" "}
                        {plain.brokenLink.missingAddress}
                      </p>
                      {plain.brokenLink.editLinks.map(({ page, address }) => (
                        <p key={JSON.stringify([page, address])}>
                          <strong>Link to edit:</strong> {address} on {page}
                        </p>
                      ))}
                    </>
                  ) : (
                    <p>
                      <strong>Where:</strong> {finding.affectedPaths.map(pageLabel).join(", ")}
                    </p>
                  )}
                  <p>
                    <strong>What happened</strong> {plain.result}
                  </p>
                  <p>
                    <strong>What to do next</strong> {plain.next}
                  </p>
                  <button type="button" className="text-link" onClick={() => onFinding(finding.id)}>
                    See details for Problem {index + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p>No problems were flagged on the pages Veyra checked.</p>
        )}
      </section>
      <section aria-labelledby="live-check-results">
        <h2 id="live-check-results">Check results</h2>
        <p>
          Passed means this check raised no problem in this scan. Veyra checked the responses and
          page source it received.
        </p>
        {partial && (
          <p className="live-check-scope">
            <strong>Some checks could not be completed.</strong> This report covers the information
            Veyra was able to collect.
          </p>
        )}
        <LiveCheckGroups checks={checks} onEvidence={onEvidence} />
      </section>
    </div>
  );
}
