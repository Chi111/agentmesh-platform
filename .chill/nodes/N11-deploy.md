# N11: Deploy

Purpose: safely deploy after build, tests, approval, smoke checks, and rollback planning.

## Steps

1. Detect deployment target.
   - For AWS targets, load `.chill/adapters/aws-mcp.md`.
   - Run AWS MCP read-only discovery before proposing mutations.
2. Build deployment plan.
   - Include AWS account, region, resource name, ARN, current version/alias, artifact, smoke test, and rollback target when relevant.
3. Run preflight checks.
4. Run build and verification.
5. Ask for approval when risk requires it.
6. Deploy.
   - For known AWS operations, use AWS MCP `call_aws`.
   - Use AWS MCP `suggest_aws_commands` only when the operation is uncertain.
7. Smoke test.
   - For AWS Lambda/API Gateway, inspect CloudWatch logs after the smoke check.
8. Roll back or persist deployment result.

## Approval Required

- Production environment.
- Destructive infrastructure changes.
- Missing or newly introduced secrets.
- Database migrations.
- Auth/payment/user data changes.
- Deployment command not previously recorded in project profile.
- AWS mutation, including Lambda, API Gateway, EventBridge, IAM, S3, ECR, ECS, or production alias traffic changes.
- AWS account, region, or rollback target is ambiguous.

## Output

- Deployment plan.
- Environment checklist.
- Build/test evidence.
- Smoke test result.
- AWS account/region/resource evidence when relevant.
- Rollback instructions.
- Lessons.
