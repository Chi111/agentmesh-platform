---
description: Run Chill Workflow with one friendly AI entry point
argument-hint: "[start|continue|status|approve|bug|deploy|finish|doctor|goal] [args...]"
---

# /chill-ai

Run Chill Workflow globally through one public command.

## Arguments

`$ARGUMENTS`

## Dispatch

Interpret the first meaningful argument as a user intent, not as a required stage command:

- `start`, `from-prd`, `开始`, `从PRD开始` -> follow `.chill/internal/commands/chill:from-prd.md`
- free-form focused code/doc change, `goal`, `目标`, `修复`, `改`, `实现` -> follow `.chill/internal/commands/chill:goal.md`
- `continue`, `resume`, `继续`, `恢复` -> follow `.chill/internal/commands/chill:resume.md`
- `status`, `state`, `状态`, `进度` -> follow `.chill/internal/commands/chill:status.md`
- `approve`, `批准`, `同意` -> follow `.chill/internal/commands/chill:approve.md`
- `bug`, `bugs`, `修bug`, `缺陷` -> follow `.chill/internal/commands/chill:bug.md`
- `deploy`, `release`, `部署`, `发布` -> follow `.chill/internal/commands/chill:deploy.md`
- `finish`, `done`, `完成`, `收尾` -> follow `.chill/internal/commands/chill:finish.md`
- `doctor`, `audit`, `检查`, `诊断` -> follow `.chill/internal/commands/chill:doctor.md` or `.chill/internal/commands/chill:audit.md`

If no intent is provided:

1. If saved state is active or blocked, continue from `.chill/internal/commands/chill:resume.md`.
2. Else if `docs/prd.md` exists, start from `.chill/internal/commands/chill:from-prd.md` with `docs/prd.md .`.
3. Else route natural-language work through `.chill/runtime/router.md`; use `simple` for no-code answers, `goal` for bounded small changes, `bug` for noisy reproduction, `from-prd` for product work, and `dynamic` for multi-agent or risky work.

## Workflow Source

Use the globally installed `chill-workflow` skill and its reference files:

```text
~/.claude/skills/chill-workflow/references/chill-workflow/
~/.codex/skills/chill-workflow/references/chill-workflow/
```

When executing inside a target project:

1. If the project lacks `.chill/`, copy or adapt the reference `.chill/` into the project.
2. Read `.chill/CHILL.md`.
3. Read `.chill/orchestrator.md`.
4. Read `.chill/runtime/router.md` when the input is natural language or may be lightweight.
5. Resolve the `/chill-ai` intent to the matching internal `.chill/internal/commands/chill:*.md` stage file.
6. Load `.chill/gates/review-gate.md` before recommending commit or completion for changed files.
7. Use `.chill/nodes/`, `.chill/runtime/node-graph.md`, `.chill/diagrams/`, `.chill/skills-map.md`, and `specs/LESSONS.md` only when the active internal stage needs them.
8. Use Inline Command Chaining: when the stage reaches a normal next Chill stage, load that next stage file and execute it in the same run.
9. Use Context Hygiene: rebuild context from durable files and `.chill/context/context-pack.md`, not long chat history.
10. Auto-run ordinary stages and pause only for business ambiguity, credentials, destructive changes, production deployment, security holds, payment, auth decisions, failed gates, or explicit user interruption.
11. Persist `.chill/state/workflow-state.json` and tell the user to use `/chill-ai continue` after interruption.

## Pre-Final State Check

Before any final response, read `.chill/state/workflow-state.json`.

If `status` is `running` and `nextSafeCommand` is not empty, do not final. Treat the response as a progress update and execute the next safe internal stage in the same run.

## Common Examples

```text
/chill-ai start ./docs/prd.md .
/chill-ai 修复登录按钮无响应
/chill-ai 开始 ./docs/prd.md .
/chill-ai continue
/chill-ai 继续
/chill-ai status
/chill-ai approve stack-choice-001 option 1
```
