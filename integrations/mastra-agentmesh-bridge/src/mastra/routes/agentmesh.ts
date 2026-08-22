import { registerApiRoute } from '@mastra/core/server';
import { isPinmeLlmConfigured } from '../models/pinme-openai';

const AGENTMESH_ORIGIN = 'https://agentmesh-platform-74a3.api.pinme.pro';
const MAX_REQUEST_BYTES = 100_000;

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function nonEmptyString(value: unknown, maxLength = 10_000): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function deliverableText(value: unknown): string | null {
  const direct = nonEmptyString(value, 50_000);
  if (direct) return direct;
  const nested = objectValue(value);
  if (!nested) return null;
  for (const key of ['narrative', 'content', 'text', 'copy', 'script', 'body', 'markdown']) {
    const candidate = nonEmptyString(nested[key], 50_000);
    if (candidate) return candidate;
  }
  return null;
}

function parseAgentJson(content: string): JsonObject | null {
  try {
    const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = objectValue(JSON.parse(normalized) as unknown);
    if (!parsed || !nonEmptyString(parsed.summary, 20_000)) return null;
    const deliverable = deliverableText(parsed.deliverable);
    return deliverable ? { ...parsed, deliverable } : null;
  } catch {
    return null;
  }
}

function callbackAgentId(url: URL): string | null {
  if (url.origin !== AGENTMESH_ORIGIN) return null;
  const match = url.pathname.match(/^\/api\/hooks\/agents\/([^/]+)\/events$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export const agentmeshEndpointInfo = registerApiRoute('/agentmesh/invoke', {
  method: 'GET',
  requiresAuth: false,
  openapi: {
    summary: 'AgentMesh Mastra bridge metadata',
    tags: ['AgentMesh'],
    responses: { 200: { description: 'Bridge metadata' } },
  },
  handler: async c => c.json({
    name: 'AgentMesh Mastra Bridge',
    runtime: 'mastra',
    protocol: 'agentmesh.dispatch.v2',
    method: 'POST',
    status: isPinmeLlmConfigured ? 'ready' : 'configuration-required',
    llmConfigured: isPinmeLlmConfigured,
  }),
});

export const agentmeshEndpoint = registerApiRoute('/agentmesh/invoke', {
  method: 'POST',
  requiresAuth: false,
  openapi: {
    summary: 'Execute an AgentMesh stage with Mastra',
    tags: ['AgentMesh'],
    responses: {
      202: { description: 'Stage accepted and callback submitted' },
      400: { description: 'Invalid dispatch payload' },
      502: { description: 'AgentMesh callback rejected' },
    },
  },
  handler: async c => {
    const challenge = c.req.header('X-AgentMesh-Trial')?.trim();
    if (challenge) {
      return c.json({
        challenge,
        status: 'accepted',
        output: { runtime: 'mastra', protocol: 'agentmesh.trial.v1' },
      });
    }

    const contentLength = Number(c.req.header('Content-Length') ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) return c.json({ error: 'Request body is too large' }, 413);

    let body: JsonObject;
    try {
      const parsed = await c.req.json() as unknown;
      body = objectValue(parsed) ?? {};
    } catch {
      return c.json({ error: 'Request body must be a JSON object' }, 400);
    }
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_REQUEST_BYTES) {
      return c.json({ error: 'Request body is too large' }, 413);
    }

    const task = objectValue(body.task);
    const mission = objectValue(task?.mission);
    const stage = objectValue(task?.stage);
    const callback = objectValue(body.callback);
    const missionId = nonEmptyString(mission?.id, 120);
    const stageId = nonEmptyString(stage?.id, 120);
    const runId = nonEmptyString(callback?.runId, 120);
    const expiresAt = nonEmptyString(callback?.expiresAt, 60);
    const signature = nonEmptyString(callback?.signature, 256);
    const callbackUrlText = nonEmptyString(callback?.url, 2_000);
    if (!task || !mission || !stage || !missionId || !stageId || !runId || !expiresAt || !signature || !callbackUrlText) {
      return c.json({ error: 'Invalid AgentMesh dispatch payload' }, 400);
    }
    if (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
      return c.json({ error: 'Dispatch callback has expired' }, 410);
    }

    let callbackUrl: URL;
    try {
      callbackUrl = new URL(callbackUrlText);
    } catch {
      return c.json({ error: 'Invalid callback URL' }, 400);
    }
    const agentId = callbackAgentId(callbackUrl);
    if (!agentId) return c.json({ error: 'Callback URL is not an approved AgentMesh endpoint' }, 400);

    const stageName = nonEmptyString(stage.name, 300) ?? stageId;
    const stagePosition = Number(stage.position);
    const totalStages = Number(stage.totalStages);
    const completedProgress = Number.isInteger(stagePosition) && Number.isInteger(totalStages) && stagePosition > 0 && totalStages >= stagePosition
      ? Math.round((stagePosition / totalStages) * 100)
      : undefined;
    let result: JsonObject | null = null;
    let failureCode: 'LLM_NOT_CONFIGURED' | 'LLM_GENERATION_FAILED' | 'INVALID_AGENT_OUTPUT' | null = null;
    if (!isPinmeLlmConfigured) {
      failureCode = 'LLM_NOT_CONFIGURED';
    } else {
      try {
        const mastraAgent = c.get('mastra').getAgent('agentmeshBridgeAgent');
        const generated = await mastraAgent.generate([
          'Execute the following complete AgentMesh task.',
          'Match the language of the mission title and description unless they explicitly request another language.',
          'Return the requested artifact as a plain string in the deliverable field, not as a nested object.',
          JSON.stringify(task),
        ].join('\n'));
        result = parseAgentJson(generated.text);
        if (!result) failureCode = 'INVALID_AGENT_OUTPUT';
      } catch {
        failureCode = 'LLM_GENERATION_FAILED';
      }
    }

    const failed = failureCode !== null;
    const source = failed ? 'mastra-error' : 'mastra-agent';
    const failureMessage = failureCode === 'LLM_NOT_CONFIGURED'
      ? 'Mastra 运行时未配置 PinMe LLM，本阶段未生成交付内容，请配置后重试。'
      : failureCode === 'INVALID_AGENT_OUTPUT'
        ? 'Mastra 返回了无效的结构化内容，本阶段未完成，请重试。'
        : failureCode === 'LLM_GENERATION_FAILED'
          ? 'PinMe LLM 调用失败，本阶段未完成，请检查项目配置或余额后重试。'
          : `${stageName} 已由 Mastra 完成`;

    const callbackResponse = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AgentMesh-Signature': signature,
      },
      body: JSON.stringify({
        missionId,
        stageId,
        agentId,
        runId,
        expiresAt,
        callbackId: `mastra-${runId}`,
        status: failed ? 'failed' : 'done',
        progress: failed ? undefined : completedProgress,
        message: failureMessage,
        output: failed
          ? { runtime: 'mastra', source, error: { code: failureCode, retryable: true } }
          : { runtime: 'mastra', source, result },
        payload: { runtime: 'mastra', source, failureCode },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!callbackResponse.ok) {
      return c.json({ error: 'AgentMesh callback was rejected', status: callbackResponse.status }, 502);
    }

    return c.json({ accepted: true, runId, runtime: 'mastra', source, status: failed ? 'failed' : 'done' }, 202);
  },
});
