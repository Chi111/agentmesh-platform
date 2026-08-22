# AGENTS.md

## Overview

This is a Pinme full-stack project template:

- `frontend/`: Frontend, Vite + React + TypeScript
- `backend/`: Backend, Cloudflare Worker
- `db/`: D1 database migrations

Prioritize keeping the template structure clean. Avoid unrelated refactoring.

## Key Directories

- `package.json`: Root-level scripts
- `pinme.toml`: Project configuration
- `frontend/src/`: Frontend code
- `backend/src/worker.ts`: Backend entry point
- `backend/wrangler.toml`: Worker configuration
- `db/001_init.sql`: Initial database schema

## Modification Guidelines

- For frontend changes, prefer editing `frontend/src/`
- For backend changes, prefer editing `backend/src/worker.ts`
- When modifying configuration, check both `pinme.toml` and `backend/wrangler.toml`
- Do not arbitrarily modify platform-related files like `backend/metadata.json`
- Keep changes minimal. Avoid over-engineering the template.

## Common Commands

- Install dependencies: `npm install`
- Start backend: `npm run dev`
- Start frontend: `npm run dev:frontend`
- Build backend: `npm run build:worker`
- Build frontend: `npm run build:frontend`
- Full build: `npm run build`
- Redeploy after code changes: use only `pinme save`; do not use `pinme upload`

## Platform API Conventions

Reference documentation: `docs/worker_service_api.md`

- Workers call internal platform services using the project-level `X-API-Key`, not JWT
- `X-API-Key` is typically returned by `pinme create`
- Send email endpoint: `POST /api/v4/send_email`
- Chat completions endpoint: `POST /api/v1/chat/completions?project_name=<project_name>`
- When calling `chat/completions`, the `project_name` must belong to the same project as the `X-API-Key`
- `send_email` returns the platform's standard JSON wrapper
- `chat/completions` may return plain JSON or a streaming response
- Documentation examples read `API_KEY`, `PROJECT_NAME` from Worker environment variables by default, with an optional `BASE_URL`
- When adding new platform API calls, reuse existing request patterns and include at minimum:
  - `X-API-Key`
  - `Content-Type: application/json`

## Pre-commit Checklist

- Only modify files related to the current task
- Run the corresponding build command before finishing
- If database-related logic was changed, verify consistency with `db/001_init.sql`
