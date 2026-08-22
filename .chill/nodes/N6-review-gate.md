# N6: Review Gate

Purpose: catch quality, logic, architecture, and security issues before QA.

## Checks

- Matches `design.md`.
- Follows project rules.
- Handles edge cases and failures.
- Maintains module boundaries.
- Avoids secrets, injection, unsafe dynamic execution, and permission leaks.
- For user-facing work, satisfies `.chill/policies/frontend-dod.md`.

## Empty Shell Rejection

Reject user-facing feature completion when the implementation is only static cards, a scope dashboard, or text describing future capabilities.

## Outcomes

- `PASSED`: proceed to QA.
- `NEEDS_FIX`: return to the responsible subagent.
- `SECURITY_HOLD`: stop and ask for approval or fix instructions.
