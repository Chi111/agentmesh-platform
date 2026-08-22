# /chill:bug

Build a daily bug workflow from Jira or local `bugs.json`.

## Usage

```text
/chill:bug
/chill:bug --source bugs/bugs.json
/chill:bug --agent codex
```

## Workflow

1. Load bug source. First version uses `bugs/bugs.json`.
2. Filter open bugs assigned to the current user when assignee information exists.
3. Triage by priority, module, status, severity, and missing information.
4. Build a repair order for the day.
5. Dispatch bug subagents for reproduction, impact, and fix proposal.
6. Merge a daily digest.
7. Generate a notification payload for `codex`, `claude`, or `opencode`.

## Output

- Today's bug digest.
- Missing information list.
- Suggested fix order.
- Agent notification payload.

## Mermaid

See `.chill/diagrams/bug-flow.mmd`.

## Continuation

After bug digest generation, ask whether to continue with `/chill-ai continue` for selected bugs, notify the configured agent in dry-run, inspect bug details, or pause.
