# Google Pattern Alignment

Chill combines two Google-style pattern sets: skill content design and long-running agent runtime design.

## Skill Patterns

| Pattern | Chill Usage |
| --- | --- |
| Tool Wrapper | Adapters such as AWS MCP and project-specific stack rules are loaded only when needed. |
| Generator | Internal `chill:prd` generates consistent `requirements.md`, `design.md`, and `tasks.md`. |
| Reviewer | Internal `chill:review`, internal `chill:qa`, and senior role files apply checklist-based gates. |
| Inversion | Clarify Loop asks focused questions before high-impact product or security decisions. |
| Pipeline | Orchestrator enforces scan -> specs -> tasks -> execution -> review -> QA -> finish. |

## Long-Running Agent Patterns

| Pattern | Chill File |
| --- | --- |
| Checkpoint-and-resume | `.chill/state/workflow-state.json`, `audit-log.jsonl`, `/chill-ai continue` |
| Delegated approval | `.chill/state/approvals.json`, `/chill-ai approve` |
| Memory-layered context | `specs/`, `LESSONS.md`, `.chill/context/*.md` |
| Context firewall | `.chill/policies/context-firewall.md`, compact subagent summaries, durable-file verification |
| Ambient processing | `/chill-ai bug`, `bugs/bugs.json`, future Jira or scheduler integration |
| Fleet orchestration | `.chill/agents/registry.json`, `.chill/skills-map.md`, subagent dispatch |

## Design Rule

Keep the skill entry thin. Put the public router in `.chill/commands/chill-ai.md`, reusable procedure in `.chill/internal/commands/`, stable workflow rules in `.chill/orchestrator.md`, and specialist knowledge in references loaded only when needed.
