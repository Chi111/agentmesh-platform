# LangGraph workflow compiler QA

Status: PASS
Date: 2026-08-23

- `npm test --workspace backend`: 5 files, 71 tests passed.
- `WRANGLER_LOG_PATH=/private/tmp/agentmesh-langgraph-wrangler.log npm run build:worker`: passed; 3255.83 KiB raw / 645.47 KiB gzip.
- `npm run build:frontend`: TypeScript and Vite production build passed.
- `npm audit --omit=dev`: 0 vulnerabilities.
- `git diff --check`: passed.

Coverage includes simple versus complex adaptive graph size, complex fan-out/join, approval Gate, one-shot repair, unavailable-model fallback, API compiler metadata, budget equality and upstream error secret non-persistence.

Browser E2E was not rerun because the frontend behavior change is limited to compile button and toast copy; the production frontend build covers the changed TypeScript path.
