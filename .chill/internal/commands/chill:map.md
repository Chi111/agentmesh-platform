# /chill:map

Render or validate the current Chill Mermaid diagrams.

## Usage

```text
/chill:map
/chill:map bug
/chill:map subagents
```

## Workflow

1. Read `.chill/diagrams/main-flow.mmd`.
2. Optionally read a specific diagram by name.
3. Compare diagrams with `.chill/internal/commands/`, `.chill/nodes/`, and `.chill/skills-map.md`.
4. Report stale or missing nodes.
5. Output Mermaid source for display.
6. Do not regenerate the core workflow diagrams from PRD content. The standard diagrams are the source of truth.

## Output

- Main workflow diagram.
- Optional subagent or bug workflow diagram.
- Drift warnings when command/node files do not match the diagram.

## Continuation

After checking diagrams, continue automatically to internal `chill:run` unless diagram drift blocks execution.
