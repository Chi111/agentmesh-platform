# /chill:deploy

Plan and execute deployment with approval, smoke tests, and rollback.

In the realtime visualizer, deployment appears in a separate Deploy Workshop instead of the main task field. Finished work is shipped from the main workflow into a packaging line, then delivered to the server room after smoke checks pass.

## Usage

```text
/chill:deploy {environment}
/chill:deploy staging
/chill:deploy production
/chill:deploy lambda
```

## Workflow

1. Load project profile.
   - `.chill/CHILL.md`
   - `.chill/skills-map.md`
   - `specs/LESSONS.md`
2. Identify deployment target.
   - Static frontend
   - Node/API server
   - AWS Lambda
   - Cloudflare Worker
   - Container
   - Other project-specific target
   - If AWS resources are involved, load `.chill/adapters/aws-mcp.md`.
3. Build deployment plan.
   - Artifact to deploy
   - Build command
   - Test command
   - Required secrets
   - Environment variables
   - Deployment command
   - Smoke test
   - Rollback plan
   - For AWS targets, include account ID, region, service/resource name, ARN if available, and exact AWS MCP command candidates.
4. Run preflight checks.
   - Working tree status
   - Required secrets present
   - Build command exists
   - Test command exists
   - Target environment known
   - For AWS targets, run AWS MCP read-only discovery before any mutation.
   - Confirm AWS account, region, resource identity, current version/alias, log group, and rollback target.
5. Run verification.
   - Install/build if needed
   - Tests
   - Lint/typecheck if available
6. Approval Gate.
   - Required for production
   - Required for destructive infra changes
   - Required when secrets or credentials are missing
7. Deploy.
   - Execute only after approval when required
   - Capture logs and artifact IDs
   - For known AWS operations, use AWS MCP `call_aws`.
   - If the AWS service or operation is unclear, use AWS MCP `suggest_aws_commands` before proposing a command.
8. Smoke test.
   - Health endpoint
   - Homepage/API check
   - Scheduled job check if relevant
   - For Lambda/API Gateway, invoke or request the deployed path and inspect CloudWatch logs.
9. Persist results.
   - Deployment summary
   - Smoke test output
   - Rollback instructions
   - Lessons

## Runtime Safety

Before deploy planning or execution:

1. Read `.chill/agents/registry.json` and use the deploy agent identity.
2. Read `.chill/policies/identity.md` and `.chill/policies/gateway.md`.
3. Treat deploy mutations as `approval-required`.
4. Use `.chill/runtime/idempotency.md` to avoid repeating deploy mutations.
5. Use `.chill/runtime/retry-policy.md` only for safe read-only discovery or smoke checks.
6. Write deploy status to `.chill/state/audit-log.jsonl` and `.chill/mission-control.md` summary.

## Output

```text
Deployment: READY | BLOCKED | DEPLOYED | ROLLED_BACK
Target: {target}
Environment: {environment}
Build: {status}
Tests: {status}
Approval: {required/approved/not required}
Smoke: {status}
Rollback: {instructions}
AWS: {account/region/resource/arn when relevant}
```

## Stop Conditions

- Environment is production and approval is missing.
- Required secrets are missing.
- Build or tests fail.
- Target environment cannot be identified.
- Deployment would overwrite or destroy resources.
- AWS account or region is unexpected.
- AWS target resource cannot be uniquely identified.
- AWS rollback target is unknown.

## Continuation

After deployment planning or execution, ask whether to approve/deploy, run smoke tests, run rollback, inspect logs, or pause.
