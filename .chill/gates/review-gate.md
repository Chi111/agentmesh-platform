# Unified Review Gate

Use this gate before recommending commit or completion for any route that changed project files.

## Purpose

Bring the useful part of Goal + Hooks into Chill: a consistent final gate that checks changed files, sensitive content, and review evidence without forcing every task into the full PRD workflow.

## Inputs

- Active route and state from `.chill/state/workflow-state.json`.
- Active goal from `.chill/state/active-goal.json` when present.
- Changed files from the working tree.
- Relevant durable context: goal file, bugfix spec, requirements, design, tasks, lessons, and decision log.

## Checks

1. Confirm the changed files are in scope for the active route.
2. Scan diffs for obvious secrets, tokens, credentials, private keys, and sensitive personal data.
3. Verify user-facing work is not an empty shell and satisfies `.chill/policies/frontend-dod.md` when relevant.
4. Run focused local verification listed in the goal, bugfix, or tasks file.
5. Run external review when available:

```sh
codex review --uncommitted
```

If the local Codex CLI supports a different review flag, use the closest uncommitted-working-tree review mode and record the actual command.

## Verdicts

```text
Verdict: ALLOW | BLOCK | ERROR
```

- `ALLOW`: no changed files, or review and verification found no blocking issue.
- `BLOCK`: scope mismatch, sensitive content, failed verification, or blocking review finding.
- `ERROR`: the review command or hook failed. Record the error, inspect the review file, and do not hide it.

## Output

Write review evidence under:

```text
.chill/state/review/review-{timestamp}.md
```

Use this shape:

```markdown
# Chill Review Gate

Route: goal|bug|prd|dynamic
Goal: .chill/goals/example.md
Command: codex review --uncommitted
Verdict: ALLOW | BLOCK | ERROR

## Changed Files
- path

## Verification
- command: result

## Findings
- severity file:line issue

## Next Action
commit allowed | fix findings | inspect error | ask user
```

## Continuation

If `ALLOW`, continue to QA or finish according to the active route.

If `BLOCK`, fix the scoped findings and run the gate again. Pause only when the finding requires product judgment, credentials, destructive changes, external mutation, or repeated failed fixes.

If `ERROR`, report the review file and error details, then continue only when the error is understood or the user accepts the risk.
