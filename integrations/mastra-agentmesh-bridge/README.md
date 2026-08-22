# AgentMesh Mastra Bridge

Mastra-hosted Agent endpoint that implements the AgentMesh live trial and dispatch/callback protocol.

## Commands

```bash
npm install
npm run build
npx mastra server deploy --project agentmesh-mastra-bridge
```

The public Agent endpoint is `/agentmesh/invoke`. It accepts AgentMesh trial challenges, validates dispatch payloads, restricts callbacks to the production AgentMesh Worker, executes the registered Mastra Agent through PinMe's OpenAI-compatible proxy when `PINME_API_KEY` and `PINME_PROJECT_NAME` are configured, and otherwise returns an explicitly labeled deterministic fallback.

Optional runtime configuration:

- `PINME_BASE_URL` defaults to `https://pinme.cloud`.
- `PINME_MODEL` defaults to `openai/gpt-4o-mini`.
