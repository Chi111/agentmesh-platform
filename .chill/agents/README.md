# Agent Registry

The Agent Registry tracks available Chill agents, their scope, permissions, and runtime status.

Use this before dispatching subagents. A task can only be assigned to an agent whose `capabilities`, `allowedTools`, and `policyScope` match the task.

Global specialist briefs may live in `~/.claude/agents/` or `~/.codex/agents/`.
The registry maps those reusable capabilities into this project workflow without
copying their full prompts into every `.chill/` directory.

## Rules

- Do not dispatch an unregistered agent.
- Do not let a specialist agent mutate files outside its scope.
- Do not let an agent call cloud, secret, deployment, or destructive tools unless its registry entry allows it and the gateway policy permits it.
- Record agent handoffs in `.chill/state/audit-log.jsonl`.
- Update agent status in mission-control summaries.
- Keep reusable role behavior in global agent files; keep project ownership,
  routing, context, and risk policy in `.chill/agents/registry.json`.

## Registry File

See `.chill/agents/registry.json`.
