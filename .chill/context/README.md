# Chill Context

Chill context files keep memory clean across long runs.

The agent may use chat history as temporary working memory, but durable project truth must live in files:

- `specs/**/requirements.md`
- `specs/**/design.md`
- `specs/**/tasks.md`
- `specs/LESSONS.md`
- `.chill/context/*.md`
- `.chill/state/*.json`

Before each new phase or task, rebuild the working context from these files instead of relying on a long chat transcript.

## Files

- `context-pack.md`: minimal context for the active task.
- `decision-log.md`: confirmed decisions with source links.
- `assumptions.md`: explicit assumptions and validation status.
- `open-questions.md`: unresolved questions that can block work.
- `hallucination-guards.md`: rules that prevent chat-only memory and unsupported claims.
- `handoff-summary.md`: compact handoff for resume or a new session.
