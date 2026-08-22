# /chill:finish

Finish a Chill workflow run.

## Usage

```text
/chill:finish
```

## Workflow

1. Verify all required tasks are marked complete or explicitly dropped.
2. Summarize completed features and open risks.
3. Sync docs that changed because of implementation.
4. Update `specs/LESSONS.md` with useful non-obvious lessons.
5. Print final Mermaid links and command summary.

Do not run internal `chill:finish` while `.chill/state/workflow-state.json` is still `running` with a pending task or next safe command. Continue internal `chill:run` instead.

## Output

```text
Chill Workflow finished
Features: {done}/{total}
Tasks: {done}/{total}
Review: {status}
QA: {status}
Lessons: {count}
Open risks: {items}
```

## Continuation

After finish, ask whether to start another `/chill-ai start`, run `/chill-ai bug`, inspect audit/lessons, or pause.
