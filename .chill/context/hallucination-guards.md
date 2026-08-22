# Hallucination Guards

## No chat-only facts

If a claim exists only in chat history and not in a source file, it is not project truth.

Accepted sources:

- PRD or docs under `docs/`
- `specs/**/requirements.md`
- `specs/**/design.md`
- `specs/**/tasks.md`
- `specs/LESSONS.md`
- `.chill/context/decision-log.md`
- `.chill/context/assumptions.md`
- `.chill/context/open-questions.md`
- `.chill/state/*.json`
- Code and tests in the target project

## Rules

- Before implementation, rebuild context from files.
- Before review, reject unsupported requirements or design claims.
- Before QA, trace every acceptance result to a requirement or task.
- Before resume, ignore stale chat summaries unless they were written to `.chill/context/`.
- After context compression or clear, rebuild from durable files before acting.
- For unrelated or noisy work, use `.chill/policies/context-firewall.md` and dispatch a subagent instead of loading all details into the main context.
- If memory conflicts with files, files win.
- If files conflict with each other, pause and ask.
