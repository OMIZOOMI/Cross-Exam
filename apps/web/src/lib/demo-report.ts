import { type Evidence, type Finding, type Page, ScanReportSchema } from "@crossexam/contracts";

// Hand-authored synthetic data. No request has ever been made to this reserved domain.
const scanId = "fixture-scan-001";
const targetUrl = "https://acme.example";
const capturedAt = "2026-09-30T10:24:00.000Z";

const pages: Page[] = [
  {
    id: "home",
    path: "/",
    title: "Home",
    statusCode: 200,
    durationMs: 320,
    linksTo: ["work", "studio", "journal", "contact"],
  },
  {
    id: "work",
    path: "/work",
    title: "Selected work",
    statusCode: 200,
    durationMs: 480,
    linksTo: ["atlas"],
  },
  {
    id: "studio",
    path: "/studio",
    title: "The studio",
    statusCode: 200,
    durationMs: 280,
    linksTo: ["contact"],
  },
  {
    id: "journal",
    path: "/journal",
    title: "Journal",
    statusCode: 200,
    durationMs: 610,
    linksTo: ["design", "legacy"],
  },
  {
    id: "contact",
    path: "/contact",
    title: "Contact",
    statusCode: 200,
    durationMs: 210,
    linksTo: [],
  },
  {
    id: "atlas",
    path: "/work/atlas",
    title: "Atlas project",
    statusCode: 200,
    durationMs: 540,
    linksTo: [],
  },
  {
    id: "design",
    path: "/journal/design-systems",
    title: "Design systems",
    statusCode: 200,
    durationMs: 390,
    linksTo: [],
  },
  {
    id: "legacy",
    path: "/journal/old-playbook",
    title: "Old playbook",
    statusCode: 404,
    durationMs: 180,
    linksTo: [],
  },
];

function evidence(
  id: string,
  kind: Evidence["kind"],
  path: string,
  title: string,
  detail: string,
): Evidence {
  return {
    id,
    scanId,
    source: "fixture",
    provenance: "OBSERVED",
    kind,
    url: `${targetUrl}${path}`,
    capturedAt,
    title,
    detail,
    collector: `fixture/${kind}-v1`,
  };
}

const evidenceItems: Evidence[] = [
  evidence(
    "E-001",
    "performance",
    "/",
    "Largest contentful paint: 4.3 s",
    "Synthetic desktop run A: LCP 4,300 ms. Viewport 1440 × 900, cold cache, no throttling. The largest painted element is the hero image.",
  ),
  evidence(
    "E-002",
    "performance",
    "/",
    "Repeated largest contentful paint: 4.1 s",
    "Synthetic desktop run B under the same conditions: LCP 4,100 ms. Median of runs A and B is 4,200 ms. This is lab data, not field data.",
  ),
  evidence(
    "E-003",
    "network",
    "/journal/old-playbook",
    "Internal destination returned HTTP 404",
    "Synthetic GET /journal/old-playbook → 404. Discovered from an anchor on /journal. Response content type: text/html.",
  ),
  evidence(
    "E-004",
    "network",
    "/journal/old-playbook",
    "Repeated destination returned HTTP 404",
    "Second synthetic unauthenticated GET to the same URL → 404. No redirect was present in this example.",
  ),
  evidence(
    "E-005",
    "accessibility",
    "/work",
    "Three project images have no alternative text",
    "Synthetic DOM observation: three img elements inside project links have no alt attribute. Selector: main .project-card img.",
  ),
  evidence(
    "E-006",
    "accessibility",
    "/work",
    "Image links have no accessible names",
    "Synthetic accessibility-tree inspection: three image-only links expose no accessible name. No aria-label, labelledby, or visible text supplies a name.",
  ),
  evidence(
    "E-007",
    "metadata",
    "/studio",
    "Meta description is missing",
    'Synthetic DOM observation: document.head has no meta[name="description"]. Search appearance has not been tested.',
  ),
  evidence(
    "E-008",
    "metadata",
    "/contact",
    "Second meta description is missing",
    'Synthetic DOM observation: /contact has no meta[name="description"]. Its page title is present and unique.',
  ),
  evidence(
    "E-009",
    "network",
    "/",
    "680 KB of transferred JavaScript",
    "Synthetic network entries total 680 KB of JavaScript transfer on /. The main bundle accounts for 410 KB. Transfer size alone does not establish an LCP cause.",
  ),
  evidence(
    "E-010",
    "performance",
    "/",
    "No isolated JavaScript experiment",
    "Synthetic trace shows script activity before the hero paint, but has no controlled comparison with scripts removed. A causal relationship is unverified.",
  ),
  evidence(
    "E-011",
    "navigation",
    "/",
    "Eight routes mapped",
    "Synthetic navigation response times in ms: / 320; /work 480; /studio 280; /journal 610; /contact 210; /work/atlas 540; /journal/design-systems 390; /journal/old-playbook 180.",
  ),
  evidence(
    "E-012",
    "headers",
    "/",
    "Content type protection header present",
    "Synthetic response: x-content-type-options: nosniff. This narrow header observation is not a security certification.",
  ),
];

const findings: Finding[] = [
  {
    id: "F-001",
    claimId: "C-001",
    verdictId: "V-001",
    title: "The first impression takes 4.2 seconds",
    description:
      "The homepage hero paints late in both example runs. Visitors wait for the most prominent content to appear.",
    category: "Performance",
    severity: "high",
    provenance: "DERIVED",
    evidenceIds: ["E-001", "E-002"],
    affectedPaths: ["/"],
    recommendation:
      "Investigate the hero image request and render timing. Resize and compress the image, then consider prioritizing its request if the trace supports that change.",
    verification:
      "Repeat two cold-cache runs under the same conditions. Compare LCP and its element; do not promise a score improvement from this fixture.",
  },
  {
    id: "F-002",
    claimId: "C-002",
    verdictId: "V-002",
    title: "A journal link leads to a dead end",
    description:
      "The old playbook is still linked from the journal, but its destination returns 404 on both example requests.",
    category: "Navigation",
    severity: "high",
    provenance: "OBSERVED",
    evidenceIds: ["E-003", "E-004"],
    affectedPaths: ["/journal", "/journal/old-playbook"],
    recommendation:
      "Update the journal link to a relevant existing article, or restore the intended destination. Add a redirect only when there is an equivalent replacement.",
    verification:
      "Follow the updated link and confirm a relevant destination returns 200 without a redirect loop.",
  },
  {
    id: "F-003",
    claimId: "C-003",
    verdictId: "V-003",
    title: "Three project links have no accessible name",
    description:
      "Image-only links on the work page provide no label in the example accessibility tree.",
    category: "Accessibility",
    severity: "medium",
    provenance: "OBSERVED",
    evidenceIds: ["E-005", "E-006"],
    affectedPaths: ["/work"],
    recommendation:
      "Give each project link a descriptive accessible name, preferably through meaningful visible text or appropriate image alternative text.",
    verification:
      "Inspect each link in the accessibility tree and navigate the project list using a keyboard and screen reader.",
  },
  {
    id: "F-004",
    claimId: "C-004",
    verdictId: "V-004",
    title: "Two pages may need better search previews",
    description:
      "Descriptions are absent on studio and contact. Any effect on search snippets or click-through is unverified.",
    category: "Metadata",
    severity: "low",
    provenance: "INFERRED",
    evidenceIds: ["E-007", "E-008"],
    affectedPaths: ["/studio", "/contact"],
    recommendation:
      "Consider unique, concise descriptions that reflect each page. Treat any search visibility benefit as a hypothesis.",
    verification:
      "Check the rendered head after the change. Actual search snippet selection requires separate observation over time.",
  },
  {
    id: "F-005",
    claimId: "C-005",
    verdictId: "V-005",
    title: "Is JavaScript delaying the hero?",
    description:
      "A large script payload and a late hero paint occur together. The example evidence cannot establish that one caused the other.",
    category: "Performance",
    severity: "medium",
    provenance: "INFERRED",
    evidenceIds: ["E-009", "E-010"],
    affectedPaths: ["/"],
    recommendation:
      "Profile main-thread work and image discovery before changing bundles. Use a controlled local comparison to isolate any script contribution.",
    verification:
      "Compare equivalent local builds with one controlled change; record timings and reject the hypothesis if the result does not reproduce.",
  },
];

export const demoReport = ScanReportSchema.parse({
  schemaVersion: 2,
  summary: {
    id: scanId,
    source: "fixture",
    targetUrl,
    status: "completed",
    startedAt: capturedAt,
    durationMs: 48600,
    pageCount: pages.length,
    evidenceCount: evidenceItems.length,
    findingCount: findings.length,
  },
  pages,
  evidence: evidenceItems,
  findings,
  metrics: [
    {
      id: "M-001",
      label: "Largest contentful paint",
      value: 4.2,
      unit: "s",
      provenance: "DERIVED",
      evidenceIds: ["E-001", "E-002"],
    },
    {
      id: "M-002",
      label: "JavaScript transferred",
      value: 680,
      unit: "KB",
      provenance: "DERIVED",
      evidenceIds: ["E-009"],
    },
  ],
  tribunalRuns: [],
  claims: findings.map((item) => ({
    id: item.claimId,
    scanId,
    statement: item.title,
    provenance: item.provenance,
    evidenceIds: item.evidenceIds,
    proposedBy: "Explorer",
    scope: {
      observation: "Simulated demonstration conditions.",
      conditions: [],
      limitations: ["Fixture demonstration only."],
    },
    falsifier:
      "Collect independent evidence under the same conditions that contradicts this example.",
    createdAt: capturedAt,
    status: "proposed",
  })),
  challenges: findings.map((item, index) => ({
    id: `CH-00${index + 1}`,
    claimId: item.claimId,
    raisedBy: index % 2 ? "Breaker" : "Skeptic",
    scanId,
    createdAt: capturedAt,
    provenance: "SIMULATED",
    category: "collection-limitation",
    question: [
      "Does this repeat under the same conditions?",
      "Was the 404 a transient failure?",
      "Does another element supply the accessible name?",
      "Is there evidence that the missing descriptions changed search results?",
      "Does the script payload cause the delay, or merely coincide with it?",
    ][index],
    evidenceIds: item.evidenceIds,
    status: index < 3 ? "addressed" : "open",
  })),
  experiments: findings.map((item, index) => ({
    id: `X-00${index + 1}`,
    claimId: item.claimId,
    challengeId: `CH-00${index + 1}`,
    method: item.verification,
    safety: "non-destructive",
    status: index < 3 ? "completed" : "planned",
    evidenceIds: index < 3 ? item.evidenceIds : [],
  })),
  verdicts: findings.map((item, index) => ({
    id: item.verdictId,
    claimId: item.claimId,
    status: index < 3 ? "confirmed" : index === 3 ? "insufficient-evidence" : "contested",
    rationale: [
      "Two example runs reproduce the late paint; this verdict covers these lab conditions only.",
      "Two example requests return 404 for the linked destination.",
      "The example DOM and accessibility tree agree that link names are missing.",
      "Missing descriptions are visible, but the proposed search impact has not been measured.",
      "Correlation does not establish causation. A controlled experiment is still needed.",
    ][index],
    evidenceIds: item.evidenceIds,
    experimentIds: [`X-00${index + 1}`],
    decidedBy: "Judge",
  })),
  agentRuns: [
    {
      id: "A-001",
      role: "Explorer",
      elapsedMs: 4200,
      status: "completed",
      summary: "Mapped 8 routes. Put 5 claims on the record.",
      claimIds: findings.map((item) => item.claimId),
    },
    {
      id: "A-002",
      role: "Breaker",
      elapsedMs: 12800,
      status: "completed",
      summary: "Challenged the broken link and search impact.",
      claimIds: ["C-002", "C-004"],
    },
    {
      id: "A-003",
      role: "Skeptic",
      elapsedMs: 21400,
      status: "completed",
      summary: "Contested the JavaScript → LCP causal leap.",
      claimIds: ["C-001", "C-003", "C-005"],
    },
    {
      id: "A-004",
      role: "Reproducer",
      elapsedMs: 38200,
      status: "completed",
      summary: "Example checks reproduced 3 narrow claims.",
      claimIds: ["C-001", "C-002", "C-003"],
    },
    {
      id: "A-005",
      role: "Judge",
      elapsedMs: 48600,
      status: "completed",
      summary: "3 confirmed. 1 contested. 1 needs evidence.",
      claimIds: findings.map((item) => item.claimId),
    },
  ],
});
