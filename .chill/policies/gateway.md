# Agent Gateway

Agent Gateway is the policy layer between agents, tools, memory, and external systems.

It decides whether an action can proceed, must be transformed into a plan, or must pause for approval.

## Gateway Decisions

- `allow`: safe local read/write/test action.
- `plan-only`: produce command plan but do not execute.
- `approval-required`: write `.chill/state/approvals.json` and pause.
- `deny`: action violates policy or identity scope.

## Policy Checks

Run these checks before tool use:

- Agent identity is registered.
- Tool is listed in `allowedTools`.
- File scope matches task ownership.
- Memory access follows `.chill/context/hallucination-guards.md`.
- Cloud operation is read-only unless approved.
- Secrets are not printed, logged, or inferred.
- Destructive operations have rollback.
- Production deploys require explicit approval.

## AWS MCP Gateway

- `call-aws-read-only`: allowed for discovery.
- `call-aws-mutation`: approval-required.
- IAM, Lambda, API Gateway, EventBridge, S3, ECR, ECS, and production alias changes are mutation unless proven read-only.

## Output

Every blocked decision must include:

- gate ID
- agent ID
- requested action
- risk reason
- rollback or safe alternative
- resume command
