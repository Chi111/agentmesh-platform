# /chill-ai

One friendly entry point for Chill Workflow.

## Usage

```text
/chill-ai [intent] [args...]
```

Common intents:

```text
/chill-ai
/chill-ai 修复登录按钮无响应
/chill-ai start docs/prd.md .
/chill-ai continue
/chill-ai status
/chill-ai approve stack-choice-001 option 1
/chill-ai bug
/chill-ai deploy staging
```

Chinese aliases are accepted:

```text
/chill-ai 开始 docs/prd.md .
/chill-ai 继续
/chill-ai 状态
/chill-ai 批准 stack-choice-001 option 1
/chill-ai 修 bug
/chill-ai 部署 staging
```

## Purpose

`/chill-ai` is the public command. The older `chill:*` command files are internal stage modules used by the router and orchestrator. Users should not need to remember or invoke the stage commands directly.

## Intent Router

Read `.chill/runtime/router.md` first when an input is not an explicit command. Use it to keep small tasks light and promote only when the evidence requires a heavier loop.

Interpret the first meaningful argument as intent:

| User intent | Aliases | Internal stage |
| --- | --- | --- |
| Lightweight goal | free-form change request, `goal`, `目标`, `修复`, `改`, `实现` | `.chill/internal/commands/chill:goal.md` |
| Start from PRD | `start`, `from-prd`, `开始`, `从PRD开始` | `.chill/internal/commands/chill:from-prd.md` |
| Continue saved work | `continue`, `resume`, `继续`, `恢复` | `.chill/internal/commands/chill:resume.md` |
| Show state | `status`, `state`, `状态`, `进度` | `.chill/internal/commands/chill:status.md` |
| Approve a gate | `approve`, `批准`, `同意` | `.chill/internal/commands/chill:approve.md` |
| Handle bugs | `bug`, `bugs`, `修bug`, `修 bug`, `缺陷` | `.chill/internal/commands/chill:bug.md` |
| Deploy | `deploy`, `release`, `部署`, `发布` | `.chill/internal/commands/chill:deploy.md` |
| Audit workflow | `audit`, `doctor`, `检查`, `诊断` | `.chill/internal/commands/chill:doctor.md` or `.chill/internal/commands/chill:audit.md` |
| Finish | `finish`, `done`, `完成`, `收尾` | `.chill/internal/commands/chill:finish.md` |

## Weight Router

For natural-language inputs, route by task weight before loading heavy context:

| Route | Use when | Internal path |
| --- | --- | --- |
| simple | No code change is needed, or the user asks for status, explanation, or a light inspection. | Answer directly or route to `status`. |
| goal | A single bounded code/doc change or small bug can be inspected, implemented, verified, and gated without PRD/spec generation. | `.chill/internal/commands/chill:goal.md` |
| bug | A defect needs reproduction, impact analysis, regression tests, a bug list, CI triage, or multiple bug candidates. | `.chill/internal/commands/chill:bug.md` |
| prd | A PRD, product idea, or feature request needs requirements, design, tasks, and QA. | `.chill/internal/commands/chill:from-prd.md` |
| dynamic | Work spans modules, specialists, risky gates, or unclear dependencies. | Build a phased plan, dispatch agents, then continue through `chill:run`. |

Default to the lightest route that can honestly finish the task. Upgrade from `simple -> goal -> bug -> prd -> dynamic` only when repo evidence, risk, or user intent requires it. For code changes that can be committed, finish with workflow + gate by loading `.chill/gates/review-gate.md` before any commit recommendation.

If no intent is provided:

1. If `.chill/state/workflow-state.json` is `running`, `interrupted`, `waiting-input`, or `waiting-approval`, route to `continue`.
2. Else if `docs/prd.md` exists, route to `start docs/prd.md .`.
3. Else route to `status` and explain the next useful `/chill-ai` action.

## Routing Rules

1. Read `.chill/CHILL.md`.
2. Read `.chill/orchestrator.md`.
3. Read `.chill/runtime/router.md`.
4. Read `.chill/policies/context-firewall.md`.
5. Resolve the user intent to one internal stage file.
6. Load only the files required by that route.
7. When a stage reaches a normal next stage, keep chaining internally without asking the user to invoke another command.
8. Pause only for the gates listed in `.chill/CHILL.md`.
9. When paused, tell the user the next action using `/chill-ai`, not a stage command.

## Context Firewall

Keep the main agent focused on workflow state, decisions, merge responsibility, and the active task.

- Use durable files as memory; do not trust chat-only details after compression, clear, resume, or task switch.
- Route unrelated or noisy investigation to subagents when it does not affect shared architecture, contracts, auth, payment, privacy, security, migrations, or production deployment.
- Ask subagents for compact conclusions, inspected files, evidence, risks, and recommended next action.
- Verify subagent findings against files before treating them as project truth.
- Keep unrelated answers out of `.chill/context/context-pack.md`; write only reusable project facts, assumptions, open questions, and lessons.

## User-Facing Language

Prefer plain prompts:

```text
Continue: /chill-ai continue
Approve: /chill-ai approve {gateId} option {1|2|3}
Status: /chill-ai status
```

Avoid exposing internal stage names unless explaining implementation details or debugging the workflow itself.
