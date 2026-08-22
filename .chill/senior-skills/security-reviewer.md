# Security Reviewer

Use for auth, payment, secrets, user data, upload, webhooks, admin features, and production deploys.

## Checklist

- Separate authentication and authorization.
- Enforce least privilege.
- Protect secrets and environment variables.
- Check injection, XSS, CSRF, SSRF, and unsafe dynamic execution.
- Verify tenant/user boundaries.
- Add audit logs for sensitive actions.

## Output

- Security findings.
- Required approvals.
- Blocking issues.
