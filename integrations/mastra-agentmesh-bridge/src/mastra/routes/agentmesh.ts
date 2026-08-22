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

function parseAgentJson(content: string): JsonObject | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return objectValue(parsed);
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
    status: 'ready',
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

    const missionTitle = nonEmptyString(mission.title, 500) ?? missionId;
    const stageName = nonEmptyString(stage.name, 300) ?? stageId;
    const stagePurpose = nonEmptyString(stage.purpose, 4_000) ?? 'Complete the assigned workflow stage.';
    const fallback: JsonObject = {
      summary: `Mastra 已完成“${stageName}”的结构化处理。`,
      findings: [`任务：${missionTitle}`, `阶段目标：${stagePurpose}`],
      risks: [isPinmeLlmConfigured
        ? 'PinMe LLM 本次调用不可用，当前结果来自 Mastra 确定性降级运行时。'
        : '未配置 PinMe LLM，当前结果来自 Mastra 确定性降级运行时。'],
      recommendation: isPinmeLlmConfigured
        ? '可安全重试本阶段；若问题持续，请检查 PinMe LLM 服务状态与项目余额。'
        : '配置 PINME_API_KEY 与 PINME_PROJECT_NAME 后重新派发，可获得模型生成的深度结果。',
    };

    let result = fallback;
    let source = 'deterministic-fallback';
    if (isPinmeLlmConfigured) {
      try {
        const mastraAgent = c.get('mastra').getAgent('agentmeshBridgeAgent');
        const generated = await mastraAgent.generate(JSON.stringify({ mission, stage }));
        const parsed = parseAgentJson(generated.text);
        if (parsed) {
          result = parsed;
          source = 'mastra-agent';
        }
      } catch {
        // Preserve a usable, explicitly labeled fallback when the provider is unavailable.
      }
    }

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
        status: 'done',
        progress: 100,
        message: `${stageName} 已由 Mastra 完成`,
        output: { runtime: 'mastra', source, result },
        payload: { runtime: 'mastra', source },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!callbackResponse.ok) {
      return c.json({ error: 'AgentMesh callback was rejected', status: callbackResponse.status }, 502);
    }

    return c.json({ accepted: true, runId, runtime: 'mastra', source }, 202);
  },
});
