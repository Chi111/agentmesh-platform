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
Status: waiting-approval
Active command: /chill-ai start specs/008-meshpin-ipfs-evidence
Feature: specs/008-meshpin-ipfs-evidence
Task: T1
Agent: planner waiting
Gate: meshpin-ipfs-evidence-004
Next safe action: review the MeshPin/MPIN and PinMe IPFS evidence plan; implementation remains paused
Resume: /chill-ai approve meshpin-ipfs-evidence-004 option 1

Latest Feature:
MeshPin/MPIN branding and PinMe IPFS deliverable evidence specs are ready on `codex/meshpin-ipfs-evidence`. The recommended plan uses uploader-owned PinMe CLI authentication, canonical CID + Manifest version chains, immutable acceptance/dispute snapshots and legacy compatibility. No implementation or deployment has started. The separate `platform-infrastructure-002` gate remains pending and unapproved.
