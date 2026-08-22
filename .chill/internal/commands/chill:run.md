# /chill:run

Execute specs against a target project.

## Usage

```text
/chill:run {specsPath} {projectPath}
```

## Workflow

1. Load project profile and rules.
2. Load `specs/LESSONS.md`.
3. Read feature `requirements.md`, `design.md`, and `tasks.md`.
4. Skip tasks already marked complete.
5. Build a serial/parallel execution plan from dependencies and file/module ownership.
6. Read `.chill/runtime/node-graph.md` when task waves need explicit node state.
7. Dispatch subagents only when task boundaries are independent.
8. Merge results.
9. Run `/chill:review` and `/chill:qa` gates.
10. Run `.chill/gates/review-gate.md` before commit recommendation when files changed.
11. Mark completed tasks immediately.
12. Reset context before the next task.
13. Continue to the next unblocked task until all tasks are complete.

## Auto-Run Loop

`/chill:run` is an execution loop. It should not stop after planning, after one task, after review, or after QA when those stages pass.

Run all runnable tasks, not only the first task.

If state remains `running`, do not produce a final response after a successful task. Update progress briefly, persist the checkpoint, then continue to the next task from `nextSafeCommand`.

## Context Pack Refresh

Before each task or task wave:

1. Read `.chill/context/hallucination-guards.md`.
2. Read `.chill/policies/context-firewall.md`.
3. Rebuild `.chill/context/context-pack.md` from the active `requirements.md`, `design.md`, `tasks.md`, `specs/LESSONS.md`, `.chill/state/workflow-state.json`, and `.chill/context/decision-log.md`.
4. Move chat-only claims into assumptions or open questions before using them.
5. Keep task execution focused on the active context pack.
6. Dispatch isolated investigation to subagents when it would otherwise load unrelated logs, research, screenshots, or exploratory notes into the main context.

## Agent Registry Dispatch

Before dispatching a task:

1. Read `.chill/agents/registry.json`.
2. Match the task to required capabilities.
3. Check `.chill/policies/identity.md` for the correct agent identity.
4. Check `.chill/policies/context-firewall.md` for context isolation and subagent return payload requirements.
5. Check `.chill/policies/gateway.md` before any tool use.
6. Apply `.chill/runtime/idempotency.md` before rerun or resume.
7. Apply `.chill/runtime/retry-policy.md` after transient failure.
8. Append dispatch and result events to `.chill/state/audit-log.jsonl`.

For each task:

1. Parse `tasks.md` and build a dependency graph.
2. Group runnable tasks into waves.
3. Execute independent tasks in a wave concurrently only when file ownership is safe.
4. Persist `workflow-state.json` with current feature, task, and next safe command.
5. Execute serially or dispatch subagents.
6. Merge results.
7. Load `.chill/internal/commands/chill:review.md` and run review inline.
8. If review passes, load `.chill/internal/commands/chill:qa.md` and run QA inline.
9. If QA passes, mark the task complete.
10. Append audit log and update lessons when useful.
11. Reset context and continue to the next task or next wave.

Stop only when a gate pause condition is met or no runnable tasks remain.

## Parallel Rules

- Parallel is allowed for independent modules, separate repositories, isolated UI pages, or independent tests.
- Serial is required for shared types, API contracts, database migrations, auth, payment, and files touched by multiple tasks.
- Unrelated user questions, noisy research, log analysis, and isolated bug reproduction should be dispatched as context-isolated subagent work when they do not change the active task's shared files or decisions.

## Stop Conditions

- Business behavior is unclear.
- Review or QA fails repeatedly.
- A task requires credentials or external services that are unavailable.

## Continuation

Do not ask after ordinary planning or task execution. Continue automatically to review, QA, the next task, or finish. If stopped, include the gate reason and `/chill-ai continue`.

Do not treat a running preview server or passed verification as workflow completion. Continue until all runnable tasks are complete or a real gate blocks progress.
