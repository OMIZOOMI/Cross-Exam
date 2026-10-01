# CrossExam design

Accepted 2026-10-01. The visual identity is an investigative research report with the precision of developer analytics. The content determines the composition.

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

`apps/web/src/app/globals.css` contains the reset and common structural utilities; `editorial.css` contains the visual system and responsive compositions. Report sections use a small number of focused components. Existing React Flow, Recharts, contracts, fixtures, scanner, and provider boundaries are retained. No dependency or backend changes were needed.
