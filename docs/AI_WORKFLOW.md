# AI coding workflow

1. Read `CURRENT_STATE.md` first and `TASKS.md` next. Treat the repository as the permanent record; chat history is not required.
2. Read the relevant product, architecture, protocol, security, and decision documents. Honor root `AGENTS.md` and applicable nested instructions. Next.js generates version-specific agent guidance in `apps/web/AGENTS.md`; consult installed framework docs for changed APIs.
3. Inspect actual code, versions, and working-tree changes. Preserve existing work. Confirm the requested scope; do not silently implement the whole roadmap.
4. Modify only required modules. Keep contract changes synchronized across producers, fixtures, consumers, and tests. Avoid unrelated refactors or infrastructure.
5. Keep `source: fixture` on demo artifacts and reserve `/report/demo` for examples. Do not manufacture live evidence or AI activity. Keep source and OBSERVED/DERIVED/INFERRED/SIMULATED semantics distinct.
6. Follow `SECURITY.md` before adding any network access. Input syntax validation is not SSRF prevention. Never give providers direct network/browser authority.
7. Run relevant validation. For changes spanning the foundation use `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm scanner:smoke`, and `pnpm test:e2e`. Format with `pnpm format`. Install with the frozen lockfile. UI changes need actual desktop/mobile inspection, not just a build.
8. Fix failures within scope. Record exact commands and outcomes. Distinguish environment restrictions from product defects; rerun with appropriate local permissions rather than claiming an unexecuted check passed. Never claim success without running the relevant checks.
9. Update `CURRENT_STATE.md` with the implementation, run commands, fixtures/fakes, actual checks, known limitations, and exactly one recommended next task. Update task status and decision log when behavior/architecture changes.

No deployment, paid services, real model calls, auth, billing, broad scans, or destructive/offensive testing without a separate task. Prefer simple local implementations with honest boundaries.

## Git synchronization — definition of done

After every future successfully completed task, once all required validation passes, review the diff for secrets/unrelated files, update repository documentation, create a descriptive Git commit, and push the validated state to `origin/main`. Never push a knowingly failing task. Never force-push unless the user explicitly requests it.

The intended remote is `https://github.com/OMIZOOMI/Cross-Exam.git`. Inspect status and staged content; exclude credentials, `.env` files, build output, caches, local investigation reports, screenshots, and machine-specific artifacts. Public disposable TLS test keys under the documented security fixtures are test data, never production credentials. Fetch and inspect remote history before pushing; preserve unrelated remote work. Do not weaken authentication or expose credentials to resolve a push failure. Include the resulting commit SHA and push outcome in the handoff.
