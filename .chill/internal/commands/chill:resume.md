# /chill:resume

Resume from the persisted Chill workflow state.

## Workflow

1. Read `.chill/state/workflow-state.json`.
2. Rebuild the context pack for the active task.
3. Re-read `.chill/CHILL.md`, relevant specs, and `specs/LESSONS.md`.
4. Continue from the last safe checkpoint.

## Interrupt Resume

If `.chill/state/interrupt.json` exists, compare it with `workflow-state.json` and resume from the later safe checkpoint.

Resume uses Inline Command Chaining: load the command named by `nextSafeCommand` and execute it in the same run instead of telling the user to invoke it manually.

## Clean Resume

Do not resume from long chat memory.

Resume order:

1. Read `.chill/context/hallucination-guards.md`.
2. Read `.chill/state/workflow-state.json`.
3. Read `.chill/state/interrupt.json` when present.
4. Read `.chill/context/context-pack.md`, `decision-log.md`, `assumptions.md`, `open-questions.md`, and `handoff-summary.md`.
5. Rebuild a fresh context pack from durable files.
6. Continue from `nextSafeCommand` only after checking blocked gates.

Resume should continue automatically:

1. If a gate is blocked, show the gate and wait for `/chill-ai approve` or revised input.
2. If the last checkpoint is before task execution, continue internal `chill:run`.
3. If the last checkpoint is after task execution, continue internal `chill:review`.
4. If review passed, continue internal `chill:qa`.
5. If QA passed, mark the task complete and continue the next task.
6. If all tasks are complete, continue internal `chill:finish`.

Do not ask whether to continue unless the saved state says a gate is blocked.

If the saved state is `running` or `interrupted`, execute `nextSafeCommand` immediately. A progress summary from the previous run is not a stop condition.

## Stop Conditions

- State file is missing or corrupt.
- Active task no longer exists.
- Files changed since the last audit entry and conflict with the saved task.

## Continuation

After resume reaches a checkpoint, auto-advance to the next safe command. Ask only when a gate remains blocked or saved state conflicts with current files.
