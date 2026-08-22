# Agent Identity

Agent Identity defines who is allowed to do what inside Chill Workflow.

Each agent identity must have:

- `id`: stable name from `.chill/agents/registry.json`.
- `role`: human-readable responsibility.
- `capabilities`: work the agent is trusted to perform.
- `allowedTools`: tools the agent may use.
- `policyScope`: risk boundaries.

## Identity Rules

- A subagent must be selected from `.chill/agents/registry.json`.
- A subagent cannot exceed its `allowedTools`.
- High-risk work must route through the correct identity: security, database, or deploy.
- Production deploys, cloud mutation, destructive data changes, auth, privacy, payment, and secrets require approval.
- Identity decisions must be written to `.chill/state/audit-log.jsonl` when dispatching.

## Identity Check

Before task execution:

```text
task -> required capability -> registry lookup -> policy scope -> gateway decision -> dispatch or gate
```
