# CrossExam working agreement

Read `docs/CURRENT_STATE.md` first, then `docs/TASKS.md` and relevant design docs.
Follow `docs/AI_WORKFLOW.md`. Preserve the fixture/live boundary and evidence provenance.
Do not enable arbitrary outbound requests before the URL/egress safety task is complete.
Run relevant checks, record actual results, and update CURRENT_STATE before handing off.
Keep changes scoped. No deployment, paid services, authentication, or offensive testing in this foundation.

After every future successfully completed task, once all required validation passes, review the diff for secrets/unrelated files, update repository documentation, create a descriptive Git commit, and push the validated state to `origin/main`. Never push a knowingly failing task. Never force-push unless the user explicitly requests it. The intended remote is `https://github.com/OMIZOOMI/Cross-Exam.git`; fetch and preserve remote history before pushing. Report the resulting commit SHA or the exact authentication/permission blocker.
