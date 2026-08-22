# Retry Policy

Retry Policy keeps long-running Chill work reliable without hiding failures.

## Defaults

- Retry transient local command failures once after checking logs.
- Retry network or cloud discovery failures only if the error is clearly transient.
- Do not retry destructive, production, payment, auth, migration, or cloud mutation actions automatically.
- Do not retry the same review/QA fix loop more than two times without pausing.

## Backoff

Use simple bounded backoff:

```text
attempt 1 -> immediate
attempt 2 -> short wait
attempt 3 -> pause and report
```

## Partial Failure

When a task wave partially fails:

1. Mark completed tasks.
2. Write failed task status.
3. Persist `.chill/state/workflow-state.json`.
4. Append `.chill/state/audit-log.jsonl`.
5. Continue independent tasks only if dependencies and file ownership remain safe.

## Stop Conditions

- Unknown failure cause.
- Repeated failure.
- Non-idempotent operation.
- Missing rollback.
- External service or credentials unavailable.
