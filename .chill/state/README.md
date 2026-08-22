# Chill State

Chill state files make the workflow interruptible and resumable.

## Files

- `workflow-state.json`: current command, feature, task, gate, next safe command, and checkpoint.
- `audit-log.jsonl`: append-only execution events.
- `approvals.json`: blocked gates that need user approval.
- `interrupt.json`: saved context when the user pauses or the session is interrupted.

## Rules

- Update `workflow-state.json` before risky mutations and after each completed stage.
- Append `audit-log.jsonl` after every meaningful state transition.
- Store only necessary context. Large specs stay in `specs/`; state stores paths and IDs.
- `/chill-ai continue` continues from the last safe checkpoint unless `approvals.json` has a blocked gate.
- `/chill-ai approve {gateId}` clears an approved gate and continues the blocked command automatically.

## State Machine

```text
intake -> scan -> specs -> plan -> execute -> review -> qa -> context-reset -> next task
```

Pause only at gates. Ordinary stages should auto-advance.
