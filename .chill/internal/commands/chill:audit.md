# /chill:audit

Print recent Chill workflow decisions and transitions.

## Output

- State transitions.
- Commands run.
- Files touched.
- Subagents dispatched.
- Gates passed or failed.
- Human approvals.
- Lessons written.

## Continuation

After audit output, ask whether to inspect status, resume, run doctor, or pause.

## Source

`.chill/state/audit-log.jsonl`
