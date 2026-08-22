# /chill:qa

Run tests and acceptance checks.

## Usage

```text
/chill:qa {featurePath}
```

## Workflow

1. Detect the project's test framework and commands.
2. Run unit, integration, typecheck, lint, build, or E2E checks based on project profile.
3. Verify each acceptance criterion from `requirements.md`.
4. For UI changes, run product workflow browser verification using `.chill/policies/frontend-dod.md`.
5. Route failures into Test Fix Loop.
6. Mark acceptance results in the QA report.

## Auto-Advance

If QA passes, mark the task complete and continue to the next runnable task in internal `chill:run`. If no runnable tasks remain, continue to internal `chill:finish` by loading `.chill/internal/commands/chill:finish.md` inline.

## Traceability Check

Every QA result must trace to a requirement, task, or accepted decision. Do not pass QA based on remembered chat context.

Before marking QA passed:

1. Link acceptance checks to `requirements.md`.
2. Link task completion to `tasks.md`.
3. Link any exception to `.chill/context/decision-log.md` or `specs/LESSONS.md`.
4. Move missing evidence to `.chill/context/open-questions.md`.

If QA fails with a clear local fix, route back to the responsible subagent and re-run QA automatically. Pause only when failures require missing credentials, external services, manual-only validation, repeated failed fixes, or a product decision.

## Product UI QA

For user-facing features, QA must perform at least one real interaction per primary workflow:

- create or edit,
- book or cancel,
- check in,
- submit or approve,
- filter dashboard data,
- export data,
- review or confirm AI output,
- open notification detail or mark read.

QA must record the route, actor, data source, action performed, expected state change, and final assertion. Text-only rendering checks are insufficient for product UI completion.

If the UI is only static cards or a scope dashboard, QA must return `FAILED` or `NEEDS_MANUAL` unless the related task is explicitly marked as a placeholder.

## Output

```text
QA: PASSED | FAILED | NEEDS_MANUAL
Tests: {passed}/{total}
Acceptance: {passed}/{total}
Manual checks: {items}
```

## Continuation

Do not ask after passing QA. Auto-advance to the next task or internal `chill:finish`. Ask only when QA needs manual judgment or approval.
