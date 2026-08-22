# N4: Task Plan

Purpose: build a safe execution order.

## Steps

1. Read `tasks.md`.
2. Detect explicit dependencies.
3. Detect implicit dependencies from files, modules, API contracts, schema, and shared types.
4. Build serial and parallel batches.
5. Mark tasks that require user confirmation before implementation.

## Decision Table

| Condition | Execution |
| --- | --- |
| Same file or shared schema | Serial |
| API contract before frontend integration | Serial |
| Different modules with no shared contract | Parallel |
| Documentation and isolated tests | Parallel |
