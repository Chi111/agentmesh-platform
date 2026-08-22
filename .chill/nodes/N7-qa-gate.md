# N7: QA Gate

Purpose: prove the task meets acceptance criteria.

## Checks

1. Run detected test commands.
2. Run build/type/lint checks when available.
3. Verify acceptance criteria.
4. For UI changes, verify product workflows with real interactions, not only rendering.
5. For API or database changes, verify integration paths.

## Product UI Evidence

When a PRD requires an app, workbench, dashboard, or operational page, QA evidence must show route, actor, action, data source, state change, and final assertion. Static-card pages fail QA for those requirements.

## Loop

Failures go to Test Fix Loop. After fixes, QA must run again.
