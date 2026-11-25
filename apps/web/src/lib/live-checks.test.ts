import type { ScanReport } from "@crossexam/contracts";
import { expect, it } from "vitest";
import { liveReportFixture } from "../../../../tests/fixtures/live-report";
import { compareScans, liveChecks, plainFinding } from "./live-checks";

it("keeps check numbers stable across groups and separates errors from missing information", () => {
  const report = liveReportFixture("test-report");
  const evidence = report.evidence[0];
  if (!evidence) throw new Error("Missing fixture evidence");
  report.evidence.push(
    {
      ...evidence,
      id: "E-004",
      code: "FETCH_FAILURE",
      url: "https://example.com/timeout",
      data: { outcome: "not-collected" },
    },
    {
      ...evidence,
      id: "E-005",
      code: "SITEMAP_XML",
      url: "https://example.com/sitemap.xml",
      data: { statusCode: 404, exists: false },
    },
    {
      ...evidence,
      id: "E-006",
      code: "ROBOTS_TXT",
      url: "https://example.com/robots.txt",
      data: { statusCode: 200, exists: true },
    },
    { ...evidence, id: "E-007", provenance: "SIMULATED" },
  );
  expect(liveChecks(report).map(({ number, state }) => [number, state])).toEqual([
    [1, "passed"],
    [2, "failed"],
    [3, "passed"],
    [4, "unchecked"],
    [5, "passed"],
    [6, "unchecked"],
  ]);
});

it("names a linking page only when the site map recorded a connection", () => {
  const report = liveReportFixture("test-report");
  const finding = report.findings[0];
  const home = report.pages[0];
  if (!finding || !home) throw new Error("Missing fixture finding or page");
  expect(plainFinding(report, finding).result).toContain("from the homepage led to /broken");
  expect(plainFinding(report, finding)).toMatchObject({
    brokenLink: { pagesToEdit: ["Homepage"], missingAddress: "/broken" },
    next: "On your homepage, update the link that points to /broken.",
  });
  report.pages.push({ ...home, path: "/about", id: "P-3" });
  expect(plainFinding(report, finding)).toMatchObject({
    brokenLink: { pagesToEdit: ["Homepage", "/about"], missingAddress: "/broken" },
    next: "Update the link that points to /broken on these pages: Homepage, /about.",
  });
  report.pages.pop();
  home.linksTo = [];
  expect(plainFinding(report, finding).result).toBe(
    "The website said /broken couldn’t be found (404).",
  );
});

function observeLinks(
  report: ScanReport,
  links: string[],
  internalLinkCount = links.length,
  source = "/",
) {
  const evidence = report.evidence[0];
  if (!evidence) throw new Error("Missing homepage evidence");
  report.evidence.push({
    ...evidence,
    id: `E-${report.evidence.length + 1}`,
    url: `https://example.com${source}`,
    code: "DOCUMENT_STRUCTURE",
    data: { internalLinks: links.map((path) => `https://example.com${path}`), internalLinkCount },
  });
}

it("names the actual link to edit and the failing destination separately after a redirect", () => {
  const report = liveReportFixture("redirect");
  const [, broken] = report.pages;
  const response = report.evidence[1];
  const finding = report.findings[0];
  if (!broken || !response || !finding) throw new Error("Missing broken link");
  broken.requestedUrl = "https://example.com/old-address";
  response.url = broken.requestedUrl;
  observeLinks(report, ["/old-address"]);
  expect(plainFinding(report, finding)).toMatchObject({
    title: "Missing page: /broken",
    next: "On your homepage, update the link to /old-address.",
    brokenLink: {
      missingAddress: "/broken",
      redirected: true,
      editLinks: [{ page: "Homepage", address: "/old-address" }],
    },
  });
});

function repeatReports() {
  const prior = liveReportFixture("first-scan");
  observeLinks(prior, ["/broken"]);
  const report = liveReportFixture("second-scan");
  report.summary.startedAt = "2026-10-01T11:00:00.000Z";
  return { prior, report };
}

it.each([
  {
    change: "replacement",
    path: "/pricing",
    links: ["/pricing"],
    detail:
      "Your homepage no longer links to /broken. It now links to /pricing, which responded successfully.",
  },
  {
    change: "original page restored",
    path: "/broken",
    links: ["/broken"],
    detail: "/broken now responds successfully.",
  },
])("describes an observed $change", ({ path, links, detail }) => {
  const { prior, report } = repeatReports();
  const response = report.evidence[1];
  if (!response) throw new Error("Missing page evidence");
  response.url = `https://example.com${path}`;
  response.data = { statusCode: 200, finalUrl: response.url };
  report.findings = [];
  observeLinks(report, links);
  expect(compareScans(prior, report)).toEqual({
    previousId: "first-scan",
    headline: "1 problem fixed · No problems flagged now",
    details: [detail],
  });
});

it("reports removal with no replacement when the homepage’s complete link list shows it", () => {
  const { prior, report } = repeatReports();
  report.findings = [];
  report.pages.pop();
  report.evidence.splice(1, 1);
  observeLinks(report, []);
  expect(compareScans(prior, report)?.details).toEqual([
    "Your homepage no longer links to /broken.",
  ]);
});

it("recognizes the same problem even when its internal ID changes", () => {
  const { prior, report } = repeatReports();
  const problem = report.findings[0];
  if (!problem) throw new Error("Missing problem");
  problem.id = "F-999";
  expect(compareScans(prior, report)).toMatchObject({
    headline: "Still 1 problem flagged",
    details: [],
  });
});

it("reports one repaired link even while a different page still links to the same 404", () => {
  const { prior, report } = repeatReports();
  for (const scan of [prior, report]) {
    const home = scan.pages[0];
    if (!home) throw new Error("Missing homepage");
    scan.pages.push({ ...home, id: "P-3", path: "/about", finalUrl: "https://example.com/about" });
    observeLinks(scan, ["/broken"], 1, "/about");
  }
  observeLinks(report, []);
  expect(compareScans(prior, report)).toMatchObject({
    headline: "Still 1 problem flagged",
    details: ["Your homepage no longer links to /broken.", "Still needs attention: /about."],
  });
});

it("counts a new problem by its page and rule", () => {
  const { prior, report } = repeatReports();
  prior.findings = [];
  expect(compareScans(prior, report)?.headline).toBe("1 new problem flagged");
});

it("does not call an absent problem fixed when the newer link list is incomplete", () => {
  const { prior, report } = repeatReports();
  report.findings = [];
  observeLinks(report, [], 42);
  expect(compareScans(prior, report)).toMatchObject({
    headline: "No problems flagged now",
    details: ["Some earlier problems couldn’t be verified in this scan."],
  });
});

it("does not compare reports from different targets or compare in reverse order", () => {
  const { prior, report } = repeatReports();
  expect(compareScans(report, prior)).toBeUndefined();
  report.summary.targetUrl = "https://example.org/";
  expect(compareScans(prior, report)).toBeUndefined();
});
