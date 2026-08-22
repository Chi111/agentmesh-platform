# Chill Orchestrator

This file is the execution contract. Commands describe entry points; this file decides how phases continue, pause, resume, and hand off.

## Pipeline

```text
intake -> project scan -> specs -> task plan -> execute -> review -> QA -> persist -> next task or finish
```

Feature work writes:

- `requirements.md`: user stories, constraints, acceptance criteria, and testable statements.
- `design.md`: architecture, data flow, APIs, UI states, errors, security, and test strategy.
- `tasks.md`: ordered tasks with dependencies, expected outputs, verification, and status.

Bug work writes:

- `bugfix.md`: current behavior, expected behavior, unchanged behavior, root-cause hypothesis, and regression tests.
- `design.md`: surgical fix plan and blast-radius analysis.
- `tasks.md`: reproduction, fix, regression, review, and QA.

Lightweight goal work writes:

- `.chill/goals/{date}-{slug}.md`: request, scope, assumptions, acceptance criteria, plan, and evidence.
- `.chill/state/active-goal.json`: active goal path, route, status, and next safe command.
- `.chill/state/review/review-{timestamp}.md`: final gate evidence when files changed.

The router chooses the lightest honest route:

```text
simple -> goal -> bug -> prd -> dynamic
```

Run lightweight tasks without promoting them into full PRD/spec mode unless repo evidence, risk, or user intent requires the heavier loop.

## Runtime Loop

1. Read durable context.
2. Read `.chill/runtime/router.md` when the active route is not already fixed.
3. Rebuild `.chill/context/context-pack.md`.
4. Apply `.chill/policies/context-firewall.md`.
5. Run the current phase.
6. Write checkpoint, audit event, and handoff summary.
7. Continue to the next safe command inline.

Do not stop between ordinary phases. Stop only for the gates listed in `.chill/CHILL.md`.

## Unified Review Gate

Unified review gate behavior applies to lightweight goals, bug fixes, PRD work, and dynamic task graphs.

For any route that changed project files, load `.chill/gates/review-gate.md` before recommending commit or completion. The gate records:

- changed files and scope match;
- focused verification evidence;
- sensitive diff scan result;
- `codex review --uncommitted` or the closest available uncommitted review command;
- `Verdict: ALLOW | BLOCK | ERROR`.

`ALLOW` can continue to QA or finish. `BLOCK` routes back to a scoped fix loop. `ERROR` must be reported with the review file and should not be silently treated as success.

## No Final While Running

If `.chill/state/workflow-state.json` says `status: running` and contains a non-empty `nextSafeCommand`, the assistant must not end with a final handoff summary. Treat any summary as a progress update, then continue executing `nextSafeCommand` in the same run.

Allowed final stops are only:

- `status: completed`
- `status: waiting-input`
- `status: waiting-approval`
- `status: failed`
- `status: interrupted` with `.chill/state/interrupt.json`
- explicit user pause or interruption

Starting a local dev server, passing tests, or finishing one task wave is a checkpoint, not a stopping condition.

## Turn Boundary Interruption

If the assistant cannot continue because of a practical execution boundary such as context limits, tool/session limits, user-visible turn cutoff, or app interruption, it must not present the checkpoint as completion.

Before stopping, write:

```text
.chill/state/interrupt.json
```

The interrupt record must include:

- `reason`: `turn-boundary`, `context-limit`, `tool-limit`, `session-interrupt`, or `user-pause`
- active command, feature, and task
- completed checkpoint summary
- `nextSafeCommand`

Then set or report the workflow as `interrupted`, not `completed`. `/chill-ai continue` must continue from `nextSafeCommand` without asking unless a real gate is blocked.

## Run All Runnable Tasks

Internal `chill:run` executes a dependency graph, not a single checklist item:

1. Parse selected `tasks.md` files.
2. Skip completed tasks.
3. Build waves from explicit dependencies and inferred file ownership.
4. Run independent tasks in parallel only when file/module boundaries are safe.
5. Run shared contracts, migrations, auth, payment, and cross-module edits serially.
6. Review and QA each completed task before marking it done.
7. Persist state after every task transition.

When the route is `goal`, use the smaller graph from `.chill/runtime/node-graph.md` and do not generate `requirements.md`, `design.md`, or `tasks.md` unless the task promotes to `bug`, `prd`, or `dynamic`.

## Google Runtime Patterns

Chill applies the long-running-agent patterns summarized in `.chill/patterns.md`:

- Checkpoint-and-resume: state and audit after each phase/task.
- Delegated approval: pause in place for risky gates and resume from saved state.
- Memory-layered context: specs, lessons, decision log, assumptions, open questions, and context pack.
- Context firewall: main agent owns state and decisions; subagents absorb isolated, noisy, or unrelated work and return compact evidence.
- Ambient processing: `/chill-ai bug` and scheduled bug intake can run without a live PRD conversation.
- Fleet orchestration: planner dispatches registered specialist agents only when boundaries are clear.
- Node graph runtime: `.chill/runtime/node-graph.md` keeps complex work explicit without forcing simple goals through the full graph.

## State Contract

Required runtime files:

```text
.chill/state/workflow-state.json
.chill/state/audit-log.jsonl
.chill/context/context-pack.md
.chill/context/handoff-summary.md
```

Write optional files only when needed:

```text
.chill/state/approvals.json
.chill/state/interrupt.json
.chill/state/active-goal.json
```

`/chill-ai continue` must rebuild context from files, inspect blocked gates, then continue from `nextSafeCommand`.

## Choice Gate Contract

When a gate is blocked by a product or architecture choice, return a bounded decision menu:

```text
Gate: {gateId}
Decision needed: {one sentence}
Recommended: {option id}

Options:
1. {label} - {best for} - {tradeoff}
2. {label} - {best for} - {tradeoff}
3. {label} - {best for} - {tradeoff}
Custom: user may provide another stack or rule.

Continue:
- /chill-ai approve {gateId} option {1|2|3}
- or reply with a custom choice
```

If the gate is `stack-choice-*`, infer options from the PRD, team size, deploy target, data sensitivity, and existing repo signals. Provide exactly three strong defaults plus custom input.

## Gateway Contract

Before agent dispatch, external tool use, cloud work, deploy, or resume:

1. Check `.chill/agents/registry.json`.
2. Check `.chill/policies/identity.md`.
3. Check `.chill/policies/context-firewall.md`.
4. Check `.chill/policies/gateway.md`.
5. Apply `.chill/runtime/idempotency.md`.
6. Apply `.chill/runtime/retry-policy.md`.
7. Update `.chill/runtime/observability.md` signals through audit and mission control.
