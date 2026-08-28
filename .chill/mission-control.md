# Mission Control

Mission Control is the human-readable inbox for long-running Chill workflows.

It answers:

- What is running?
- What is waiting for approval?
- What failed?
- What is complete?
- What can safely resume?

## Status Buckets

- `running`: active command/task.
- `waiting-input`: clarify questions or missing credentials.
- `waiting-approval`: approval gates.
- `failed`: review, QA, deploy, or tool failures.
- `completed`: finished tasks or workflow.

## Data Sources

- `.chill/state/workflow-state.json`
- `.chill/state/audit-log.jsonl`
- `.chill/state/approvals.json`
- `.chill/context/handoff-summary.md`
- `.chill/agents/registry.json`
- `.chill/runtime/observability.md`

## Output Shape

```text
Mission Control
Status: running | waiting-input | waiting-approval | failed | completed
Active command:
Feature:
Task:
Agent:
Gate:
Next safe action:
Resume:
```

## Rules

- `/chill-ai status` should show Mission Control by default.
- `/chill-ai continue` should use Mission Control only as a summary, not as source of truth.
- Source of truth remains state, specs, context, and code files.

## Current

Mission Control
Status: completed
Active command: /chill-ai finish specs/008-meshpin-ipfs-evidence
Feature: specs/008-meshpin-ipfs-evidence
Task: T12 + deployment follow-up
Agent: implementation completed
Gate: none
Next safe action: observe the deployed Sepolia test release; require a new gate for mainnet or extra infrastructure
Resume: no pending workflow action

Latest Feature:
pinme-mesh/PM branding and PinMe IPFS deliverable evidence are implemented and split-deployed on `codex/meshpin-ipfs-evidence`. D1, Worker, independent PinMe Domain, PM Sepolia contracts, reversible reward/staking smoke and public-RPC cleanup verification are complete. The separate `platform-infrastructure-002` gate remains pending and unapproved.
