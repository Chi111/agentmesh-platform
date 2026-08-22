# Chill Skills And Subagents Map

This file maps project signals to subagents. A real project should regenerate this file after `/chill-ai start` runs the internal project scan.

| Signal | Subagent | Responsibility |
| --- | --- | --- |
| React, Vue, Svelte, Next, routes, components | Frontend Subagent | UI, state, routing, API integration, visual verification |
| Express, Hono, FastAPI, Rails, Spring, API routes | Backend Subagent | API contracts, service logic, error handling |
| SQL, ORM, migrations, schema files | Database Subagent | Schema design, migrations, data access, rollback notes |
| Auth, payment, secrets, user data | Security Subagent | Threat checks, secret handling, access boundaries |
| Tests, Playwright, Cypress, Vitest, pytest | QA Subagent | Test coverage, acceptance criteria, regression checks |
| Lambda, CI/CD, deploy scripts, hosting config | Deploy Subagent | Release plan, preflight, approval, smoke test, rollback |
| README, docs, changelog, specs drift | Docs Subagent | Documentation sync and final handoff |
| Jira, GitHub Issues, local bugs.json | Bug Subagent | Bug triage, reproduction plan, daily digest |

## Senior Skill Pack

These are role skills that model strong developer habits. They should be used as review lenses or subagents inside internal `chill:run`, not as always-on prompts. Read the specific role file from `.chill/senior-skills/` only when needed.

| Role Skill | Use When | Senior Behavior |
| --- | --- | --- |
| Principal Architect | `.chill/senior-skills/principal-architect.md` | Architecture and cross-module design |
| Staff Product Engineer | `.chill/senior-skills/staff-product-engineer.md` | Product clarification and feature slicing |
| Senior Frontend Engineer | `.chill/senior-skills/senior-frontend-engineer.md` | UI, state, routing, visual workflows |
| Senior Backend Engineer | `.chill/senior-skills/senior-backend-engineer.md` | APIs, services, integrations |
| Database Reliability Engineer | `.chill/senior-skills/database-reliability-engineer.md` | Schema, migrations, data safety |
| Security Reviewer | `.chill/senior-skills/security-reviewer.md` | Auth, payment, secrets, user data |
| QA Automation Engineer | `.chill/senior-skills/qa-automation-engineer.md` | Acceptance, E2E, regressions |
| DevOps Release Engineer | `.chill/senior-skills/devops-release-engineer.md` | CI/CD, Lambda, deploy, rollback |
| Code Review Lead | `.chill/senior-skills/code-review-lead.md` | Diff review before task completion |

## Dispatch Rules

- Dispatch in parallel only when tasks touch different files or modules and have no dependency.
- Keep shared contracts serial: API schema, database schema, shared types, and permissions.
- Merge all subagent outputs before review.
- If a subagent reports missing information, route to Clarify Loop instead of inventing business rules.
- Use Senior Skill Pack roles as gates when task risk is medium or higher.
