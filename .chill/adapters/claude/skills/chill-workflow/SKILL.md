---
name: chill-workflow
description: Turn a PRD into a project-adaptive Chill workflow with specs, fixed Mermaid workflow maps, subagent planning, review, QA, lessons, and bug flow.
argument-hint: "[prdPath] [projectPath]"
disable-model-invocation: true
---

# Chill Workflow

Run the Chill workflow from a PRD.

## Inputs

- `$ARGUMENTS[0]`: PRD path.
- `$ARGUMENTS[1]`: project path.

## Instructions

1. Read `.chill/CHILL.md`.
2. Read `.chill/orchestrator.md`.
3. Read `.chill/commands/chill-ai.md`, then the resolved internal stage file such as `.chill/internal/commands/chill:from-prd.md`.
4. Use `.chill/patterns.md` to check Google-style skill/runtime alignment when needed.
5. Follow the command workflow exactly.
6. Load `.chill/nodes/`, `.chill/senior-skills/`, adapters, and diagrams only when the active command needs them.
7. Continue ordinary stages inline until the orchestrator says to pause.
8. Persist `.chill/state/workflow-state.json` and resume with `/chill-ai continue`.

## Output

- Specs path, execution state, review/QA status, and gate reason or completion summary.
