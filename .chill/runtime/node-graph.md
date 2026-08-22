# Chill Node Graph Runtime

Use this file when a route needs more than a linear command handoff.

## Ruflo-style influence

Chill borrows the useful parts of generic workflow engines: explicit nodes, typed inputs, typed outputs, resumable state, and small executors. It does not replace Chill's software-engineering policies with a generic graph. The orchestrator still owns product decisions, gates, context hygiene, and final merge responsibility.

## Node Contract

Each node must declare:

```text
id: stable node id
purpose: one sentence
inputs: durable files or route payloads
outputs: durable files, evidence, state updates
allowed tools: read/write/test/review/deploy scope
gates: conditions that pause or require approval
resume: next safe command or node id
```

## Standard Graph

```text
N0 route
-> N1 project scan
-> N2 clarify
-> N3 specs
-> N4 task plan
-> N5 dispatch
-> N6 review gate
-> N7 QA gate
-> N8 context reset
-> N9 finish
-> N11 deploy when requested
```

Lightweight goal work uses a smaller graph:

```text
N0 route
-> G1 goal file
-> G2 focused inspect
-> G3 implement
-> G4 verify
-> N6 review gate when files changed
-> N9 finish
```

Bug work may branch:

```text
N0 route
-> B1 bug source
-> B2 triage
-> B3 reproduce
-> B4 fix proposal
-> G3 implement selected fix
-> G4 verify regression
-> N6 review gate
-> N7 QA gate
```

## Execution Rules

- Run nodes serially when they touch shared contracts, migrations, auth, payment, security, privacy, or deployment.
- Run nodes in waves only when ownership and file boundaries are independent.
- Persist state after every node transition.
- Return compact evidence from specialist agents; the main agent verifies before merging.
- Treat repeated node failure as a gate, not as permission to keep retrying blindly.

## State Shape

Record node state inside `.chill/state/workflow-state.json`:

```json
{
  "route": "goal",
  "node": "G4-verify",
  "status": "running",
  "nextSafeCommand": "/chill-ai continue",
  "evidence": [".chill/goals/example.md"]
}
```
