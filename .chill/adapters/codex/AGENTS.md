# Chill Workflow For Codex

Use this repo's `.chill/` directory as the workflow source.

## Main Entry

When the user asks to turn a PRD into a project, execute the Chill entry:

```text
/chill-ai start {prdPath} {projectPath}
```

If slash commands are not available in the current Codex surface, treat this as the equivalent natural-language instruction:

> Follow `.chill/commands/chill-ai.md` to route the intent, then execute the resolved internal stage file. Use `.chill/CHILL.md`, `.chill/orchestrator.md`, `.chill/patterns.md`, `.chill/nodes/`, `.chill/diagrams/`, `.chill/skills-map.md`, and `specs/LESSONS.md` as durable workflow context.

## Rules

- Read `.chill/CHILL.md` first.
- Read `.chill/orchestrator.md` before command execution.
- Read `.chill/patterns.md` when checking Google-style skill/runtime alignment.
- Use `/chill-ai` as the public entry point and `.chill/internal/commands/chill:*.md` files as internal stage modules.
- Load `.chill/nodes/`, adapters, and senior role files only when the active command needs them.
- Use `.chill/diagrams/` as Mermaid source of truth.
- Keep PRD-derived work in `specs/`.
- Record non-obvious findings in `specs/LESSONS.md`.
- Do not skip review or QA gates.
- Auto-run ordinary stages until the orchestrator says to pause.
- Persist `.chill/state/workflow-state.json` and resume with `/chill-ai continue`.
