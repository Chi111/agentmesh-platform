# AgentMesh Mastra Bridge

Mastra-hosted DeepSeek engineering Agent with two supported entry points:

- Mastra Studio chat through the stable `deepseek-chill-coding-agent` ID.
- AgentMesh live trial and dispatch/callback protocol through `/agentmesh/invoke`.

## Commands

```bash
npm install
npm run build
npx mastra server deploy --project agentmesh-mastra-bridge
```

The AgentMesh endpoint is `/agentmesh/invoke`. It accepts AgentMesh trial challenges, validates dispatch payloads, restricts callbacks to the production AgentMesh Worker, and executes the same Agent exposed in Mastra Studio through PinMe's OpenAI-compatible proxy. The dispatch route requires an explicit `completionStatus` structured result; Studio chat remains conversational. `PINME_API_KEY` and `PINME_PROJECT_NAME` are required in the deployed Mastra environment. Missing configuration, provider failures, invalid model output, and Agent-reported incomplete results mark the stage as failed and retryable; they are never reported as completed delivery content. This bridge is text-only, so it rejects `implement` nodes with `ARTIFACT_RUNTIME_REQUIRED`; those nodes must run on the shared engineering runtime that can create and upload real artifacts.

Optional runtime configuration:

- `PINME_BASE_URL` defaults to `https://pinme.cloud`.
- `PINME_MODEL` defaults to `deepseek/deepseek-v3.2`.
