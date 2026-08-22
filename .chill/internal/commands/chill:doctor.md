# /chill:doctor

Inspect whether Chill Workflow is healthy.

## Checks

- Required commands exist.
- Required nodes exist.
- Mermaid diagrams exist.
- Specs have requirements/design/tasks.
- `LESSONS.md` exists.
- Adapter files exist for Codex, Claude Code, and DeepSeek.
- State files are valid if a workflow is active.

## Output

```text
Chill Doctor: PASS | WARN | FAIL
Findings:
- ...
```

## Continuation

After doctor checks, ask whether to fix findings, reinstall global commands, inspect workflow files, or pause.
