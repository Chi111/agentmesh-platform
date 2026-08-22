# N5: Subagent Dispatch

Purpose: assign well-bounded work to specialist subagents.

## Steps

1. Match task to subagent using `.chill/skills-map.md`.
2. Provide only the necessary context: task, relevant spec sections, project rules, and target files.
3. Require structured output: files changed, verification run, risks, and follow-up needs.
4. Merge outputs before review.

## Safety Rules

- Do not dispatch vague business decisions.
- Do not dispatch tasks that mutate the same shared file in parallel.
- Do not accept subagent success without checking the diff and running gates.
