# Mission Control

Mission Control is the human-readable inbox for long-running Chill workflows.

It answers:

- What is running?
- What is waiting for approval?
- What failed?
- What is complete?
- What can safely resume?

## Status Buckets

- `running`: active command/task.
- `waiting-input`: clarify questions or missing credentials.
- `waiting-approval`: approval gates.
- `failed`: review, QA, deploy, or tool failures.
- `completed`: finished tasks or workflow.

## Data Sources

- `.chill/state/workflow-state.json`
- `.chill/state/audit-log.jsonl`
- `.chill/state/approvals.json`
- `.chill/context/handoff-summary.md`
- `.chill/agents/registry.json`
- `.chill/runtime/observability.md`

## Output Shape

```text
Mission Control
Status: running | waiting-input | waiting-approval | failed | completed
Active command:
Feature:
Task:
Agent:
Gate:
Next safe action:
Resume:
```

## Rules

- `/chill-ai status` should show Mission Control by default.
- `/chill-ai continue` should use Mission Control only as a summary, not as source of truth.
- Source of truth remains state, specs, context, and code files.

## Current

Mission Control
Status: completed
Active command: internal chill:finish
Feature: specs/11.unified-login-route-auth
Task: finish
Agent: planner/backend/frontend/qa
Gate: none
Next safe action: none
Resume: none

Latest Feature:
Unified login and route authorization completed. 10/10 tasks complete, review passed, QA passed, and pnpm typecheck/test/build passed. Browser automation was attempted but blocked by local host permissions; deterministic web route-guard tests and API integration tests cover URL/hash/session authorization behavior.
