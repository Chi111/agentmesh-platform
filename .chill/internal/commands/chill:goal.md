# /chill:goal

Run a bounded natural-language goal through the Lightweight Goal Loop.

## Usage

```text
/chill:goal {goal text}
/chill:goal --file .chill/goals/2026-06-27-fix-login-button.md
```

Users normally invoke this through `/chill-ai {goal text}`. This internal stage exists so the public router can keep small work light without promoting it into a full PRD/spec workflow.

## Lightweight Goal Loop

Use this route when the task is a single bounded code or documentation change, a small bug, or a focused regression that can be completed with local inspection and verification.

Do not use this route when:

- the work needs product requirements, architecture choices, task waves, or deployment planning;
- bug source triage, CI logs, or reproduction research would load noisy context;
- auth, payment, privacy, migrations, production, credentials, or destructive actions are involved;
- multiple modules or shared contracts need coordinated edits.

Promote those cases to `chill:bug`, `chill:from-prd`, or a dynamic workflow plan.

## Source Files

Lightweight goal work writes:

```text
.chill/goals/{date}-{slug}.md
.chill/state/active-goal.json
.chill/context/context-pack.md
.chill/state/audit-log.jsonl
```

Use `.chill/goals/` for project-local goal files. Do not write to external goal-hook state unless the user explicitly asks to integrate that installation.

## Goal File Contract

Create or update the goal file before editing project code:

```markdown
# {Short Goal}

## Request
{Original user request}

## Scope
- In scope: {bounded files, behavior, or module}
- Out of scope: {nearby work intentionally skipped}

## Assumptions
- {Only durable assumptions, not chat-only guesses}

## Acceptance Criteria
- {Observable behavior}
- {Regression or verification command}

## Plan
- [ ] Inspect relevant files
- [ ] Implement the focused change
- [ ] Run focused verification
- [ ] Run review gate if code changed

## Evidence
- {Commands, screenshots, tests, or review files}
```

## Workflow

1. Read `.chill/runtime/router.md` and confirm the route is still `goal`.
2. Create `.chill/goals/{date}-{slug}.md` if the input is inline text.
3. Write `.chill/state/active-goal.json` with goal path, route `goal`, status `running`, and next safe command.
4. Read `.chill/context/hallucination-guards.md` and `.chill/policies/context-firewall.md`.
5. Inspect the smallest relevant project files before editing.
6. Write assumptions into the goal file before coding around them.
7. Implement the focused change.
8. Run the most specific verification that proves the acceptance criteria.
9. If any project file changed, load `.chill/gates/review-gate.md` and apply it before recommending commit.
10. Append an audit event and set state to `completed`, `waiting-input`, `waiting-approval`, or `failed`.

## Escalation

Upgrade from `goal` to another route when the work expands:

| Signal | Upgrade |
| --- | --- |
| Reproduction requires logs, CI, external services, or multiple theories. | `chill:bug` |
| User asks for a new feature from product intent. | `chill:from-prd` |
| Multiple specialists or independent task waves are useful. | dynamic plan then `chill:run` |
| Commit should be blocked by external review. | continue goal loop, then review gate |

## Output

```text
Goal: {goal file}
Route: goal
Status: completed | waiting-input | waiting-approval | failed
Verification: {commands or evidence}
Review gate: ALLOW | BLOCK | ERROR | not-run
Next: /chill-ai continue | /chill-ai status | commit allowed
```
