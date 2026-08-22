---
description: Legacy Chill Workflow command. Prefer /chill-ai.
argument-hint: "[intent] [args...]"
---

# /chill

Legacy compatibility shim for Chill Workflow.

Prefer the public command:

```text
/chill-ai [intent] [args...]
```

## Arguments

`$ARGUMENTS`

## Dispatch

First, try to interpret the arguments with the `/chill-ai` intent router:

- `start`, `from-prd`, `开始`, `从PRD开始` -> follow `chill:from-prd.md`
- `continue`, `resume`, `继续`, `恢复` -> follow `chill:resume.md`
- `status`, `state`, `状态`, `进度` -> follow `chill:status.md`
- `approve`, `批准`, `同意` -> follow `chill:approve.md`
- `bug`, `bugs`, `修bug`, `缺陷` -> follow `chill:bug.md`
- `deploy`, `release`, `部署`, `发布` -> follow `chill:deploy.md`
- `finish`, `done`, `完成`, `收尾` -> follow `chill:finish.md`
- `doctor`, `audit`, `检查`, `诊断` -> follow `chill:doctor.md` or `chill:audit.md`

For backward compatibility only, also accept the older stage-style subcommands:

- `from-prd {prdPath} {projectPath}` -> follow `chill:from-prd.md`
- `init {projectPath}` -> follow `chill:init.md`
- `prd {docsPath}` -> follow `chill:prd.md`
- `map` -> follow `chill:map.md`
- `run {specsPath} {projectPath}` -> follow `chill:run.md`
- `review` -> follow `chill:review.md`
- `qa` -> follow `chill:qa.md`
- `bug` -> follow `chill:bug.md`
- `status` -> follow `chill:status.md`
- `resume` -> follow `chill:resume.md`
- `approve {gateId}` -> follow `chill:approve.md`
- `audit` -> follow `chill:audit.md`
- `doctor` -> follow `chill:doctor.md`
- `finish` -> follow `chill:finish.md`

If no subcommand is provided, default to:

```text
/chill-ai
```

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
4. Read the matching `.chill/internal/commands/chill:{subcommand}.md`.
5. Use `.chill/nodes/`, `.chill/diagrams/`, `.chill/skills-map.md`, and `specs/LESSONS.md`.
6. Use Inline Command Chaining: when the command reaches a normal next Chill command, load that next command file and execute it in the same run.
7. Use Context Hygiene: rebuild context from durable files and `.chill/context/context-pack.md`, not long chat history.
8. Auto-run ordinary stages and pause only for business ambiguity, credentials, destructive changes, production deployment, security holds, payment, auth decisions, failed gates, or explicit user interruption.
9. Persist `.chill/state/workflow-state.json` and use `/chill-ai continue` after interruption.

## Pre-Final State Check

Before any final response, read `.chill/state/workflow-state.json`.

If `status` is `running` and `nextSafeCommand` is not empty, do not final. Treat the response as a progress update and execute `nextSafeCommand` in the same run.

## Common Examples

```text
/chill-ai start ./docs/prd.md .
/chill-ai bug
/chill-ai status
/chill-ai continue
/chill-ai doctor
```
