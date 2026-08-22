# Chill Workflow

Chill is a portable AI development workflow for turning a PRD, bug list, or change request into durable specs, executable tasks, review/QA evidence, and an optional deploy plan.

## Source Of Truth

- Workflow contract: `.chill/orchestrator.md`
- Route and node runtime: `.chill/runtime/router.md`, `.chill/runtime/node-graph.md`
- Unified review gate: `.chill/gates/review-gate.md`
- Google-pattern mapping: `.chill/patterns.md`
- Fixed Mermaid maps: `.chill/diagrams/`
- Project memory: `specs/`, `specs/LESSONS.md`, `.chill/context/`, `.chill/state/`
- Agent runtime policy: `.chill/agents/`, `.chill/policies/`, `.chill/runtime/`
- Product UI completion policy: `.chill/policies/frontend-dod.md`

## Public Entry

Use `/chill-ai` as the human-facing command.

Examples:

```text
/chill-ai start docs/prd.md .
/chill-ai 修复登录按钮无响应
/chill-ai continue
/chill-ai status
/chill-ai approve stack-choice-001 option 1
/chill-ai bug
/chill-ai deploy staging
```

The `chill:*` command files under `.chill/internal/commands/` are internal stage modules. Keep them for routing, checkpointing, and compatibility, but do not require users to remember them.

## Principles

- Route-light: start with `simple` or `goal` when the task is small, then promote only when evidence requires it.
- Project-first: scan the repo before choosing implementation details.
- Spec-first: write requirements, design, and tasks before coding.
- Fixed diagrams: Mermaid maps describe the standard workflow and are not regenerated from PRDs.
- Run-all by default: continue normal phases until completion or a real gate.
- File-backed memory: chat history is a lead, not project truth.
- Human gates for risk: pause for ambiguity, credentials, destructive work, cloud mutation, security, privacy, payment, or repeated failed gates.
- Unified gate before commit: any route that changed files must pass `.chill/gates/review-gate.md` before a commit recommendation.
- Small specialist agents: dispatch only when ownership and dependencies are clear.
- No empty shells: user-facing features require real workflows, not static card summaries.

## Entry Chain

Lightweight goal chain:

```text
/chill-ai 修复登录按钮无响应
-> route goal
-> internal chill:goal
-> focused inspect
-> implement
-> verify
-> unified review gate when files changed
-> finish
```

Full PRD chain:

```text
/chill-ai start docs/prd.md .
-> internal chill:from-prd
-> internal chill:init
-> internal chill:prd
-> internal chill:map
-> internal chill:run
-> internal chill:review
-> internal chill:qa
-> next task or internal chill:finish
-> internal chill:deploy when requested or configured
```

`/chill-ai` is the entry point. Internal stage commands are implementation details, not manual handoffs. When the next stage is safe, load it and continue inline.

## Stop Conditions

Pause only when continuing would be unsafe or dishonest:

- Missing product facts would change behavior.
- Auth, payment, privacy, security, permissions, or data retention is unclear.
- Credentials, external services, cloud mutation, production deployment, or destructive operations are required.
- Review, QA, or security fails twice for the same issue.
- Saved state conflicts with current files.
- The user interrupts.

On pause, write state, audit, context, and approval records, then show `/chill-ai continue` or `/chill-ai approve {gateId}`.

When the pause is a choice rather than a missing credential, include a small option set. Do not make the user invent the next step from scratch.
