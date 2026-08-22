# /chill:review

Run task-level review.

## Usage

```text
/chill:review {taskId}
```

## Workflow

1. Collect files changed by the current task.
2. Review against `design.md`, project rules, and acceptance criteria.
3. Check code quality, logic, edge cases, error handling, and maintainability.
4. Run a security pass for secrets, injection risks, auth boundaries, and unsafe dynamic execution.
5. For user-facing features, apply `.chill/policies/frontend-dod.md`.
6. If review fails, route back to the responsible subagent with exact findings.
7. If review passes, allow QA gate.

For final commit recommendation or any route that changed files outside a task-level review, load `.chill/gates/review-gate.md` and record `Verdict: ALLOW | BLOCK | ERROR`.

## Auto-Advance

If review passes, continue directly to internal `chill:qa` by loading `.chill/internal/commands/chill:qa.md` inline. Do not ask the user to run it manually.

## Memory Source Check

Review must reject claims that rely only on chat history.

For each changed behavior, check that it traces to at least one durable source:

- PRD or docs
- `requirements.md`
- `design.md`
- `tasks.md`
- `LESSONS.md`
- `.chill/context/decision-log.md`
- `.chill/context/assumptions.md` with accepted low risk

If a change is based on an unsupported memory, move it to `.chill/context/open-questions.md` and pause if it affects behavior.

## Product UI Completion Check

When the PRD or specs mention a user-facing app, screen, workbench, dashboard, booking, order, refund, check-in, export, notification, or review flow, review must verify that the frontend implements the actual workflow.

Return `NEEDS_FIX` if:

- the UI only presents static cards or text summaries,
- there is no route or navigable view for the target role,
- there is no meaningful user action for an operational requirement,
- backend APIs exist but the UI has no real API call or typed mock contract,
- loading, empty, error, permission, or success states are missing for the primary flow,
- browser evidence only checks rendered labels rather than completing an interaction.

Static overview pages may exist, but they cannot satisfy feature completion unless the PRD explicitly requested only a landing/status page.

## Policy Gateway Check

Review must check that any agent or tool action stayed within policy:

- Agent exists in `.chill/agents/registry.json`.
- Agent capabilities match assigned task.
- Tool use was allowed by `.chill/policies/gateway.md`.
- Risky operations were plan-only or approval-gated.
- Retry behavior followed `.chill/runtime/retry-policy.md`.
- Reruns followed `.chill/runtime/idempotency.md`.

If review returns `NEEDS_FIX`, continue through the fix loop automatically when the fix is low risk and clearly scoped. Pause only when the finding requires product judgment, security approval, credentials, destructive changes, or repeated failed fixes.

If review returns `SECURITY_HOLD`, write a gate into `.chill/state/approvals.json` and pause for `/chill-ai approve`.

## Unified Gate Bridge

Task-level review may pass before the workflow is ready to recommend commit. The unified review gate is still required when:

- the active route is `goal`;
- the user asks whether the work is ready to commit;
- changed files include sensitive configuration, auth, privacy, payments, migrations, or deployment surfaces;
- the workflow skipped full PRD/spec review because the task was intentionally lightweight.

## Output

```text
Review: PASSED | NEEDS_FIX | SECURITY_HOLD
Findings:
- {severity} {file}:{line} {issue}
Next action: {fix | approve | ask user}
```

## Continuation

Do not ask after a passing review. Auto-advance to internal `chill:qa`. Ask only when a review gate is blocked or human approval is required.
