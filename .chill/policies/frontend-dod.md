# Frontend Definition Of Done

Use this policy whenever the PRD or specs mention member apps, admin screens, dashboards, workbenches, forms, booking, checkout, refunds, exports, review queues, notifications, or any user-facing workflow.

## Non-Negotiable Rule

A static landing page, scope dashboard, card grid, or text-only feature summary does not satisfy a product UI requirement.

If a task claims a user-facing feature is complete, the UI must include the actual workflow a target user would perform.

## Minimum Product UI Requirements

For each user-facing feature, require:

- Route or navigable view for the target role.
- Real data loading from an API, typed client, or explicit mock service contract.
- At least one meaningful user action when the PRD describes an operation.
- Loading, empty, error, permission, and success states where relevant.
- Form validation for user input.
- State change visible after submit, cancel, approve, export, check in, book, or similar action.
- Accessible labels, keyboard path for primary controls, and responsive layout.
- Browser verification that performs the workflow, not only text presence checks.

## Static UI Limit

Static cards are allowed only for:

- marketing or landing pages explicitly requested by the PRD,
- status/readme-style project overview pages,
- temporary placeholders clearly marked incomplete in `tasks.md`.

Static cards must not be counted as completion for:

- member app,
- front desk workbench,
- coach workbench,
- admin console,
- booking flow,
- checkout/payment/refund flow,
- check-in flow,
- dashboard filters,
- finance export,
- AI review queue,
- notification center.

## API Integration Rule

When backend routes or services exist for a feature, the frontend should call them or use a typed adapter that can be switched to the real route without changing the UI contract.

If the UI intentionally uses mock data, record the mock contract and remaining integration task in `tasks.md`. QA must not mark the feature complete unless the PRD scope explicitly allows mock-only UI.

## Review Failure Conditions

Return `NEEDS_FIX` when:

- the UI only summarizes capabilities in cards or text,
- no user action is implemented for an operational requirement,
- browser QA only checks that labels render,
- backend routes exist but the frontend has no integration path,
- a task says "view", "workbench", "dashboard", or "app" but only one static page exists.

## QA Evidence Required

For user-facing features, QA evidence must include:

- URL or route tested.
- Role or actor used.
- Steps performed.
- API/mock data source used.
- Expected state change.
- Screenshot or browser assertion for final state.
- Any skipped interaction and the reason it remains incomplete.
