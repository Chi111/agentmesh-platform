# /chill:status

Show the current Chill workflow state.

## Mission Control View

Show `.chill/mission-control.md` style output by reading:

- `.chill/state/workflow-state.json`
- `.chill/state/audit-log.jsonl`
- `.chill/state/approvals.json`
- `.chill/context/handoff-summary.md`
- `.chill/agents/registry.json`
- `.chill/runtime/observability.md`

## Output

- Current feature.
- Current task.
- Current state machine node.
- Interrupt reason, if `.chill/state/interrupt.json` exists.
- Last review and QA result.
- Blocked gate, if any.
- Next safe action.

## Source Files

- `.chill/state/workflow-state.json`
- `.chill/state/audit-log.jsonl`
- `.chill/state/approvals.json`
- `.chill/state/interrupt.json`
- `specs/*/tasks.md`

## Continuation

After status, do not auto-resume unless the user invoked `/chill-ai continue`. Show the next safe action using `/chill-ai`, whether a gate blocks auto-run, and whether the workflow is interrupted-but-resumable.
