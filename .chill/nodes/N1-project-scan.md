# N1: Project Scan

Purpose: understand the project before generating workflow behavior.

## Steps

1. Resolve project root.
2. Identify package managers, frameworks, runtime, database, and test stack.
3. Read existing docs and rules.
4. Detect common commands.
5. Detect modules and ownership boundaries.
6. Write the project profile into `.chill/CHILL.md`.

## Empty Project Behavior

If the project has no source layout or stack signal, do not invent a stack silently. Create a `stack-choice-*` gate with three recommended options and a custom input path.

Base recommendations on:

- PRD product type and user surfaces.
- Backend complexity and data sensitivity.
- AI/data needs.
- Expected deployment target.
- Team/runtime simplicity.

## Output

- Tech stack summary.
- Module map.
- Commands table.
- Recommended subagents.
- Stack choice options when no stack exists.
