# CrossExam

**Put your website on trial.** Evidence-first website intelligence, with claims that must survive challenge and reproduction.

CrossExam now runs a **real, bounded HTTP/HTML investigation** from its local URL form and renders a LIVE INVESTIGATION report. The separate `/report/demo` remains synthetic fixture data. Browser scanning and AI providers are intentionally unavailable.

## Run

Requires Node.js 24 and pnpm 11.19.0. Use an installed pnpm or install that version with your preferred package-manager setup.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:3000> or <http://127.0.0.1:3000/report/demo>.

The local form accepts public HTTP(S) URLs, investigates up to eight pages on the final entry origin, and saves compact reports for up to 24 hours under ignored `apps/web/.crossexam/reports`. The app binds to loopback; do not expose it as a public scanning service. No forms are submitted, no resources are loaded, and no JavaScript runs on target pages. See [SECURITY.md](docs/SECURITY.md) for exact guarantees and limitations.

For an intentional real CLI investigation: `pnpm --filter @crossexam/scanner scan https://example.com`. The scanner smoke test below uses controlled responses and does not contact that website.

## Validate

```sh
pnpm lint
pnpm test
pnpm test:security
pnpm test:scanner
pnpm build
pnpm scanner:smoke
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm build` type-checks every workspace package and produces the Next.js production build. `pnpm start` serves that build locally. E2E tests start a local server if port 3000 is unused. To test production, stop any development server, build, then run `E2E_PRODUCTION=1 pnpm test:e2e`.

## Repository map

- `apps/web`: local scan form/API, bounded file storage, live reports, and the separate interactive demo.
- `apps/scanner`: bounded deterministic HTML collector, discovery policy, compact evidence, rule engine, and real CLI; all target requests use the engine security boundary.
- `packages/contracts`: Zod schemas and referential report validation.
- `packages/engine`: ScanRunner interface, deterministic verdict summary, and isolated URL/pinned HTTP egress boundary. Browser traffic is not yet protected; see `docs/SECURITY.md`.
- `packages/agents`: role-specific provider interfaces; no model execution.
- `docs`: product, architecture, security, protocol, decisions, roadmap, and handoff state.
- `tests/e2e`: browser checks at desktop and mobile widths.

**Start future work with [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md).**
