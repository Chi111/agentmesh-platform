# Observability

Observability makes Chill long-running workflows inspectable.

## Required Signals

- Current command.
- Current feature and task.
- Active agent identity.
- Gate status.
- Last safe checkpoint.
- Retry count.
- Changed files.
- Review result.
- QA result.
- Deploy target and smoke result.

## Files

- `.chill/state/workflow-state.json`: current state.
- `.chill/state/audit-log.jsonl`: event log.
- `.chill/state/approvals.json`: blocked approvals.
- `.chill/context/handoff-summary.md`: human-readable summary.
- `.chill/mission-control.md`: consolidated dashboard.

## Event Format

Append JSON lines:

```json
{"timestamp":"...","event":"task.completed","agent":"backend","taskId":"T-004","status":"passed"}
```

## Observability

`/chill-ai status` should read these files and show a concise Mission Control view.
