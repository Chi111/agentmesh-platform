# /chill:approve

Approve a blocked Chill workflow gate.

## Usage

```text
/chill-ai approve {gateId}
/chill:approve {gateId}
```

## Workflow

1. Read the blocked gate from `.chill/state/approvals.json`.
2. Show risk, requested action, changed files, rollback plan, and decision options when present.
3. If the gate is a choice gate, record the selected option or custom user input.
4. If the user approves, record approval and continue.
5. If the user rejects, route back to planning or repair.

Approval is required for high-risk architecture, security holds, destructive operations, production deploys, and credentials.

## Choice Gates

For `stack-choice-*`, approval is not just yes/no. The user should choose one of the proposed options or provide a custom stack.

```text
/chill-ai approve stack-choice-001 option 1
/chill-ai approve stack-choice-001 custom "Next.js + Supabase + Stripe"
```

After selection, write the decision to `.chill/context/decision-log.md`, update specs or design as needed, and continue from `.chill/state/workflow-state.json`.

## Continuation

After approval, continue the blocked command automatically from `.chill/state/workflow-state.json`. After rejection, update state with the revised plan or blocked reason and stop.
