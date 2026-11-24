import type { Evidence, Finding, Page, ScanReport } from "@crossexam/contracts";

type CheckState = "failed" | "passed" | "unchecked";
type Observation = { question: string; result: string; state?: CheckState };
export type LiveCheck = {
  id: string;
  number: number;
  path: string;
  question: string;
  result: string;
  state: CheckState;
};

function describe(evidence: Evidence): Observation | undefined {
  const data = evidence.data ?? {};
  const path = new URL(evidence.url).pathname;
  const unchecked = (question: string, result: string): Observation => ({
    question,
    result,
    state: "unchecked",
  });
  switch (evidence.code) {
    case "HTTP_STATUS": {
      const status = data.statusCode;
      const question = "Did the page respond successfully?";
      if (status === 404)
        return {
          question,
          result: "The website said this page could not be found (404).",
          state: "failed",
        };
      if (typeof status === "number" && status >= 400)
        return { question, result: `The website returned an error (${status}).`, state: "failed" };
      if (typeof status === "number" && status >= 200 && status < 300)
        return { question, result: `The website returned a successful response (${status}).` };
      return unchecked(question, "Veyra did not record a successful response for this page.");
    }
    case "RESPONSE_HEADERS":
      if (!Object.hasOwn(data, "content-security-policy"))
        return unchecked(
          "What instructions did the website send with the page?",
          "Veyra did not record the instructions it checked for this page.",
        );
      return {
        question: "What instructions did the website send with the page?",
        result: data["content-security-policy"]
          ? "The page came with rules for what browsers can load."
          : "The response did not include rules for what browsers can load.",
      };
    case "DOCUMENT_METADATA":
      if (typeof data.title !== "string" || typeof data.description !== "string")
        return unchecked(
          "What title and description did the page provide?",
          "Veyra did not record enough information to answer this check.",
        );
      return {
        question: "What title and description did the page provide?",
        result: [
          typeof data.title === "string" && data.title
            ? `Title: “${data.title}”.`
            : "No title was recorded.",
          typeof data.description === "string" && data.description
            ? "The page provided a description."
            : "No description was recorded.",
        ].join(" "),
      };
    case "DOCUMENT_STRUCTURE":
      if (typeof data.internalLinkCount !== "number")
        return unchecked(
          "What links did Veyra find on the page?",
          "Veyra did not record a link count for this page.",
        );
      return {
        question: "What links did Veyra find on the page?",
        result:
          typeof data.internalLinkCount === "number"
            ? `Veyra found ${data.internalLinkCount} ${data.internalLinkCount === 1 ? "link" : "links"} to pages on this site. It also checked the page’s structure and image descriptions.`
            : "Veyra recorded the page’s structure.",
      };
    case "RESOURCE_REFERENCES":
      if (!Array.isArray(data.urls))
        return unchecked(
          "Did the page point to extra files?",
          "Veyra did not record a list of extra files for this page.",
        );
      return {
        question: "Did the page point to extra files?",
        result:
          Array.isArray(data.urls) && data.urls.length
            ? "The page listed extra files. Veyra recorded their addresses."
            : "No extra file addresses were recorded.",
      };
    case "ROBOTS_TXT":
    case "SITEMAP_XML": {
      const robots = evidence.code === "ROBOTS_TXT";
      const question = robots
        ? "Did the website provide instructions for tools like Veyra?"
        : "Was a list of pages available at the usual address?";
      if (data.statusCode === 404 || data.statusCode === 410)
        return {
          question,
          result: `There was no file at ${path}. Websites can leave this file out.`,
        };
      if (
        data.statusCode === 200 &&
        (robots
          ? Array.isArray(data.disallowRules) && data.exceeded === false
          : typeof data.kind === "string")
      )
        return {
          question,
          result: robots
            ? "Veyra read the website’s instructions about which pages to check."
            : "Veyra read the website’s sitemap.",
        };
      return unchecked(question, `Veyra could not read usable information from ${path}.`);
    }
    case "FETCH_FAILURE":
      return unchecked(
        "Could Veyra check this page?",
        "The request did not give Veyra a response it could use. Try again later and check whether the page opens for you.",
      );
    default:
      return undefined;
  }
}

function liveObservation(evidence: Evidence) {
  if (evidence.source !== "live" || evidence.provenance !== "OBSERVED") return undefined;
  return describe(evidence);
}

export function liveEvidenceLabel(report: ScanReport, id: string) {
  const index = report.evidence.findIndex((item) => item.id === id);
  const item = report.evidence[index];
  if (!item) return "Observation";
  return `${liveObservation(item) ? "Check" : "Observation"} ${index + 1}`;
}

export function liveChecks(report: ScanReport): LiveCheck[] {
  const findings = new Map<string, Finding[]>();
  for (const finding of report.findings)
    for (const id of finding.evidenceIds) {
      const linked = findings.get(id) ?? [];
      linked.push(finding);
      findings.set(id, linked);
    }
  return report.evidence.flatMap((evidence, index) => {
    const observation = liveObservation(evidence);
    if (!observation) return [];
    const linked = findings.get(evidence.id);
    return [
      {
        ...observation,
        result:
          linked && observation.state !== "failed"
            ? linked.map((finding) => plainFinding(report, finding).result).join(" ")
            : observation.result,
        id: evidence.id,
        number: index + 1,
        path: new URL(evidence.url).pathname,
        state: findings.has(evidence.id)
          ? ("failed" as const)
          : (observation.state ?? ("passed" as const)),
      },
    ];
  });
}

export function pageLabel(path: string) {
  return path === "/" ? "Homepage" : path;
}

function observed(item: Evidence) {
  return item.source === "live" && item.provenance === "OBSERVED";
}

function pageAddress(report: ScanReport, page: Page) {
  return (
    page.finalUrl ??
    new URL(page.path, report.investigation?.finalOrigin ?? report.summary.targetUrl).href
  );
}

function brokenPage(report: ScanReport, finding: Finding) {
  return report.pages.find(
    (item) =>
      item.statusCode === 404 &&
      finding.affectedPaths.includes(item.path) &&
      report.evidence.some(
        (evidence) =>
          observed(evidence) &&
          finding.evidenceIds.includes(evidence.id) &&
          evidence.code === "HTTP_STATUS" &&
          evidence.data?.statusCode === 404 &&
          (evidence.data.finalUrl ?? evidence.url) === pageAddress(report, item),
      ),
  );
}

function linkingPages(report: ScanReport, page: Page) {
  return report.pages.filter((item) => item.linksTo.includes(page.id));
}

export function plainFinding(report: ScanReport, finding: Finding) {
  const page = brokenPage(report, finding);
  if (page) {
    const sources = linkingPages(report, page);
    const pagesToEdit = [...new Set(sources.map(({ path }) => pageLabel(path)))];
    const firstSource = sources[0];
    const missingAddress = pageLabel(page.path);
    const result = `The website said ${missingAddress} couldn’t be found (404).`;
    return {
      title: "A page couldn’t be found",
      result: firstSource
        ? `Following a link from ${firstSource.path === "/" ? "the homepage" : pageLabel(firstSource.path)} led to ${missingAddress}. ${result}`
        : result,
      next:
        pagesToEdit.length > 1
          ? `Update the link that points to ${missingAddress} on these pages: ${pagesToEdit.join(", ")}.`
          : firstSource
            ? `On ${firstSource.path === "/" ? "your homepage" : pageLabel(firstSource.path)}, update the link that points to ${missingAddress}.`
            : "Check whether this page should exist or should send visitors to a new address.",
      brokenLink: { pagesToEdit, missingAddress },
    };
  }
  if (finding.title === "No Content-Security-Policy response header")
    return {
      title: "The page didn’t send browser loading rules",
      result: "The website’s response did not include rules for what browsers can load.",
      next: "Ask whoever maintains the site whether it needs these rules.",
    };
  if (finding.title === "Meta description is missing")
    return {
      title: "The page has no short description",
      result: "Veyra found no short description in the page source.",
      next: "Add a short description that tells people what the page is about.",
    };
  return { title: finding.title, result: finding.description, next: finding.recommendation };
}

export type ScanComparison = {
  previousId: string;
  headline: string;
  details: string[];
};

function recordedLinks(report: ScanReport, address: string) {
  const data = report.evidence.find(
    (item) => observed(item) && item.code === "DOCUMENT_STRUCTURE" && item.url === address,
  )?.data;
  const links = data?.internalLinks;
  // A capped or deduplicated list cannot establish that an address is absent.
  if (!Array.isArray(links) || data?.internalLinkCount !== links.length) return undefined;
  return links;
}

function respondedSuccessfully(report: ScanReport, address: string) {
  return report.evidence.some(
    (item) =>
      observed(item) &&
      item.code === "HTTP_STATUS" &&
      item.url === address &&
      item.data?.statusCode === 200 &&
      (item.data.finalUrl ?? item.url) === address,
  );
}

function resolvedBrokenLink(prior: ScanReport, report: ScanReport, page: Page) {
  const address = page.requestedUrl ?? pageAddress(prior, page);
  const missing = pageLabel(new URL(address).pathname);
  if (respondedSuccessfully(report, address)) return [`${missing} now responds successfully.`];

  const sources = linkingPages(prior, page);
  if (!sources.length) return [];
  const details: string[] = [];
  for (const source of sources) {
    const sourceAddress = pageAddress(prior, source);
    const before = recordedLinks(prior, sourceAddress);
    const after = recordedLinks(report, sourceAddress);
    if (!before?.includes(address) || !after || after.includes(address)) return [];

    const name = source.path === "/" ? "Your homepage" : pageLabel(source.path);
    const added = after.filter(
      (link): link is string => typeof link === "string" && !before.includes(link),
    );
    let detail = `${name} no longer links to ${missing}.`;
    const replacement = added.length === 1 ? added[0] : undefined;
    if (replacement && respondedSuccessfully(report, replacement)) {
      detail += ` It now links to ${pageLabel(new URL(replacement).pathname)}, which responded successfully.`;
    }
    details.push(detail);
  }
  return details;
}

function findingKey(finding: Finding) {
  return JSON.stringify([finding.category, finding.title, [...finding.affectedPaths].sort()]);
}

export function compareScans(prior: ScanReport, report: ScanReport): ScanComparison | undefined {
  if (
    prior.summary.source !== "live" ||
    report.summary.source !== "live" ||
    prior.summary.targetUrl !== report.summary.targetUrl ||
    prior.summary.id === report.summary.id ||
    Date.parse(prior.summary.startedAt) >= Date.parse(report.summary.startedAt)
  )
    return undefined;

  const previousKeys = new Set(prior.findings.map(findingKey));
  const currentKeys = new Set(report.findings.map(findingKey));
  const newCount = report.findings.filter(
    (finding) => !previousKeys.has(findingKey(finding)),
  ).length;
  const existingCount = report.findings.length - newCount;
  const details: string[] = [];
  let fixed = 0;
  let unverified = false;
  for (const finding of prior.findings) {
    if (currentKeys.has(findingKey(finding))) continue;
    const missing = brokenPage(prior, finding);
    const changes = missing ? resolvedBrokenLink(prior, report, missing) : [];
    if (changes.length) {
      fixed++;
      details.push(...changes);
    } else {
      unverified = true;
    }
  }
  const problemCount = (count: number) => `${count} ${count === 1 ? "problem" : "problems"}`;
  const headline = [
    fixed ? `${problemCount(fixed)} fixed` : "",
    newCount ? `${newCount} new ${newCount === 1 ? "problem" : "problems"} flagged` : "",
    existingCount ? `Still ${problemCount(existingCount)} flagged` : "",
    report.findings.length === 0 ? "No problems flagged now" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (unverified) details.unshift("Some earlier problems couldn’t be verified in this scan.");
  return { previousId: prior.summary.id, headline, details: details.slice(0, 3) };
}
