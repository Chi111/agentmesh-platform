# Idempotency

Idempotency prevents repeated Chill runs from duplicating work or corrupting state.

## Idempotency Keys

Use a stable key for repeatable operations:

```text
{workflowId}:{featureId}:{taskId}:{operation}
```

Examples:

- `chill:specs/1.auth:T-004:write-tests`
- `chill:specs/2.api:T-008:review`
- `chill:deploy:lambda:plan`

## Rules

- Check task status before execution.
- Skip completed tasks unless the user explicitly asks to rerun.
- Write generated files deterministically where possible.
- Do not run the same deploy mutation twice without checking current cloud state.
- Store operation summaries in `.chill/state/audit-log.jsonl`.
- If rerun output differs unexpectedly, pause and inspect.

## Idempotency

The same command can be resumed or repeated safely when it:

- detects completed work,
- does not duplicate side effects,
- verifies current state before mutation,
- can explain what changed since the last checkpoint.
