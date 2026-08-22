# Context Firewall

Keep the main agent's working context focused on the active project task.

## Purpose

The main agent owns decisions, workflow state, merge responsibility, and final user-facing output. Subagents absorb isolated exploration and noisy work so unrelated questions do not pollute the main thread.

## Source Of Truth

Chat history is temporary. Durable project truth comes from:

- `.chill/state/*.json`
- `.chill/context/context-pack.md`
- `.chill/context/handoff-summary.md`
- `.chill/context/decision-log.md`
- `.chill/context/assumptions.md`
- `.chill/context/open-questions.md`
- `specs/**`
- `specs/LESSONS.md`
- Code, tests, docs, and committed project files

Automatic context compression is allowed, but it is not a source of truth. After compression, interruption, resume, bug intake, or task switch, rebuild context from files before acting.

## Dispatch Defaults

Dispatch to a subagent when work is independent and likely to add noise:

- unrelated user questions that do not affect the active project decision
- bug reproduction in an isolated module
- logs, test output, CI failure, or deployment preflight analysis
- documentation, API, or dependency research
- screenshot/browser QA for an isolated surface
- code review of a bounded module
- exploratory implementation options that do not require shared-file edits

Keep work in the main agent when it affects shared ownership:

- architecture decisions
- cross-module contracts or shared types
- database migrations or data retention
- auth, payment, security, privacy, permissions, or production deploy gates
- files that multiple tasks may edit
- user-facing scope or acceptance criteria changes

## Subagent Contract

When dispatching:

1. Send the smallest sufficient task brief.
2. Include only relevant source paths, requirements, constraints, and expected output.
3. Tell the subagent not to rely on long chat history.
4. Require a compact return payload:
   - conclusion
   - files inspected or changed
   - evidence such as command output summaries, screenshots, or test names
   - risks or open questions
   - recommended next action
5. Do not merge subagent findings into project truth until the main agent verifies them against files.

## Main Context Hygiene

- Keep unrelated answers out of `.chill/context/context-pack.md`.
- Record reusable lessons in `specs/LESSONS.md` only when they affect future project work.
- Record uncertain claims in `.chill/context/assumptions.md` or `.chill/context/open-questions.md`.
- If a subagent result conflicts with durable files, files win until verified.
- If a subagent needs risky tools, credentials, network, cloud mutation, or destructive operations, pause through the gateway policy instead of delegating blindly.

## Resume Behavior

`/chill-ai continue` must:

1. Ignore stale chat details that are not written to durable files.
2. Rebuild the active context pack.
3. Check whether the interrupted work can remain in the main agent.
4. Dispatch isolated investigation before loading noisy logs or unrelated material into the main context.
