# Chill Router Runtime

Route every `/chill-ai` input to the lightest workflow that can finish honestly.

## Route Ladder

```text
simple -> goal -> bug -> prd -> dynamic
```

Default light, upgrade only when evidence requires it.

## Routes

| Route | Trigger | Load | Stop |
| --- | --- | --- | --- |
| simple | Explanation, status, tiny inspection, no code change. | Existing chat, minimal files, maybe `status`. | Answer directly. |
| goal | One bounded change or small bug with clear acceptance criteria. | `chill:goal`, context firewall, focused files. | Verification and review gate if files changed. |
| bug | Defect triage, reproduction, CI failure, regression, bug list, noisy logs. | `chill:bug`, bug source, context firewall, specialist agents as needed. | Digest, selected fix, or bug workflow continuation. |
| prd | Product idea, feature, PRD, larger behavior change. | `chill:from-prd`, requirements/design/tasks. | Full workflow loop. |
| dynamic | Multi-module, multi-agent, risky, or unclear dependency graph. | Orchestrator, node graph, registry, gateway policies. | Gate, plan, or `chill:run`. |

## Decision Rules

1. If the user asks a question and no code change is needed, stay `simple`.
2. If the user gives a single direct implementation request, start `goal`.
3. If the request says bug, regression, CI, failing test, crash, or broken behavior, inspect whether reproduction is noisy. Use `goal` for tiny obvious bugs; use `bug` for anything that needs triage.
4. If the request includes PRD, roadmap, feature, new module, product flow, or acceptance criteria generation, use `prd`.
5. If the work crosses shared contracts, data, auth, payments, deployment, or multiple independent areas, use `dynamic`.
6. For any route with code changes that may be committed, finish with workflow + gate through `.chill/gates/review-gate.md`.

## Context Budget Policy

- Load the route contract first, not every internal command.
- Read `.chill/context/context-pack.md` only when durable workflow state matters.
- Dispatch isolated log, screenshot, dependency, or CI analysis to specialist agents instead of loading noisy evidence into the main context.
- Promote routes explicitly in the audit log when the task becomes heavier.
- Never downgrade a route just to save tokens if risk or uncertainty requires a heavier loop.

## Route Record

When state is written, include:

```json
{
  "route": "simple|goal|bug|prd|dynamic",
  "reason": "short evidence-based explanation",
  "activeGoal": ".chill/goals/example.md",
  "nextSafeCommand": "/chill-ai continue"
}
```
