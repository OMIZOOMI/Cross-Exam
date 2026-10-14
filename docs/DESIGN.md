# CrossExam design

Accepted 2026-10-01. The visual identity is an investigative research report with the precision of developer analytics. The content determines the composition.

## Stage 18.1 landing-only motion exception

The campaign landing uses `landing-stage181.css` over the existing landing system. At desktop,
header plus hero occupy approximately one viewport with about 96% available width, a large serif
headline, and a layered CSS-perspective/SVG investigation scene. The existing detailed fixture
record is disclosed on demand. This is not a report or Tribunal redesign.

One 12-second synthetic illustration introduces website → page records → observations/evidence →
claim → challenge → evidence reconnection → contested verdict → Veyra signature. The exact C-005
fixture remains contested, amber and explicitly unproven. Depth represents records, not authority.
Small radial lighting fields are static; entrance motion uses translation/opacity and bounded SVG
strokes, without video, WebGL, remote assets or new dependencies. “Skip intro” and record selection
settle the scene; it does not loop. Reduced motion shows the final composition immediately and a
preference change never restarts it. Tablet removes tilt, while mobile reads vertically rather than
shrinking the desktop scene. The report's existing motion/semantic rules below remain unchanged.

## Stage 18 public presentation — Veyra

The public web identity is **Veyra — Evidence-backed website investigations.** Veyra is a
presentation layer over CrossExam's existing deterministic contracts and local collection flow; it
does not rename repositories, packages, schemas, security identifiers, scanner code, or internal
engine roles. The landing page leads with a local HTTP investigation, then makes the synthetic case
sequence and the offline-only specialist boundary explicit. The report keeps the target and scope
visible before the evidence archive, and groups Site Map, Findings, and planned Solutions under
Investigation.

The Tribunal view is an evidence-chain reading surface, not an execution surface. It follows a
claim through cited evidence, challenge availability, Skeptic/reproduction state, and the bounded
verdict meaning already present in the supplied `ScanReport`. Synthetic demo rows remain labeled as
fixture records; live reports expose deterministic HTTP/HTML results only and state that Tribunal,
provider, browser, and reproduction layers are unavailable. The display helpers may explain
provenance and legacy experiment labels, but never construct authority artifacts or upgrade a
synthetic result to an observed reproduction.

The Stage 18 responsive system uses the same editorial paper/graphite/blue language across the
landing and report. Desktop and laptop preserve asymmetrical compositions; tablet collapses the
landing argument and case record into a readable sequence; mobile turns tabbed relationship and
claim selectors into horizontally scrollable controls inside the page gutter, with route details
below the Site Map. Focus outlines, native controls, skip navigation, descriptive labels,
keyboard-selected graph nodes, explicit empty/error/unavailable copy, and reduced-motion rules are
part of the visual system. Screenshots are review evidence only and are not repository artifacts.

## Philosophy and hierarchy

Answer, in order: which website, what survived scrutiny, what matters most, where the problem sits, what proves it, and what to inspect next. The target dominates the report header. Three confirmed findings become an executive narrative, with scope facts in a quiet column and a single prominent performance finding supported by two measured runs. Other confirmed findings are compact links. A wide route graph precedes the claim-survival sequence and response-time comparison.

Use deliberate asymmetry, editorial whitespace, horizontal rules, and a mixture of dense records and quiet explanation. Most content sits directly on the page. The pale blue priority section has a specific purpose; it is not a reusable dashboard-card default. Landing pairs the investigation control with a specific fixture finding and evidence trail, followed by a three-part product story.

## Typography

Georgia carries report identity, major headings, and occasional editorial emphasis. System sans-serif carries product copy, controls, observations, and counts. System monospace is reserved for URLs, paths, record IDs, and technical values. No remote font requests. Sentence case is the default. Hierarchy comes from scale, weight, and space rather than small uppercase labels.

## Color semantics

The base is warm paper (`#f6f5f1`), off-white, graphite (`#25292e`), and quiet gray rules. Semantic colors are restrained and reinforced by text:

| Meaning | Color |
| --- | --- |
| Observed evidence; links and selection | Blue `#2458a6` |
| Derived measurements | Indigo `#4c5ca3` |
| Inferred or requiring caution | Amber `#8b661a` |
| Simulated activity | Violet `#77569b` |
| Confirmed; successful HTTP response | Green `#357058` |
| Contested | Orange `#a75c28` |
| High severity; failed response | Red `#b5473d` |
| Unresolved or unavailable | Gray |

A 200 response is not a claim that a route is healthy. The graph separately reports related findings. Classification is also separate from source: “Observed” fixture records remain synthetic, and every report retains its fixture disclosure. Text colors are contrast-checked against the surface beneath them.

## Reading and interaction

- Findings are a list/table hybrid. Expansion exposes the ordered claim → challenge → experiment → verdict trail and evidence references. Uncertainty stays visible.
- The map highlights connections to the selected route. Its adjacent inspector links to related findings; a native selector and route table provide an alternative to graph navigation.
- Evidence is a searchable, category-filtered archive. Compact rows expose classification, URL, timestamp, and referencing claims. Observation details expand in place; following an evidence ID opens that record.
- Solutions connect the problem and its impact to evidence, a proposed correction/investigation, an intended result, and verification steps. Intended results are explicitly hypotheses. “Cross-Exam Fix — planned” is not a working feature.
- On mobile, scope facts become a compact strip, records remain rows, reasoning stays in expandable sections, and the activity log starts collapsed. The map uses a narrower two-column arrangement with the inspector below. Tablet and laptop preserve side-by-side composition where it remains readable.

## Motion and accessibility

Only state changes animate: a finding opening and loading placeholders. Graph pan/zoom/selection explain relationships. No scroll reveals, decorative motion, or fake investigation progress. Reduced-motion preferences remove transitions/animation. Native buttons, selects, disclosures, focus outlines, a skip link, graph keyboard selection, and descriptive labels remain part of the design.

## Avoid

Equal KPI cards, repeated bordered containers, four-column feature grids, olive terminal styling, neon, glass effects, gradients as decoration, tiny uppercase labels, monospace body copy, fabricated health scores, and visual certainty that exceeds the evidence.

## Implementation boundary

`apps/web/src/app/globals.css` contains the reset and common structural utilities; `editorial.css`
contains the established CrossExam visual system, while the Stage 18 landing, report, and Site Map
rules are isolated in `landing-stage18.css`, `report-stage18.css`, and `site-map-stage18.css`.
Report sections use focused components and pure display helpers. Existing React Flow, Recharts,
contracts, fixtures, scanner, and provider boundaries are retained. No dependency or backend
changes were needed.
