import type {
  Agent,
  Deliverable,
  Dispute,
  LedgerCursor,
  ExecutionEvent,
  IdempotentResult,
  Mission,
  MissionDetail,
  Notification,
  PaymentMethod,
  StageOffer,
  PlatformStore,
  UserContext,
  UserRole,
  WorkflowEdge,
  WorkflowStage,
  WorkflowViewport,
} from './contracts';
import {
  canAccessMission,
  fallbackTrialScore,
  makeId,
  makeMissionId,
  matchCandidates,
  parseTrialScore,
} from './logic';
import {
  callPinmeLlm,
  registerPinmeUser,
  sendPinmeEmail,
  verifyPinmeToken,
  type PinmeEnv,
  type VerifiedIdentity,
} from './pinme';
import {
  isPrivyConfigured,
  looksLikePrivyToken,
  verifyPrivyIdentityToken,
  verifyPrivyToken,
  type PrivyEnv,
} from './privy';
import {
  buildSettlementPlan,
  isOnchainSettlementConfigured,
  settlementDescriptor,
  verifyDepositTransaction,
  verifyFreezeTransaction,
  verifyRefundTransaction,
  verifyReleaseTransaction,
  verifyUnfreezeTransaction,
  type SettlementEnv,
} from './chain';
import { D1PlatformStore, type D1Database } from './store';
import { AGENTMESH_TESTNET_SETTLEMENT, isWeb3Payment } from './payments';
import {
  hasMeaningfulStageOutput,
  stageRequiresArtifact,
  structuredStageResult,
  workflowDeliveryReadiness,
} from './deliveryPolicy';
import {
  blockedNodeIds,
  incomingStageIds,
  linearEdges,
  normalizeViewport,
  readyNodes,
  validateWorkflowGraph,
  workflowAggregate,
  WorkflowValidationError,
} from './workflowGraph';
import {
  adaptiveFallbackCompilation,
  compileWorkflowWithLangGraph,
  type WorkflowCompilerMetadata,
} from './workflowCompiler';

export interface Env extends PinmeEnv, PrivyEnv, SettlementEnv {
  DB?: D1Database;
  CORS_ORIGIN?: string;
  AGENT_WEBHOOK_SECRET?: string;
  AGENT_CREDENTIALS_JSON?: string;
  AGENT_CREDENTIALS_ENCRYPTED_JSON?: string;
  TEST_TOPUP_ENABLED?: string;
  AGENT_ENDPOINT_ALLOWLIST?: string;
  PUBLIC_BASE_URL?: string;
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface AppDependencies {
  storeFactory?: (env: Env) => PlatformStore;
  identityResolver?: (request: Request, env: Env) => Promise<VerifiedIdentity | null>;
  now?: () => Date;
  fetcher?: typeof fetch;
  emailSender?: typeof sendPinmeEmail;
  llmCaller?: typeof callPinmeLlm;
  endpointValidator?: (endpoint: string, env: Env) => Promise<void>;
  depositVerifier?: typeof verifyDepositTransaction;
}

const BUILTIN_AGENT_PROFILES = {
  research: {
    id: 'official-evidence-scout',
    instruction: 'Act as an evidence researcher. Separate facts, assumptions, gaps, and risks. Return concise structured JSON with a summary, findings, risks, and recommended follow-ups.',
  },
  analysis: {
    id: 'official-strategy-analyst',
    instruction: 'Act as a strategy analyst. Compare viable options, make tradeoffs explicit, and return concise structured JSON with an assessment, options, recommendation, and validation plan.',
  },
  writing: {
    id: 'official-delivery-writer',
    instruction: 'Act as a delivery writer. Turn the task and upstream evidence into an acceptance-ready structured deliverable with a title, executive summary, body, limitations, and action list.',
  },
} as const;

const DEFAULT_BUILTIN_AGENT_MODEL = 'openai/gpt-5.6-sol';

type BuiltinAgentKind = keyof typeof BUILTIN_AGENT_PROFILES;

function builtinAgentKind(agent: Agent): BuiltinAgentKind | null {
  if (!agent.official || !agent.endpoint.startsWith('agentmesh://builtin/')) return null;
  const kind = agent.endpoint.slice('agentmesh://builtin/'.length) as BuiltinAgentKind;
  const profile = BUILTIN_AGENT_PROFILES[kind];
  return profile?.id === agent.id ? kind : null;
}

function builtinAgentInvokeUrl(request: Request, agentId: string): string {
  return `${new URL(request.url).origin}/api/agents/${encodeURIComponent(agentId)}/invoke`;
}

function agentClientView(request: Request, agent: Agent): Agent {
  if (!builtinAgentKind(agent)) return agent;
  return {
    ...agent,
    endpoint: builtinAgentInvokeUrl(request, agent.id),
    authType: 'bearer',
  };
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const MAX_JSON_BYTES = 1_000_000;
const DEFAULT_CORS_ORIGINS = [
  'https://agentmesh.pinit.eth.limo',
  'https://agentmesh.pinme.dev',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
];

function configuredOrigins(env: Env): string[] {
  const configured = env.CORS_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  return configured.length ? configured : DEFAULT_CORS_ORIGINS;
}

function testTopupEnabled(env: Env): boolean {
  const configured = env.TEST_TOPUP_ENABLED?.trim().toLocaleLowerCase();
  if (configured) return configured === 'true';
  return env.PROJECT_NAME?.trim() === AGENTMESH_TESTNET_SETTLEMENT.projectName;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const configured = configuredOrigins(env);
  const requestOrigin = request.headers.get('Origin')?.trim();
  const wildcard = configured.length === 0 || configured.includes('*');
  const allowedOrigin = wildcard ? '*' : requestOrigin && configured.includes(requestOrigin) ? requestOrigin : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Privy-Id-Token, Idempotency-Key, X-AgentMesh-Signature',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    Vary: requestOrigin ? 'Origin' : 'Accept-Encoding',
  };
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin')?.trim();
  if (!origin) return true;
  const configured = configuredOrigins(env);
  return configured.includes('*') || configured.includes(origin);
}

function responseJson(request: Request, env: Env, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request, env) });
}

function success(request: Request, env: Env, requestId: string, data: unknown, status = 200, meta: Record<string, unknown> = {}): Response {
  return responseJson(request, env, { data, meta: { requestId, ...meta } }, status);
}

function failure(request: Request, env: Env, requestId: string, error: ApiError): Response {
  return responseJson(request, env, {
    error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
    meta: { requestId },
  }, error.status);
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0);
  if (contentLength > MAX_JSON_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be a JSON object');
  }
}

function requiredString(body: Record<string, unknown>, key: string, min = 1, max = 500): string {
  const value = typeof body[key] === 'string' ? body[key].trim() : '';
  if (value.length < min) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must contain at least ${min} characters`);
  if (value.length > max) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must not exceed ${max} characters`);
  return value;
}

function optionalString(body: Record<string, unknown>, key: string, max = 500): string | null {
  const value = typeof body[key] === 'string' ? body[key].trim() : '';
  if (value.length > max) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must not exceed ${max} characters`);
  return value || null;
}

function stringArray(body: Record<string, unknown>, key: string, maxItems = 12): string[] {
  if (body[key] === undefined) return [];
  if (!Array.isArray(body[key])) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be an array`);
  const values = body[key]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length > maxItems) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must contain at most ${maxItems} values`);
  return [...new Set(values)];
}

function finiteNumber(body: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = Number(body[key]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be between ${min} and ${max}`);
  }
  return value;
}

function requiredBoolean(body: Record<string, unknown>, key: string): boolean {
  if (typeof body[key] !== 'boolean') throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be a boolean`);
  return body[key];
}

function enumValue<T extends string>(body: Record<string, unknown>, key: string, allowed: readonly T[], fallback?: T): T {
  const value = body[key];
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function encodeLedgerCursor(cursor: LedgerCursor | null): string | null {
  if (!cursor) return null;
  return btoa(JSON.stringify([cursor.createdAt, cursor.id]))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function decodeLedgerCursor(raw: string | null): LedgerCursor | null {
  if (!raw) return null;
  if (raw.length > 500 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new ApiError(400, 'INVALID_CURSOR', 'cursor is invalid');
  try {
    const normalized = raw.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') throw new Error('invalid');
    if (Number.isNaN(Date.parse(parsed[0])) || parsed[1].length === 0 || parsed[1].length > 200) throw new Error('invalid');
    return { createdAt: parsed[0], id: parsed[1] };
  } catch {
    throw new ApiError(400, 'INVALID_CURSOR', 'cursor is invalid');
  }
}

function validTimeZone(value: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'timeZone must be a valid IANA time zone');
  }
}

function recordValue(body: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = body[key];
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

function workflowDraftFromBody(
  body: Record<string, unknown>,
  mission: Mission,
  existingStages: WorkflowStage[],
  now: string,
): { stages: WorkflowStage[]; edges: WorkflowEdge[]; viewport: WorkflowViewport; expectedVersion: number } {
  if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'nodes and edges must be arrays');
  }
  const existingById = new Map(existingStages.map((stage) => [stage.id, stage]));
  const stages = body.nodes.map((value, index): WorkflowStage => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_NODE', 'Every node must be an object');
    const node = value as Record<string, unknown>;
    const id = typeof node.id === 'string' && node.id.trim() ? node.id.trim().slice(0, 120) : makeId('STAGE');
    const nodeType = node.nodeType === 'approval' ? 'approval' : node.nodeType === 'task' ? 'task' : null;
    if (!nodeType) throw new ApiError(400, 'INVALID_NODE_TYPE', 'nodeType must be task or approval');
    const existing = existingById.get(id);
    const budget = nodeType === 'approval' ? 0 : Number(node.budget);
    if (!Number.isFinite(budget) || budget < 0 || budget > mission.budget) throw new ApiError(400, 'VALIDATION_ERROR', `Node ${id} has an invalid budget`);
    const positionX = Number(node.positionX);
    const positionY = Number(node.positionY);
    const agentId = nodeType === 'task' && typeof node.agentId === 'string' && node.agentId.trim() ? node.agentId.trim() : null;
    const rawInput = recordValue(node, 'input');
    let normalizedInput: Record<string, unknown>;
    if (nodeType === 'task') {
      const executionMode = rawInput.executionMode ?? 'analyze';
      if (!['analyze', 'implement', 'review'].includes(String(executionMode))) {
        throw new ApiError(400, 'INVALID_EXECUTION_MODE', `Task node ${id} has an unsupported execution mode`);
      }
      for (const contractKey of ['inputContract', 'outputContract'] as const) {
        const contract = rawInput[contractKey];
        if (contract !== undefined && typeof contract !== 'string') {
          throw new ApiError(400, 'INVALID_NODE_CONTRACT', `${contractKey} for node ${id} must be text`);
        }
        if (typeof contract === 'string' && contract.length > 4_000) {
          throw new ApiError(400, 'INVALID_NODE_CONTRACT', `${contractKey} for node ${id} must not exceed 4000 characters`);
        }
      }
      normalizedInput = { ...rawInput, executionMode: String(executionMode) };
    } else {
      const approvalCriteria = typeof rawInput.approvalCriteria === 'string' ? rawInput.approvalCriteria.trim() : '';
      if (approvalCriteria.length < 2 || approvalCriteria.length > 2_000) {
        throw new ApiError(400, 'INVALID_APPROVAL_CRITERIA', `Approval node ${id} requires criteria between 2 and 2000 characters`);
      }
      normalizedInput = { approvalCriteria };
    }
    return {
      id,
      missionId: mission.id,
      position: index + 1,
      nodeType,
      positionX: Number.isFinite(positionX) ? Math.max(-100_000, Math.min(100_000, positionX)) : 0,
      positionY: Number.isFinite(positionY) ? Math.max(-100_000, Math.min(100_000, positionY)) : 0,
      progress: 0,
      name: requiredString(node, 'name', 2, 120),
      purpose: requiredString(node, 'purpose', 2, 600),
      category: nodeType === 'approval' ? '人工审批' : requiredString(node, 'category', 2, 80),
      budget,
      status: 'queued',
      agentId,
      input: normalizedInput,
      output: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  });
  const edges = body.edges.map((value): WorkflowEdge => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'INVALID_EDGE', 'Every edge must be an object');
    const edge = value as Record<string, unknown>;
    return {
      id: typeof edge.id === 'string' && edge.id.trim() ? edge.id.trim().slice(0, 120) : makeId('EDGE'),
      missionId: mission.id,
      sourceStageId: requiredString(edge, 'sourceStageId', 1, 120),
      targetStageId: requiredString(edge, 'targetStageId', 1, 120),
      createdAt: now,
    };
  });
  const expectedVersion = Number(body.workflowVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new ApiError(400, 'VALIDATION_ERROR', 'workflowVersion must be a positive integer');
  const viewportValue = body.viewport && typeof body.viewport === 'object' && !Array.isArray(body.viewport)
    ? body.viewport as Partial<WorkflowViewport>
    : mission.workflowViewport;
  return { stages, edges, viewport: normalizeViewport(viewportValue), expectedVersion };
}

function graphApiError(error: unknown): never {
  if (error instanceof WorkflowValidationError) throw new ApiError(400, error.code, error.message);
  throw error;
}

function handoffSummary(stage: WorkflowStage): Record<string, unknown> {
  const output = structuredStageResult(stage.output) ?? {};
  const summary = typeof output.summary === 'string' && output.summary.trim()
    ? output.summary.trim().slice(0, 4_000)
    : `${stage.name} 已完成。`;
  const handoff: Record<string, unknown> = { summary };
  for (const key of ['findings', 'risks'] as const) {
    const value = output[key];
    if (Array.isArray(value)) {
      handoff[key] = value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 20)
        .map((item) => item.slice(0, 1_000));
    }
  }
  for (const key of ['recommendation', 'deliverable'] as const) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) handoff[key] = value.trim().slice(0, 4_000);
  }
  if (typeof output.verified === 'boolean') handoff.verified = output.verified;
  return handoff;
}

function callbackArtifacts(
  body: Record<string, unknown>,
  missionId: string,
  stageId: string,
  agentId: string,
  createdAt: string,
): Deliverable[] {
  if (body.artifacts === undefined) return [];
  if (!Array.isArray(body.artifacts)) throw new ApiError(400, 'VALIDATION_ERROR', 'artifacts must be an array');
  if (body.artifacts.length > 20) throw new ApiError(400, 'VALIDATION_ERROR', 'artifacts must contain at most 20 values');
  return body.artifacts.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `artifacts[${index}] must be an object`);
    }
    const artifact = value as Record<string, unknown>;
    const contentHash = requiredString(artifact, 'contentHash', 8, 256);
    if (!/^sha256:[a-f0-9]{64}$/i.test(contentHash)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `artifacts[${index}].contentHash must be a sha256 digest`);
    }
    return {
      id: makeId('DEL'),
      missionId,
      stageId,
      agentId,
      name: requiredString(artifact, 'name', 2, 180),
      uri: safeUrl(requiredString(artifact, 'uri', 8, 2_000), `artifacts[${index}].uri`),
      contentHash,
      mimeType: requiredString(artifact, 'mimeType', 3, 120),
      status: 'submitted',
      createdAt,
    };
  });
}

function requireWorkflowDelivery(stages: WorkflowStage[], deliverables: Deliverable[]): void {
  const readiness = workflowDeliveryReadiness(stages, deliverables);
  if (readiness.ready) return;
  if (readiness.code === 'WORKFLOW_INCOMPLETE') {
    throw new ApiError(409, readiness.code, 'Every workflow node must be completed before review');
  }
  if (readiness.code === 'ARTIFACT_REQUIRED') {
    throw new ApiError(
      409,
      readiness.code,
      `Implementation nodes require submitted artifacts: ${readiness.missingArtifactStageIds.join(', ')}`,
    );
  }
  throw new ApiError(
    409,
    readiness.code,
    `Completed task nodes require a valid structured result: ${readiness.missingOutputStageIds.join(', ')}`,
  );
}

function agentEventPayload(body: Record<string, unknown>, artifactCount: number): Record<string, unknown> {
  const raw = recordValue(body, 'payload');
  const payload: Record<string, unknown> = { artifactCount };
  for (const key of ['runtime', 'source', 'failureCode', 'phase'] as const) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) payload[key] = value.trim().slice(0, 120);
  }
  for (const key of ['retryable', 'verified'] as const) {
    if (typeof raw[key] === 'boolean') payload[key] = raw[key];
  }
  return payload;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 2_000))
    .filter(Boolean)
    .slice(0, 50);
  return result.length > 0 ? result : undefined;
}

function normalizeCallbackOutput(output: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!output) return undefined;
  const wrappedResult = objectRecord(output.result);
  const source = wrappedResult ?? output;
  const result: Record<string, unknown> = {};
  for (const key of ['summary', 'deliverable', 'recommendation'] as const) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim().slice(0, key === 'deliverable' ? 50_000 : 20_000);
  }
  for (const key of ['findings', 'risks'] as const) {
    const value = normalizedStringList(source[key]);
    if (value) result[key] = value;
  }
  if (typeof source.verified === 'boolean') result.verified = source.verified;
  if (['succeeded', 'failed', 'blocked'].includes(String(source.completionStatus))) {
    result.completionStatus = source.completionStatus;
  }
  for (const key of ['model', 'agentTier'] as const) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) result[key] = value.trim().slice(0, 120);
  }

  const verification = objectRecord(source.verification);
  if (verification) {
    const commands = Array.isArray(verification.commands)
      ? verification.commands.slice(0, 50).flatMap((item) => {
        const command = objectRecord(item);
        if (!command || typeof command.command !== 'string' || !command.command.trim()) return [];
        return [{
          command: command.command.trim().slice(0, 1_000),
          required: command.required === true,
          status: typeof command.status === 'string' ? command.status.slice(0, 40) : 'unknown',
          ...(Number.isInteger(command.exitCode) ? { exitCode: command.exitCode } : {}),
          ...(typeof command.output === 'string' ? { output: command.output.slice(0, 2_000) } : {}),
        }];
      })
      : [];
    result.verification = { commands };
  }

  const changes = objectRecord(source.changes);
  if (changes) {
    result.changes = Object.fromEntries(
      ['filesChanged', 'additions', 'deletions']
        .filter((key) => Number.isInteger(changes[key]) && Number(changes[key]) >= 0)
        .map((key) => [key, Number(changes[key])]),
    );
  }

  const normalized: Record<string, unknown> = wrappedResult ? { result } : result;
  for (const key of ['runtime', 'source'] as const) {
    const value = output[key];
    if (typeof value === 'string' && value.trim()) normalized[key] = value.trim().slice(0, 120);
  }
  const error = objectRecord(output.error);
  if (error) {
    normalized.error = {
      code: typeof error.code === 'string' ? error.code.slice(0, 120) : 'AGENT_ERROR',
      retryable: error.retryable === true,
    };
  }
  return normalized;
}

function safeUrl(value: string, field: string, protocols = ['https:', 'ipfs:']): string {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) throw new Error('unsupported protocol');
    return value;
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must use ${protocols.join(' or ')}`);
  }
}

function safeAgentEndpoint(value: string): string {
  const safe = safeUrl(value, 'endpoint', ['https:']);
  const url = new URL(safe);
  const host = url.hostname.toLocaleLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  const unsafeIpv4 = ipv4 && (
    ipv4.some((part) => part > 255)
    || ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] >= 224
    || (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127)
    || (ipv4[0] === 169 && ipv4[1] === 254)
    || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
    || (ipv4[0] === 192 && (ipv4[1] === 0 || ipv4[1] === 168))
    || (ipv4[0] === 198 && (ipv4[1] === 18 || ipv4[1] === 19))
  );
  const isIpv6Literal = host.includes(':');
  if (url.username || url.password || (url.port && url.port !== '443')
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || unsafeIpv4 || isIpv6Literal) {
    throw new ApiError(400, 'UNSAFE_AGENT_ENDPOINT', 'Agent endpoints must use a public HTTPS host');
  }
  return safe;
}

function endpointHostAllowed(endpoint: string, env: Env): boolean {
  const configured = env.AGENT_ENDPOINT_ALLOWLIST?.split(',').map((value) => value.trim().toLocaleLowerCase()).filter(Boolean) ?? [];
  if (configured.length === 0) return true;
  const host = new URL(endpoint).hostname.toLocaleLowerCase();
  return configured.some((entry) => host === entry || (entry.startsWith('*.') && host.endsWith(entry.slice(1))));
}

function publicDnsAddress(value: string): boolean {
  const normalized = value.toLocaleLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.includes(':')) {
    if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff')) return false;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? publicDnsAddress(mapped) : !normalized.startsWith('::ffff:');
  }
  const parts = normalized.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && parts[0] !== 0 && parts[0] !== 10 && parts[0] !== 127 && parts[0] < 224
    && !(parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    && !(parts[0] === 169 && parts[1] === 254)
    && !(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    && !(parts[0] === 192 && (parts[1] === 0 || parts[1] === 168))
    && !(parts[0] === 198 && (parts[1] === 18 || parts[1] === 19));
}

async function validateAgentEndpointResolution(endpoint: string, env: Env): Promise<void> {
  if (!endpointHostAllowed(endpoint, env)) throw new ApiError(403, 'AGENT_ENDPOINT_NOT_ALLOWED', 'Agent endpoint host is not in the deployment allowlist');
  const host = new URL(endpoint).hostname;
  const lookups = await Promise.all(['A', 'AAAA'].map(async (type) => {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('DNS lookup failed');
    return response.json() as Promise<{ Answer?: Array<{ type?: number; data?: string }> }>;
  }));
  const addresses = lookups.flatMap((result) => result.Answer ?? [])
    .filter((answer) => answer.type === 1 || answer.type === 28)
    .map((answer) => answer.data?.trim() ?? '')
    .filter(Boolean);
  if (addresses.length === 0 || addresses.some((address) => !publicDnsAddress(address))) {
    throw new ApiError(400, 'UNSAFE_AGENT_ENDPOINT', 'Agent endpoint must resolve only to public network addresses');
  }
}

function slugify(value: string): string {
  const slug = value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `agent-${crypto.randomUUID().slice(0, 8)}`;
}

function evmAddress(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key, 42, 42);
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new ApiError(400, 'VALIDATION_ERROR', `${key} must be a valid EVM address`);
  return value.toLocaleLowerCase();
}

async function callbackToken(secret: string, missionId: string, stageId: string, agentId: string, runId: string, expiresAt: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`agentmesh-callback:v2:${missionId}:${stageId}:${agentId}:${runId}:${expiresAt}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function getStore(env: Env, dependencies: AppDependencies): PlatformStore {
  if (dependencies.storeFactory) return dependencies.storeFactory(env);
  if (!env.DB) throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'D1 database binding is not available');
  return new D1PlatformStore(env.DB);
}

async function resolveIdentity(request: Request, env: Env, dependencies: AppDependencies): Promise<VerifiedIdentity> {
  if (dependencies.identityResolver) {
    const identity = await dependencies.identityResolver(request, env);
    if (identity) return identity;
  }
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'A valid Bearer token is required');
  const result = looksLikePrivyToken(token)
    ? await verifyPrivyToken(env, token)
    : await verifyPinmeToken(env, token);
  if (!result.identity) {
    const code = result.status === 403 ? 'EMAIL_NOT_VERIFIED' : 'INVALID_TOKEN';
    throw new ApiError(result.status || 401, code, result.error ?? 'Authentication failed');
  }
  if (result.identity.provider === 'privy') {
    const identityToken = request.headers.get('Privy-Id-Token')?.trim();
    if (identityToken) {
      const enriched = await verifyPrivyIdentityToken(env, identityToken, result.identity.uid);
      if (!enriched.identity) throw new ApiError(enriched.status, 'INVALID_IDENTITY_TOKEN', enriched.error ?? 'Privy identity token verification failed');
      return { ...result.identity, ...enriched.identity, claims: { ...result.identity.claims, ...enriched.identity.claims } };
    }
  }
  return result.identity;
}

async function requireUser(
  request: Request,
  env: Env,
  dependencies: AppDependencies,
  store: PlatformStore,
  roles?: UserRole[],
): Promise<UserContext> {
  const identity = await resolveIdentity(request, env, dependencies);
  const claimName = typeof identity.claims.name === 'string' ? identity.claims.name : '';
  const displayName = identity.displayName || claimName || identity.email?.split('@')[0] || 'AgentMesh User';
  let user: UserContext;
  try {
    user = await store.ensureIdentityProfile({
      provider: identity.provider,
      subject: identity.uid,
      email: identity.email,
      displayName,
      walletAddress: identity.walletAddress,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('IDENTITY_CONFLICT')) {
      throw new ApiError(409, 'IDENTITY_CONFLICT', 'This verified email and wallet belong to different existing profiles');
    }
    throw error;
  }
  if (roles && !roles.includes(user.role)) throw new ApiError(403, 'FORBIDDEN', `This action requires one of these roles: ${roles.join(', ')}`);
  return user;
}

async function enforceRateLimit(
  store: PlatformStore,
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  now: Date,
  subject?: string,
) {
  const client = subject || request.headers.get('CF-Connecting-IP') || 'unknown';
  const result = await store.consumeRateLimit(`${scope}:${client}`, limit, windowSeconds, Math.floor(now.getTime() / 1000));
  if (!result.allowed) {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please retry after the current window.', { resetAt: result.resetAt });
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function encryptedAgentCredential(env: Env, agentId: string): Promise<string | undefined> {
  const encrypted = env.AGENT_CREDENTIALS_ENCRYPTED_JSON?.trim();
  if (!encrypted) return undefined;
  try {
    const parsed = JSON.parse(encrypted) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    const envelope = parsed as Record<string, unknown>;
    const credentials = envelope.credentials;
    if (envelope.version !== 1 || !credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
      throw new Error('invalid envelope');
    }
    const entry = (credentials as Record<string, unknown>)[agentId];
    if (entry === undefined) return undefined;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid entry');
    const { iv, ciphertext } = entry as Record<string, unknown>;
    if (typeof iv !== 'string' || typeof ciphertext !== 'string' || !env.API_KEY?.trim()) throw new Error('invalid credential');
    const encoder = new TextEncoder();
    // Only ciphertext crosses the plain-text deployment binding; the existing project secret remains the local root key.
    const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`agentmesh-agent-credentials:v1\n${env.API_KEY}`));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: decodeBase64Url(iv) as BufferSource,
      additionalData: encoder.encode(`agentmesh-agent-credential:${agentId}:v1`),
    }, key, decodeBase64Url(ciphertext) as BufferSource);
    const credential = new TextDecoder().decode(plaintext).trim();
    if (!credential) throw new Error('empty credential');
    return credential;
  } catch {
    throw new ApiError(503, 'AGENT_CREDENTIALS_INVALID', 'Encrypted Agent credential configuration is invalid');
  }
}

async function agentCredentialsConfigured(env: Env): Promise<boolean> {
  try {
    const entries = JSON.parse(env.AGENT_CREDENTIALS_JSON ?? '{}') as unknown;
    if (entries && typeof entries === 'object' && !Array.isArray(entries)
      && Object.values(entries as Record<string, unknown>).some((value) => typeof value === 'string' && value.trim())) return true;
    const encrypted = env.AGENT_CREDENTIALS_ENCRYPTED_JSON?.trim();
    if (!encrypted) return false;
    const envelope = JSON.parse(encrypted) as { credentials?: Record<string, unknown> };
    return Boolean(envelope.credentials && Object.values(envelope.credentials).length > 0);
  } catch {
    return false;
  }
}

async function agentCredentialHeaders(env: Env, agent: Agent): Promise<Record<string, string>> {
  if (agent.authType === 'none') return {};
  let entries: Record<string, string> = {};
  try {
    const parsed = JSON.parse(env.AGENT_CREDENTIALS_JSON ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) entries = parsed as Record<string, string>;
  } catch {
    throw new ApiError(503, 'AGENT_CREDENTIALS_INVALID', 'Agent credential secret map is invalid JSON');
  }
  const credential = entries[agent.id]?.trim() || await encryptedAgentCredential(env, agent.id);
  if (!credential) throw new ApiError(409, 'AGENT_CREDENTIAL_REQUIRED', 'This Agent requires a Worker secret credential');
  if (agent.authType === 'api_key') return { 'X-API-Key': credential };
  return { Authorization: `${agent.authType === 'bearer' ? 'Bearer ' : 'JWT '}${credential}` };
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function readLimitedResponse(response: Response, maxBytes = 20_000): Promise<string> {
  if (Number(response.headers.get('Content-Length') ?? 0) > maxBytes) throw new ApiError(502, 'AGENT_RESPONSE_TOO_LARGE', 'Agent response exceeds the allowed size');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return output + decoder.decode();
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new ApiError(502, 'AGENT_RESPONSE_TOO_LARGE', 'Agent response exceeds the allowed size');
    }
    output += decoder.decode(value, { stream: true });
  }
}

type NotificationCategory = 'task' | 'settlement' | 'product';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

async function deliverNotification(
  store: PlatformStore,
  env: Env,
  dependencies: AppDependencies,
  input: {
    userId: string;
    category: NotificationCategory;
    title: string;
    detail: string;
    tone?: Notification['tone'];
  },
): Promise<Notification | null> {
  const preferences = await store.getUserPreferences(input.userId);
  const enabled = input.category === 'task'
    ? preferences.taskUpdates
    : input.category === 'settlement'
      ? preferences.settlementUpdates
      : preferences.productUpdates;
  if (!enabled) return null;

  const createdAt = (dependencies.now?.() ?? new Date()).toISOString();
  const notification: Notification = {
    id: makeId('NOT'),
    userId: input.userId,
    title: input.title,
    detail: input.detail,
    tone: input.tone ?? 'info',
    read: false,
    createdAt,
  };
  await store.createNotification(notification);

  if (preferences.emailChannel) {
    const recipient = await store.getProfile(input.userId);
    if (recipient?.email) {
      try {
        await (dependencies.emailSender ?? sendPinmeEmail)(env, {
          to: recipient.email,
          subject: `[AgentMesh] ${input.title}`,
          html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0b1117"><p style="font-size:12px;letter-spacing:.12em;color:#64717d">AGENTMESH WORKSPACE</p><h2>${escapeHtml(input.title)}</h2><p>${escapeHtml(input.detail)}</p><p style="font-size:12px;color:#64717d">此邮件依据你的 AgentMesh 通知偏好发送。</p></div>`,
        });
      } catch {
        // Notification persistence is authoritative; a transient email failure must not roll back business state.
      }
    }
  }
  return notification;
}

function queryLimit(url: URL, fallback: number, maximum: number): number {
  const raw = url.searchParams.get('limit');
  if (raw === null) return fallback;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new ApiError(400, 'VALIDATION_ERROR', `limit must be an integer between 1 and ${maximum}`);
  }
  return limit;
}

async function missionDetail(store: PlatformStore, mission: Mission, now = new Date().toISOString()): Promise<MissionDetail> {
  const [stages, edges, offers, events, deliverables, escrow, disputes] = await Promise.all([
    store.listStages(mission.id),
    store.listEdges(mission.id),
    store.listStageOffers(mission.id, now),
    store.listEvents(mission.id),
    store.listDeliverables(mission.id),
    store.getEscrow(mission.id),
    store.getDisputes(mission.id),
  ]);
  return { mission, stages, edges, offers, events, deliverables, escrow, disputes };
}

const OFFER_WINDOW_MS = 24 * 60 * 60 * 1_000;
const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

function reviewDueAt(now: Date): string {
  return new Date(now.getTime() + REVIEW_WINDOW_MS).toISOString();
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

async function canonicalRequestHash(payload: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(payload)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseJsonObject(content: string | undefined): Record<string, unknown> | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function runBuiltinAgent(
  env: Env,
  dependencies: AppDependencies,
  agent: Agent,
  mission: Mission,
  stage: WorkflowStage,
  stages: WorkflowStage[],
  edges: WorkflowEdge[],
): Promise<{ output: Record<string, unknown>; source: 'pinme-llm' | 'deterministic-fallback' }> {
  const kind = builtinAgentKind(agent);
  if (!kind) throw new ApiError(409, 'BUILTIN_AGENT_INVALID', 'The official Agent runtime is not recognized');
  const directUpstream = new Set(incomingStageIds(stage.id, edges));
  const upstream = stages
    .filter((candidate) => directUpstream.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, name: candidate.name, output: candidate.output }));
  const fallback: Record<string, unknown> = {
    summary: `${agent.name} 已完成“${stage.name}”的结构化测试网执行。`,
    findings: [
      `任务目标：${mission.title}`,
      `阶段目标：${stage.purpose}`,
      upstream.length ? `已引用 ${upstream.length} 个上游阶段结果。` : '当前阶段无上游依赖。',
    ],
    risks: ['该结果来自测试网运行时，正式决策前仍应核验外部事实与原始材料。'],
    recommendation: '按任务验收标准复核结构化结果，并在有外部数据时补充来源链接。',
  };
  return executeBuiltinAgent(env, dependencies, agent, kind, {
    mission: {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      category: mission.category,
      tags: mission.tags,
      deadline: mission.deadline,
      priority: mission.priority,
      expertise: mission.expertise,
    },
    stage: {
      id: stage.id,
      name: stage.name,
      purpose: stage.purpose,
      category: stage.category,
      input: stage.input,
    },
    upstream,
  }, fallback);
}

async function executeBuiltinAgent(
  env: Env,
  dependencies: AppDependencies,
  agent: Agent,
  kind: BuiltinAgentKind,
  input: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Promise<{ output: Record<string, unknown>; source: 'pinme-llm' | 'deterministic-fallback' }> {
  const profile = BUILTIN_AGENT_PROFILES[kind];
  const model = env.BUILTIN_AGENT_MODEL?.trim() || DEFAULT_BUILTIN_AGENT_MODEL;
  const llm = await (dependencies.llmCaller ?? callPinmeLlm)(env, [
    {
      role: 'system',
      content: `${profile.instruction} Do not claim access to sources that are not present in the input. Return one JSON object only.`,
    },
    {
      role: 'user',
      content: stableJson(input),
    },
  ], { model });
  const parsed = parseJsonObject(llm.content);
  const source = parsed ? 'pinme-llm' : 'deterministic-fallback';
  return {
    source,
    output: {
      agent: { id: agent.id, name: agent.name, capability: kind },
      source,
      result: parsed ?? fallback,
      runtime: { protocol: 'agentmesh.builtin.v1', model, llmError: parsed ? null : llm.error ?? 'invalid_json' },
    },
  };
}

async function invokeBuiltinAgent(
  env: Env,
  dependencies: AppDependencies,
  agent: Agent,
  task: string,
  context: Record<string, unknown>,
): Promise<{ output: Record<string, unknown>; source: 'pinme-llm' | 'deterministic-fallback' }> {
  const kind = builtinAgentKind(agent);
  if (!kind) throw new ApiError(404, 'AGENT_HTTP_INVOKE_UNAVAILABLE', 'This Agent does not expose the official HTTP runtime');
  const serializedInput = stableJson({ task, context });
  if (new TextEncoder().encode(serializedInput).byteLength > 40_000) {
    throw new ApiError(413, 'AGENT_INPUT_TOO_LARGE', 'Agent task and context must not exceed 40 KB');
  }
  return executeBuiltinAgent(env, dependencies, agent, kind, { task, context }, {
    summary: `${agent.name} 已接收并处理当前请求。`,
    findings: [`任务：${task}`, context && Object.keys(context).length ? '已读取调用方提供的结构化上下文。' : '调用方未提供额外上下文。'],
    risks: ['LLM 当前不可用，返回的是确定性降级结果。'],
    recommendation: '稍后重试以获得模型生成结果，或将此结构作为后续工作流输入。',
  });
}

function builtinDeliverableUri(request: Request, env: Env, missionId: string): string {
  const requestOrigin = request.headers.get('Origin')?.trim();
  const allowedRequestOrigin = requestOrigin && configuredOrigins(env).includes(requestOrigin) ? requestOrigin : null;
  const frontendOrigin = allowedRequestOrigin
    ?? configuredOrigins(env).find((origin) => origin.startsWith('https://'))
    ?? new URL(request.url).origin;
  return `${frontendOrigin.replace(/\/$/, '')}/#/missions/${encodeURIComponent(missionId)}/acceptance`;
}

async function completeBuiltinAgentDispatch(input: {
  request: Request;
  env: Env;
  dependencies: AppDependencies;
  store: PlatformStore;
  mission: Mission;
  stages: WorkflowStage[];
  edges: WorkflowEdge[];
  stage: WorkflowStage;
  agent: Agent;
  runId: string;
  expiresAt: string;
  now: Date;
}): Promise<{ stage: WorkflowStage; mission: Mission | null; acknowledgement: Record<string, unknown> }> {
  const { request, env, dependencies, store, mission, stages, edges, stage, agent, runId, expiresAt, now } = input;
  const execution = await runBuiltinAgent(env, dependencies, agent, mission, stage, stages, edges);
  const completedAt = (dependencies.now?.() ?? new Date()).toISOString();
  await store.addEvent({
    id: makeId('EVT'), missionId: mission.id, stageId: stage.id, type: 'dispatch.accepted',
    message: `${agent.name} 官方运行时已接收任务`, actorType: 'platform', actorId: null,
    payload: { runId, expiresAt, builtin: true }, createdAt: completedAt,
  }, mission.progress, `${agent.name} 正在执行 ${stage.name}`);
  const callbackResult = await store.applyAgentCallback({
    runId,
    callbackId: `builtin-${runId}`,
    missionId: mission.id,
    stageId: stage.id,
    agentId: agent.id,
    expiresAt,
    now: completedAt,
    status: 'done',
    output: execution.output,
    progress: Math.min(100, Math.round((stage.position / Math.max(stages.length, 1)) * 100)),
    currentStage: `${stage.name} 已完成`,
    event: {
      id: makeId('EVT'), missionId: mission.id, stageId: stage.id, type: 'stage.done',
      message: `${agent.name} 已生成结构化交付`, actorType: 'agent', actorId: agent.id,
      payload: { source: execution.source, builtin: true }, createdAt: completedAt,
    },
  });
  if (callbackResult.state !== 'applied') {
    throw new ApiError(409, 'BUILTIN_AGENT_EXECUTION_CONFLICT', `Official Agent completion could not be applied: ${callbackResult.state}`);
  }
  const deliverableId = makeId('DEL');
  const contentHash = `sha256:${await canonicalRequestHash(execution.output)}`;
  await store.addDeliverable({
    id: deliverableId,
    missionId: mission.id,
    stageId: stage.id,
    agentId: agent.id,
    name: `${stage.name} · ${agent.name} 结构化结果`,
    uri: builtinDeliverableUri(request, env, mission.id),
    contentHash,
    mimeType: 'application/json',
    status: 'submitted',
    createdAt: completedAt,
  });
  await store.addEvent({
    id: makeId('EVT'), missionId: mission.id, stageId: stage.id, type: 'deliverable.submitted',
    message: `${agent.name} 已提交结构化交付物`, actorType: 'agent', actorId: agent.id,
    payload: { deliverableId, contentHash, builtin: true }, createdAt: completedAt,
  });
  const [latestStages, latestDeliverables] = await Promise.all([
    store.listStages(mission.id),
    store.listDeliverables(mission.id),
  ]);
  let latestMission = await store.getMission(mission.id);
  if (workflowDeliveryReadiness(latestStages, latestDeliverables).ready) {
    latestMission = await store.submitMissionForReview(mission.id, reviewDueAt(now));
  }
  await deliverNotification(store, env, dependencies, {
    userId: mission.requesterId,
    category: 'task',
    title: '官方测试 Agent 阶段已完成',
    detail: `${mission.title} · ${agent.name} 已提交结构化结果。`,
    tone: 'success',
  });
  return {
    stage: callbackResult.stage,
    mission: latestMission,
    acknowledgement: { accepted: true, completed: true, source: execution.source, deliverableId },
  };
}

interface NodeDispatchResult {
  stage: WorkflowStage;
  mission: Mission | null;
  agent: { id: string; name: string };
  acknowledgement: unknown;
  builtin: boolean;
}

async function refreshWorkflowAggregate(store: PlatformStore, missionId: string): Promise<Mission | null> {
  const [stages, edges] = await Promise.all([store.listStages(missionId), store.listEdges(missionId)]);
  const aggregate = workflowAggregate(stages, edges);
  return store.updateMissionWorkflowState(missionId, aggregate.progress, aggregate.currentStage);
}

async function activateReadyApprovals(
  store: PlatformStore,
  missionId: string,
  actorId: string | null,
  now: string,
): Promise<WorkflowStage[]> {
  const [stages, edges] = await Promise.all([store.listStages(missionId), store.listEdges(missionId)]);
  const approvals = readyNodes(stages, edges).approvals;
  for (const gate of approvals) {
    const activated = await store.updateStage(missionId, gate.id, 'running');
    if (!activated) continue;
    await store.addEvent({
      id: makeId('EVT'), missionId, stageId: gate.id, type: 'gate.awaiting_approval',
      message: `${gate.name} 正在等待任务方审批`, actorType: 'platform', actorId,
      payload: { criteria: gate.input.approvalCriteria ?? gate.purpose }, createdAt: now,
    });
  }
  return approvals;
}

async function enqueueReadyTaskNodes(store: PlatformStore, missionId: string, now: string): Promise<WorkflowStage[]> {
  await activateReadyApprovals(store, missionId, null, now);
  const [stages, edges] = await Promise.all([store.listStages(missionId), store.listEdges(missionId)]);
  const tasks = readyNodes(stages, edges).tasks;
  await store.enqueueDispatches(missionId, tasks.map((stage) => stage.id), now);
  await refreshWorkflowAggregate(store, missionId);
  return tasks;
}

async function dispatchTaskNode(input: {
  request: Request;
  env: Env;
  dependencies: AppDependencies;
  store: PlatformStore;
  mission: Mission;
  stages: WorkflowStage[];
  edges: WorkflowEdge[];
  agents: Agent[];
  stage: WorkflowStage;
  runId: string;
  expiresAt: string;
  now: Date;
}): Promise<NodeDispatchResult> {
  const { request, env, dependencies, store, mission, stages, edges, agents, stage, runId, expiresAt, now } = input;
  if (stage.nodeType !== 'task' || !stage.agentId) throw new ApiError(409, 'WORKFLOW_INCOMPLETE', 'Runnable task node has no assigned Agent');
  const agent = agents.find((candidate) => candidate.id === stage.agentId);
  if (!agent || agent.status !== 'active') throw new ApiError(409, 'AGENT_UNAVAILABLE', 'Assigned Agent is not active');
  const callbackSecret = env.AGENT_WEBHOOK_SECRET?.trim() || env.API_KEY?.trim();
  if (!callbackSecret) throw new ApiError(503, 'CALLBACK_SIGNING_UNAVAILABLE', 'Agent callback signing is not configured');
  const claimedStage = stage.status === 'running' ? stage : await store.claimStageForDispatch(mission.id, stage.id);
  if (!claimedStage) throw new ApiError(409, 'STAGE_ALREADY_DISPATCHED', 'This task node is already running, completed, or blocked by dependencies');
  try {
    const builtinKind = builtinAgentKind(agent);
    if (!builtinKind) await (dependencies.endpointValidator ?? validateAgentEndpointResolution)(agent.endpoint, env);
    const credentialHeaders = builtinKind ? {} : await agentCredentialHeaders(env, agent);
    const token = await callbackToken(callbackSecret, mission.id, stage.id, agent.id, runId, expiresAt);
    await store.createAgentDispatch({ runId, missionId: mission.id, stageId: stage.id, agentId: agent.id, expiresAt });
    if (builtinKind) {
      const completed = await completeBuiltinAgentDispatch({
        request, env, dependencies, store, mission, stages, edges, stage: claimedStage, agent, runId, expiresAt, now,
      });
      await refreshWorkflowAggregate(store, mission.id);
      return {
        stage: completed.stage,
        mission: completed.mission,
        agent: { id: agent.id, name: agent.name },
        acknowledgement: completed.acknowledgement,
        builtin: true,
      };
    }
    const directUpstream = new Set(incomingStageIds(stage.id, edges));
    const upstreamArtifacts = directUpstream.size ? await store.listDeliverables(mission.id) : [];
    const upstream = stages
      .filter((candidate) => directUpstream.has(candidate.id) && candidate.status === 'done')
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        nodeType: candidate.nodeType,
        purpose: candidate.purpose,
        handoff: handoffSummary(candidate),
        // Compatibility alias for v1 endpoints. This is intentionally the bounded
        // handoff summary rather than the complete predecessor output.
        output: handoffSummary(candidate),
        artifacts: upstreamArtifacts
          .filter((artifact) => artifact.stageId === candidate.id)
          .map((artifact) => ({
            id: artifact.id,
            name: artifact.name,
            uri: artifact.uri,
            contentHash: artifact.contentHash,
            mimeType: artifact.mimeType,
          })),
      }));
    const callbackUrl = `${new URL(request.url).origin}/api/hooks/agents/${encodeURIComponent(agent.id)}/events`;
    const dispatchBody = JSON.stringify({
      protocol: 'agentmesh.node-dispatch.v2',
      task: {
        agent: { id: agent.id, name: agent.name },
        mission: {
          id: mission.id, title: mission.title, description: mission.description, category: mission.category,
          tags: mission.tags, deadline: mission.deadline, priority: mission.priority, expertise: mission.expertise,
        },
        node: {
          id: stage.id, position: stage.position, nodeType: stage.nodeType, name: stage.name,
          purpose: stage.purpose, category: stage.category, budget: stage.budget, input: stage.input,
        },
        // Legacy field retained for existing endpoints during the v2 migration.
        stage: {
          id: stage.id, position: stage.position, totalStages: stages.filter((candidate) => candidate.nodeType === 'task').length,
          name: stage.name, purpose: stage.purpose, category: stage.category, budget: stage.budget, input: stage.input,
        },
        upstream,
      },
      callback: { url: callbackUrl, signature: token, runId, expiresAt, callbackIdRequired: true },
    });
    let dispatchResponse: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        dispatchResponse = await (dependencies.fetcher ?? fetch)(agent.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AgentMesh-Task-Id': runId,
            'X-AgentMesh-Agent-Id': agent.id,
            ...credentialHeaders,
          },
          body: dispatchBody,
          signal: AbortSignal.timeout(15_000),
        });
        if (dispatchResponse.ok || dispatchResponse.status < 500 || attempt === 2) break;
      } catch {
        dispatchResponse = null;
        if (attempt === 2) break;
      }
      await sleep(250 * attempt);
    }
    if (!dispatchResponse) throw new ApiError(502, 'AGENT_UNAVAILABLE', 'Agent endpoint could not be reached after two attempts');
    if (!dispatchResponse.ok) {
      const authRejected = dispatchResponse.status === 401 || dispatchResponse.status === 403;
      if (authRejected && agent.authType === 'none') {
        throw new ApiError(409, 'AGENT_AUTH_CONFIGURATION_REQUIRED', 'Agent endpoint requires authentication but this Agent is registered without credentials', { httpStatus: dispatchResponse.status, authType: agent.authType });
      }
      if (authRejected) throw new ApiError(502, 'AGENT_AUTH_REJECTED', `Agent endpoint rejected the configured ${agent.authType} credential`, { httpStatus: dispatchResponse.status, authType: agent.authType });
      throw new ApiError(502, 'AGENT_REJECTED_TASK', `Agent endpoint returned HTTP ${dispatchResponse.status}`, { httpStatus: dispatchResponse.status, authType: agent.authType });
    }
    const responseText = await readLimitedResponse(dispatchResponse);
    let acknowledgement: unknown = responseText;
    try { acknowledgement = responseText ? JSON.parse(responseText) : null; } catch { /* Plain text is valid. */ }
    const updatedStage = (await store.listStages(mission.id)).find((candidate) => candidate.id === stage.id) ?? claimedStage;
    await store.addEvent({
      id: makeId('EVT'), missionId: mission.id, stageId: stage.id, type: 'dispatch.accepted',
      message: `${agent.name} 已接收任务节点`, actorType: 'platform', actorId: null,
      payload: { acknowledgement, runId, expiresAt, upstreamNodeIds: [...directUpstream] },
      createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
    });
    await refreshWorkflowAggregate(store, mission.id);
    return { stage: updatedStage, mission: await store.getMission(mission.id), agent: { id: agent.id, name: agent.name }, acknowledgement, builtin: false };
  } catch (error) {
    const failedAt = (dependencies.now?.() ?? new Date()).toISOString();
    const failed = await store.transitionRunningStage(mission.id, stage.id, 'failed', {
      error: error instanceof Error ? error.message : 'Agent dispatch failed', retryable: true,
      ...(error instanceof ApiError && error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : {}),
    });
    await store.completeAgentDispatch(runId, failedAt);
    if (failed) {
      await store.addEvent({
        id: makeId('EVT'), missionId: mission.id, stageId: stage.id,
        type: error instanceof ApiError && ['AGENT_AUTH_REJECTED', 'AGENT_AUTH_CONFIGURATION_REQUIRED'].includes(error.code)
          ? 'dispatch.authentication_failed'
          : 'dispatch.failed',
        message: `${agent.name} 未能接收任务节点`, actorType: 'platform', actorId: null,
        payload: { retryable: true, code: error instanceof ApiError ? error.code : 'DISPATCH_FAILED' }, createdAt: failedAt,
      });
      await refreshWorkflowAggregate(store, mission.id);
    }
    throw error;
  }
}

async function dispatchReadyWorkflowNodes(input: {
  request: Request;
  env: Env;
  dependencies: AppDependencies;
  store: PlatformStore;
  missionId: string;
  now: Date;
  cascadeBuiltin?: boolean;
}): Promise<Array<NodeDispatchResult | { stageId: string; error: { status: number; code: string; message: string } }>> {
  const { request, env, dependencies, store, missionId, now, cascadeBuiltin = false } = input;
  await enqueueReadyTaskNodes(store, missionId, now.toISOString());
  const [mission, stages, edges, agents, pending] = await Promise.all([
    store.getMission(missionId), store.listStages(missionId), store.listEdges(missionId), store.listAgents(),
    store.listPendingDispatches(80, now.toISOString()),
  ]);
  if (!mission) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
  const missionPending = pending.filter((item) => item.missionId === missionId);
  const pendingStageIds = new Set(missionPending.map((item) => item.stageId));
  const readyIds = new Set([
    ...readyNodes(stages, edges).tasks.map((stage) => stage.id),
    ...stages.filter((stage) => stage.nodeType === 'task' && stage.status === 'running' && pendingStageIds.has(stage.id)).map((stage) => stage.id),
  ]);
  const terminalItems = missionPending.filter((item) => {
    const stage = stages.find((candidate) => candidate.id === item.stageId);
    return !stage || stage.status === 'done' || stage.status === 'failed';
  });
  await Promise.all(terminalItems.map(async (item) => {
    if (!await store.claimDispatch(item.id, now.toISOString())) return;
    await store.completeDispatch(item.id, 'done', now.toISOString());
  }));
  const items = missionPending.filter((item) => readyIds.has(item.stageId));
  const results = await Promise.all(items.map(async (item) => {
    if (!await store.claimDispatch(item.id, now.toISOString())) {
      return { stageId: item.stageId, error: { status: 409, code: 'STAGE_ALREADY_DISPATCHED', message: 'Dispatch was claimed by another worker' } };
    }
    const stage = stages.find((candidate) => candidate.id === item.stageId);
    if (!stage) {
      await store.completeDispatch(item.id, 'done', now.toISOString());
      return { stageId: item.stageId, error: { status: 409, code: 'NODE_NOT_FOUND', message: 'Workflow node no longer exists' } };
    }
    try {
      const result = await dispatchTaskNode({
        request, env, dependencies, store, mission, stages, edges, agents, stage,
        runId: item.runId, expiresAt: item.expiresAt, now,
      });
      await store.completeDispatch(item.id, 'done', (dependencies.now?.() ?? new Date()).toISOString());
      return result;
    } catch (error) {
      await store.completeDispatch(item.id, 'done', (dependencies.now?.() ?? new Date()).toISOString());
      return {
        stageId: item.stageId,
        error: { status: error instanceof ApiError ? error.status : 502, code: error instanceof ApiError ? error.code : 'DISPATCH_FAILED', message: error instanceof Error ? error.message : 'Dispatch failed' },
      };
    }
  }));
  if (cascadeBuiltin && results.some((result) => !('error' in result) && result.builtin && result.stage.status === 'done')) {
    const downstream = await dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now: dependencies.now?.() ?? new Date(), cascadeBuiltin: true });
    return [...results, ...downstream];
  }
  return results;
}

async function requireMissionAccess(store: PlatformStore, user: UserContext, missionId: string): Promise<{ mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[]; agents: Agent[] }> {
  const mission = await store.getMission(missionId);
  if (!mission) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
  const [stages, edges, agents] = await Promise.all([store.listStages(missionId), store.listEdges(missionId), store.listAgents()]);
  if (!canAccessMission(user, mission, agents, stages)) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this mission');
  return { mission, stages, edges, agents };
}

async function runIdempotent(
  request: Request,
  store: PlatformStore,
  user: UserContext,
  payload: unknown,
  execute: () => Promise<IdempotentResult>,
): Promise<IdempotentResult & { replayed?: boolean }> {
  const key = request.headers.get('Idempotency-Key')?.trim();
  if (!key) return execute();
  if (key.length < 8 || key.length > 128) throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8–128 characters');
  const path = new URL(request.url).pathname;
  const requestHash = await canonicalRequestHash(payload);
  const claim = await store.claimIdempotent(user.id, key, request.method, path, requestHash);
  if (claim.state === 'completed') return { ...claim.result, replayed: true };
  if (claim.state === 'pending') throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is already in progress');
  if (claim.state === 'conflict') throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for another operation');
  try {
    const result = await execute();
    await store.completeIdempotent(user.id, key, result);
    return result;
  } catch (error) {
    await store.abandonIdempotent(user.id, key);
    throw error;
  }
}

function missionStreamResponse(request: Request, env: Env, store: PlatformStore, initialMission: Mission): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let signature = '';
      try {
        for (let iteration = 0; iteration < 12 && !cancelled && !request.signal.aborted; iteration += 1) {
          const mission = await store.getMission(initialMission.id);
          if (!mission) break;
          const detail = await missionDetail(store, mission);
          const nextSignature = JSON.stringify([
            detail.mission.updatedAt,
            detail.mission.status,
            detail.events.at(-1)?.id,
            detail.deliverables.at(-1)?.id,
            detail.disputes.at(-1)?.id,
          ]);
          if (nextSignature !== signature) {
            signature = nextSignature;
            controller.enqueue(encoder.encode(`event: mission\ndata: ${JSON.stringify(detail)}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
          }
          await sleep(2_500);
        }
        if (!cancelled) controller.close();
      } catch {
        if (!cancelled) {
          controller.enqueue(encoder.encode('event: reconnect\ndata: {}\n\n'));
          controller.close();
        }
      }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export function createApp(dependencies: AppDependencies = {}) {
  return {
    async fetch(request: Request, env: Env, executionContext?: WorkerExecutionContext): Promise<Response> {
      const requestId = crypto.randomUUID();
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method.toUpperCase();
      const now = dependencies.now?.() ?? new Date();
      if (!isOriginAllowed(request, env)) {
        return failure(request, env, requestId, new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed'));
      }
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });

      try {
        if (pathname === '/api/health' && method === 'GET') {
          const pinmeAuthConfigured = Boolean(env.API_KEY && env.PROJECT_NAME);
          const privyAuthConfigured = isPrivyConfigured(env);
          return success(request, env, requestId, {
            service: 'agentmesh-control-plane',
            version: '1.5.0',
            status: 'ok',
            databaseConfigured: Boolean(env.DB || dependencies.storeFactory),
            authConfigured: pinmeAuthConfigured || privyAuthConfigured,
            authProviders: [
              ...(pinmeAuthConfigured ? ['pinme_identity_platform'] : []),
              ...(privyAuthConfigured ? ['privy'] : []),
            ],
            llmConfigured: Boolean(env.API_KEY && env.PROJECT_NAME),
            agentCredentialsConfigured: await agentCredentialsConfigured(env),
            settlement: settlementDescriptor(env),
            testTopupEnabled: testTopupEnabled(env),
            realtime: 'sse_with_polling_fallback',
            time: now.toISOString(),
          });
        }

        if (pathname === '/api/capabilities' && method === 'GET') {
          return success(request, env, requestId, {
            auth: [
              'email_password',
              'google_id_token',
              ...(isPrivyConfigured(env) ? ['email_otp', 'siwe_wallet', 'embedded_wallet'] : []),
            ],
            orchestration: [
              'compile',
              'candidate_matching',
              'workflow_confirmation',
              'agent_offer_acceptance',
              'visual_dag',
              'workflow_draft_versioning',
              'manual_agent_assignment',
              'parallel_dispatch',
              'join_dependencies',
              'approval_gates',
              'explicit_node_retry',
              'event_log',
            ],
            identity: { canonicalProfiles: true, signedPrivyLinkedAccounts: true },
            settlement: settlementDescriptor(env),
            wallet: { web2Balance: true, testTopupEnabled: testTopupEnabled(env), testOnly: true, withdrawable: false },
            storage: { records: 'd1', deliverables: 'ipfs_or_https_uri' },
            realtime: { primary: 'sse', fallback: 'polling' },
            treasury: { ledger: true, cursorPagination: true, serverTrend: true, csvExport: 'client_generated' },
            notifications: { inApp: true, email: true, preferenceAware: true },
            operations: { persistedPreferences: true, disputeAuditTrail: true, adminRoleManagement: true, adminAuditTrail: true },
          });
        }

        if (pathname === '/api/auth/register' && method === 'POST') {
          const authStore = getStore(env, dependencies);
          await enforceRateLimit(authStore, request, 'auth-register', 10, 600, now);
          const body = await readObject(request);
          const email = requiredString(body, 'email', 5, 254).toLocaleLowerCase();
          const password = requiredString(body, 'password', 12, 128);
          const displayName = optionalString(body, 'displayName', 100) ?? undefined;
          const result = await registerPinmeUser(env, { email, password, display_name: displayName });
          if (!result.user) throw new ApiError(result.status, 'REGISTRATION_FAILED', result.error ?? 'Registration failed');
          return success(request, env, requestId, { user: result.user, emailVerificationRequired: true }, 201);
        }

        if (pathname === '/api/auth/verify' && method === 'POST') {
          const authStore = getStore(env, dependencies);
          await enforceRateLimit(authStore, request, 'auth-verify', 60, 60, now);
          const body = await readObject(request);
          const token = requiredString(body, 'idToken', 20, 20_000);
          const result = looksLikePrivyToken(token)
            ? await verifyPrivyToken(env, token)
            : await verifyPinmeToken(env, token);
          if (!result.identity) throw new ApiError(result.status, result.status === 403 ? 'EMAIL_NOT_VERIFIED' : 'INVALID_TOKEN', result.error ?? 'Verification failed');
          let identity = result.identity;
          const identityToken = request.headers.get('Privy-Id-Token')?.trim();
          if (identity.provider === 'privy' && identityToken) {
            const enriched = await verifyPrivyIdentityToken(env, identityToken, identity.uid);
            if (!enriched.identity) throw new ApiError(enriched.status, 'INVALID_IDENTITY_TOKEN', enriched.error ?? 'Privy identity token verification failed');
            identity = { ...identity, ...enriched.identity, claims: { ...identity.claims, ...enriched.identity.claims } };
          }
          const profile = await authStore.ensureIdentityProfile({
            provider: identity.provider,
            subject: identity.uid,
            email: identity.email,
            walletAddress: identity.walletAddress,
            displayName: identity.displayName ?? identity.email?.split('@')[0] ?? 'AgentMesh User',
          });
          return success(request, env, requestId, { profile });
        }

        const store = getStore(env, dependencies);

        if (pathname === '/api/agents' && method === 'GET') {
          const agents = await store.listAgents();
          const category = url.searchParams.get('category')?.trim().toLocaleLowerCase();
          const status = url.searchParams.get('status')?.trim();
          const query = url.searchParams.get('q')?.trim().toLocaleLowerCase();
          const filtered = agents.filter((agent) => {
            if (category && agent.category.toLocaleLowerCase() !== category) return false;
            if (status && agent.status !== status) return false;
            if (query && !`${agent.name} ${agent.summary} ${agent.tags.join(' ')}`.toLocaleLowerCase().includes(query)) return false;
            return true;
          });
          return success(request, env, requestId, filtered.map((agent) => agentClientView(request, agent)), 200, { count: filtered.length });
        }

        const builtinInvokeMatch = pathname.match(/^\/api\/agents\/([^/]+)\/invoke$/);
        if (builtinInvokeMatch && method === 'GET') {
          const agent = await store.getAgent(decodeURIComponent(builtinInvokeMatch[1]));
          if (!agent || !builtinAgentKind(agent)) throw new ApiError(404, 'AGENT_HTTP_INVOKE_UNAVAILABLE', 'This Agent does not expose the official HTTP runtime');
          return success(request, env, requestId, {
            agent: agentClientView(request, agent),
            endpoint: builtinAgentInvokeUrl(request, agent.id),
            method: 'POST',
            authentication: 'Bearer ID token',
            inputSchema: {
              type: 'object',
              required: ['task'],
              properties: {
                task: { type: 'string', minLength: 1, maxLength: 12_000 },
                context: { type: 'object' },
              },
            },
            example: { task: '分析这个任务并返回结构化结果', context: { locale: 'zh-CN' } },
          });
        }

        const publicAgentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
        if (publicAgentMatch && method === 'GET') {
          const agent = await store.getAgent(decodeURIComponent(publicAgentMatch[1]));
          if (!agent) throw new ApiError(404, 'AGENT_NOT_FOUND', 'Agent not found');
          return success(request, env, requestId, agentClientView(request, agent));
        }

        const agentHookMatch = pathname.match(/^\/api\/hooks\/agents\/([^/]+)\/events$/);
        if (agentHookMatch && method === 'POST') {
          const callbackSecret = env.AGENT_WEBHOOK_SECRET?.trim() || env.API_KEY?.trim();
          if (!callbackSecret) throw new ApiError(503, 'CALLBACK_SIGNING_UNAVAILABLE', 'Agent callback signing is not configured');
          await enforceRateLimit(store, request, 'agent-callback', 120, 60, now, agentHookMatch[1]);
          const agentId = decodeURIComponent(agentHookMatch[1]);
          const body = await readObject(request);
          const missionId = requiredString(body, 'missionId', 8, 120);
          const stageId = requiredString(body, 'stageId', 8, 120);
          const runId = requiredString(body, 'runId', 8, 120);
          const callbackId = requiredString(body, 'callbackId', 8, 120);
          const expiresAt = requiredString(body, 'expiresAt', 20, 60);
          if (Number.isNaN(Date.parse(expiresAt))) throw new ApiError(400, 'INVALID_CALLBACK_EXPIRY', 'expiresAt must be an ISO timestamp');
          const provided = request.headers.get('X-AgentMesh-Signature')?.trim() ?? '';
          const expected = await callbackToken(callbackSecret, missionId, stageId, agentId, runId, expiresAt);
          if (!provided || !safeEqual(provided, expected)) throw new ApiError(401, 'INVALID_CALLBACK_SIGNATURE', 'Invalid Agent callback signature');
          const [mission, stages, existingDeliverables] = await Promise.all([
            store.getMission(missionId),
            store.listStages(missionId),
            store.listDeliverables(missionId),
          ]);
          if (!mission) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
          const stage = stages.find((candidate) => candidate.id === stageId);
          if (!stage || stage.agentId !== agentId) throw new ApiError(403, 'INVALID_ASSIGNMENT', 'Agent is not assigned to this stage');
          const stageStatus = enumValue(body, 'status', ['running', 'done', 'failed'] as const);
          const output = normalizeCallbackOutput(body.output === undefined ? undefined : recordValue(body, 'output'));
          const callbackCreatedAt = (dependencies.now?.() ?? new Date()).toISOString();
          const artifacts = callbackArtifacts(body, missionId, stageId, agentId, callbackCreatedAt);
          if (artifacts.length > 0 && stageStatus !== 'done') {
            throw new ApiError(400, 'INVALID_ARTIFACT_STATUS', 'Artifacts can only be submitted with a done callback');
          }
          if (stageStatus === 'done' && !hasMeaningfulStageOutput({ ...stage, status: 'done', output: output ?? null })) {
            throw new ApiError(422, 'INVALID_COMPLETION_OUTPUT', 'A done callback requires a successful structured result with a summary and evidence');
          }
          const hasExistingStageArtifact = existingDeliverables.some((deliverable) => (
            deliverable.stageId === stageId && deliverable.status !== 'rejected'
          ));
          if (stageStatus === 'done' && stageRequiresArtifact(stage, stages) && !hasExistingStageArtifact && artifacts.length === 0) {
            throw new ApiError(422, 'ARTIFACT_REQUIRED', 'Implement nodes must submit at least one downloadable artifact before completion');
          }
          // Callback progress is scoped to the current node, not the mission's
          // weighted aggregate. A newly-started downstream node may validly
          // report a value lower than the mission's existing percentage.
          const progress = body.progress === undefined ? undefined : finiteNumber(body, 'progress', 0, 100);
          const event: ExecutionEvent = {
            id: makeId('EVT'), missionId, stageId, type: `stage.${stageStatus}`,
            message: optionalString(body, 'message', 500) ?? `${stage.name} 状态更新为 ${stageStatus}`,
            actorType: 'agent', actorId: agentId,
            payload: agentEventPayload(body, artifacts.length),
            createdAt: callbackCreatedAt,
          };
          const callbackResult = await store.applyAgentCallback({
            runId,
            callbackId,
            missionId,
            stageId,
            agentId,
            expiresAt,
            now: now.toISOString(),
            status: stageStatus,
            output,
            artifacts,
            progress,
            currentStage: stageStatus === 'done' ? `${stage.name} 已完成` : `${stage.name} ${stageStatus}`,
            event,
          });
          if (callbackResult.state === 'duplicate') {
            const replayStage = (await store.listStages(missionId)).find((candidate) => candidate.id === stageId) ?? stage;
            return success(request, env, requestId, { stage: replayStage, mission: await store.getMission(missionId) }, 200, { replayed: true });
          }
          if (callbackResult.state === 'expired') throw new ApiError(410, 'CALLBACK_EXPIRED', 'This Agent dispatch has expired or already completed');
          if (callbackResult.state === 'missing') throw new ApiError(401, 'INVALID_CALLBACK_RUN', 'The Agent dispatch run is not recognized');
          if (callbackResult.state === 'invalid') throw new ApiError(409, 'INVALID_STAGE_TRANSITION', 'This stage is no longer eligible for callbacks');
          const updatedStage = callbackResult.stage;
          const latestStages = await store.listStages(missionId);
          const deliverables = await store.listDeliverables(missionId);
          let latestMission = await store.getMission(missionId);
          const readiness = workflowDeliveryReadiness(latestStages, deliverables);
          if (readiness.ready) {
            latestMission = await store.submitMissionForReview(missionId, reviewDueAt(now));
          } else {
            latestMission = await refreshWorkflowAggregate(store, missionId);
            if (stageStatus === 'done') {
              await enqueueReadyTaskNodes(store, missionId, now.toISOString());
              if (executionContext) {
                executionContext.waitUntil(dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now, cascadeBuiltin: true }).then(() => undefined));
              }
            }
          }
          await deliverNotification(store, env, dependencies, {
            userId: mission.requesterId,
            category: 'task',
            title: stageStatus === 'failed' ? 'Agent 阶段执行异常' : stageStatus === 'done' ? 'Agent 阶段已完成' : 'Agent 阶段状态更新',
            detail: `${mission.title} · ${event.message}`,
            tone: stageStatus === 'failed' ? 'warning' : stageStatus === 'done' ? 'success' : 'info',
          });
          return success(request, env, requestId, { stage: updatedStage, mission: latestMission }, 202);
        }

        const user = await requireUser(request, env, dependencies, store);
        await enforceRateLimit(store, request, 'authenticated', 240, 60, now, user.id);

        if (builtinInvokeMatch && method === 'POST') {
          const agent = await store.getAgent(decodeURIComponent(builtinInvokeMatch[1]));
          if (!agent || !builtinAgentKind(agent)) throw new ApiError(404, 'AGENT_HTTP_INVOKE_UNAVAILABLE', 'This Agent does not expose the official HTTP runtime');
          if (agent.status !== 'active') throw new ApiError(409, 'AGENT_NOT_ACTIVE', 'This Agent is not accepting invocations');
          await enforceRateLimit(store, request, 'builtin-agent-invoke', 12, 60, now, `${user.id}:${agent.id}`);
          const body = await readObject(request);
          const task = requiredString(body, 'task', 1, 12_000);
          const context = recordValue(body, 'context');
          const execution = await invokeBuiltinAgent(env, dependencies, agent, task, context);
          return success(request, env, requestId, {
            invocationId: makeId('INV'),
            agent: { id: agent.id, name: agent.name },
            ...execution.output,
          }, 200, { source: execution.source });
        }

        if (pathname === '/api/me' && method === 'GET') {
          return success(request, env, requestId, user);
        }

        if (pathname === '/api/me/role' && method === 'PUT') {
          const body = await readObject(request);
          const role = enumValue(body, 'role', ['requester', 'developer'] as const);
          if (user.role === 'admin') return success(request, env, requestId, user, 200, { personaOnly: true });
          const profile = await store.updateRole(user.id, role);
          return success(request, env, requestId, profile);
        }

        if (pathname === '/api/me/preferences' && method === 'GET') {
          return success(request, env, requestId, await store.getUserPreferences(user.id));
        }

        if (pathname === '/api/me/preferences' && method === 'PUT') {
          const body = await readObject(request);
          const preferences = await store.updateUserPreferences(user.id, {
            taskUpdates: requiredBoolean(body, 'taskUpdates'),
            settlementUpdates: requiredBoolean(body, 'settlementUpdates'),
            productUpdates: requiredBoolean(body, 'productUpdates'),
            emailChannel: requiredBoolean(body, 'emailChannel'),
            locale: enumValue(body, 'locale', ['zh-CN', 'en-US'] as const),
            timeZone: validTimeZone(requiredString(body, 'timeZone', 1, 100)),
            updatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
          });
          return success(request, env, requestId, preferences);
        }

        if (pathname === '/api/wallet' && method === 'GET') {
          return success(request, env, requestId, await store.getWalletAccount(user.id));
        }

        if (pathname === '/api/wallet/test-topup' && method === 'POST') {
          if (!testTopupEnabled(env)) {
            throw new ApiError(403, 'TEST_TOPUP_DISABLED', '测试充值已关闭');
          }
          const result = await store.claimTestCredit(user.id, (dependencies.now?.() ?? new Date()).toISOString());
          return success(request, env, requestId, result, result.credited ? 201 : 200);
        }

        if (pathname === '/api/admin/users' && method === 'GET') {
          if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Admin role is required');
          return success(request, env, requestId, await store.listAdminUsers(queryLimit(url, 100, 200)));
        }

        if (pathname === '/api/admin/audit' && method === 'GET') {
          if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Admin role is required');
          return success(request, env, requestId, await store.listAdminActions(queryLimit(url, 100, 200)));
        }

        if (pathname === '/api/arbitration/members' && method === 'GET') {
          if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Admin role is required');
          return success(request, env, requestId, await store.listArbitrationMembers());
        }

        const arbitrationMemberMatch = pathname.match(/^\/api\/arbitration\/members\/([^/]+)$/);
        if (arbitrationMemberMatch && method === 'PUT') {
          if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Admin role is required');
          const targetId = decodeURIComponent(arbitrationMemberMatch[1]);
          const body = await readObject(request);
          const member = await store.setArbitrationMember(
            targetId,
            requiredBoolean(body, 'active'),
            user.id,
            (dependencies.now?.() ?? new Date()).toISOString(),
          );
          if (!member) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
          return success(request, env, requestId, member);
        }

        const adminRoleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
        if (adminRoleMatch && method === 'PUT') {
          if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Admin role is required');
          const targetId = decodeURIComponent(adminRoleMatch[1]);
          if (targetId === user.id) throw new ApiError(409, 'SELF_ROLE_CHANGE_FORBIDDEN', 'Administrators cannot change their own role');
          const target = await store.getProfile(targetId);
          if (!target) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
          const body = await readObject(request);
          const role = enumValue(body, 'role', ['requester', 'developer', 'admin'] as const);
          if (target.role === 'admin' && role !== 'admin' && await store.countProfilesByRole('admin') <= 1) {
            throw new ApiError(409, 'LAST_ADMIN_REQUIRED', 'At least one administrator must remain');
          }
          let result;
          try {
            result = await store.updateAdminUserRole(targetId, role, user.id, (dependencies.now?.() ?? new Date()).toISOString());
          } catch (roleError) {
            if (roleError instanceof Error && roleError.message.includes('LAST_ADMIN_REQUIRED')) {
              throw new ApiError(409, 'LAST_ADMIN_REQUIRED', 'At least one administrator must remain');
            }
            throw roleError;
          }
          if (!result) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'Profile not found');
          return success(request, env, requestId, result, 200, { replayed: result.action === null });
        }

        if (pathname === '/api/bootstrap' && method === 'GET') {
          const [missions, agents, notifications, developer] = await Promise.all([
            store.listMissions(user),
            store.listAgents(),
            store.listNotifications(user.id),
            user.role === 'developer' ? store.getDeveloperSummary(user.id) : Promise.resolve(null),
          ]);
          return success(request, env, requestId, {
            profile: user,
            missions,
            agents: agents.map((agent) => agentClientView(request, agent)),
            notifications,
            developer,
          });
        }

        if (pathname === '/api/missions' && method === 'GET') {
          const missions = await store.listMissions(user);
          return success(request, env, requestId, missions, 200, { count: missions.length });
        }

        if (pathname === '/api/missions' && method === 'POST') {
          if (user.role !== 'requester' && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Requester role is required');
          const body = await readObject(request);
          const result = await runIdempotent(request, store, user, body, async () => {
            const now = (dependencies.now?.() ?? new Date()).toISOString();
            const deadline = requiredString(body, 'deadline', 10, 40);
            if (Number.isNaN(Date.parse(deadline))) throw new ApiError(400, 'VALIDATION_ERROR', 'deadline must be an ISO date');
            const mission: Mission = {
              id: makeMissionId(),
              requesterId: user.id,
              title: requiredString(body, 'title', 5, 160),
              description: requiredString(body, 'description', 20, 5_000),
              category: requiredString(body, 'category', 2, 80),
              tags: stringArray(body, 'tags'),
              budget: finiteNumber(body, 'budget', 0.000001, 1_000_000),
              paymentMethod: enumValue(
                body,
                'paymentMethod',
                ['web2_balance', 'web3_musdc', 'web3_seth'] as const,
                'web2_balance',
              ) as PaymentMethod,
              deadline,
              reviewDueAt: null,
              priority: enumValue(body, 'priority', ['normal', 'high', 'urgent'] as const, 'normal'),
              expertise: enumValue(body, 'expertise', ['standard', 'expert', 'principal'] as const, 'expert'),
              yieldEnabled: body.yieldEnabled === true,
              status: 'matching',
              progress: 0,
              currentStage: '任务已编译，等待团队确认',
              team: [],
              compiledSpec: null,
              workflowVersion: 1,
              workflowViewport: { x: 0, y: 0, zoom: 1 },
              createdAt: now,
              updatedAt: now,
            };
            const compilation = adaptiveFallbackCompilation(mission);
            mission.compiledSpec = compilation.spec;
            const created = await store.createMission(mission, compilation.stages, compilation.edges);
            await store.addEvent({
              id: makeId('EVT'), missionId: created.id, stageId: null, type: 'mission.created',
              message: '任务规格已创建并生成初始工作流', actorType: 'requester', actorId: user.id,
              payload: { source: 'adaptive-fallback' }, createdAt: now,
            });
            return { status: 201, body: { mission: created, stages: compilation.stages, edges: compilation.edges } };
          });
          return success(request, env, requestId, result.body, result.status, { replayed: Boolean(result.replayed) });
        }

        const missionStreamMatch = pathname.match(/^\/api\/missions\/([^/]+)\/stream$/);
        if (missionStreamMatch && method === 'GET') {
          const { mission } = await requireMissionAccess(store, user, decodeURIComponent(missionStreamMatch[1]));
          return missionStreamResponse(request, env, store, mission);
        }

        const missionMatch = pathname.match(/^\/api\/missions\/([^/]+)$/);
        if (missionMatch && method === 'GET') {
          const { mission } = await requireMissionAccess(store, user, decodeURIComponent(missionMatch[1]));
          return success(request, env, requestId, await missionDetail(store, mission, now.toISOString()));
        }

        const missionOfferMatch = pathname.match(/^\/api\/missions\/([^/]+)\/offers\/([^/]+)$/);
        if (missionOfferMatch && method === 'POST') {
          const missionId = decodeURIComponent(missionOfferMatch[1]);
          const offerId = decodeURIComponent(missionOfferMatch[2]);
          const context = await requireMissionAccess(store, user, missionId);
          if (user.role !== 'developer') throw new ApiError(403, 'FORBIDDEN', 'Only the Agent owner can respond to an offer');
          if (context.mission.status !== 'matching' || (await store.getEscrow(missionId))?.status !== 'pending') {
            throw new ApiError(409, 'WORKFLOW_LOCKED', 'Offers cannot change after escrow funding starts');
          }
          const offer = await store.getStageOffer(offerId, now.toISOString());
          if (!offer || offer.missionId !== missionId) throw new ApiError(404, 'OFFER_NOT_FOUND', 'Stage offer not found');
          const agent = context.agents.find((candidate) => candidate.id === offer.agentId);
          if (!agent || agent.ownerId !== user.id) throw new ApiError(403, 'FORBIDDEN', 'This offer belongs to another Agent owner');
          if (offer.status === 'expired') throw new ApiError(409, 'OFFER_EXPIRED', 'This stage offer has expired; the requester must reissue the workflow');
          if (offer.status !== 'pending') throw new ApiError(409, 'OFFER_ALREADY_RESPONDED', 'This stage offer has already been answered');
          const body = await readObject(request);
          const decision = enumValue(body, 'decision', ['accepted', 'declined'] as const);
          const updated = await store.respondStageOffer(offerId, user.id, decision, now.toISOString());
          if (!updated) throw new ApiError(409, 'OFFER_RESPONSE_CONFLICT', 'The offer changed before this response could be applied');
          const stage = context.stages.find((candidate) => candidate.id === updated.stageId);
          await store.addEvent({
            id: makeId('EVT'), missionId, stageId: updated.stageId, type: `offer.${decision}`,
            message: `${agent.name} ${decision === 'accepted' ? '已接受' : '已拒绝'}阶段邀请${stage ? `：${stage.name}` : ''}`,
            actorType: 'developer', actorId: user.id,
            payload: { offerId: updated.id, agentId: updated.agentId, decision }, createdAt: now.toISOString(),
          });
          await deliverNotification(store, env, dependencies, {
            userId: context.mission.requesterId,
            category: 'task',
            title: decision === 'accepted' ? 'Agent 已接受阶段邀请' : 'Agent 已拒绝阶段邀请',
            detail: `${context.mission.title} · ${agent.name}${stage ? ` · ${stage.name}` : ''}`,
            tone: decision === 'accepted' ? 'success' : 'warning',
          });
          return success(request, env, requestId, updated);
        }

        const workflowDraftMatch = pathname.match(/^\/api\/missions\/([^/]+)\/workflow\/draft$/);
        if (workflowDraftMatch && method === 'PUT') {
          const missionId = decodeURIComponent(workflowDraftMatch[1]);
          const context = await requireMissionAccess(store, user, missionId);
          if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can edit the workflow');
          if (!['draft', 'matching'].includes(context.mission.status) || (await store.getEscrow(missionId))?.status !== 'pending') {
            throw new ApiError(409, 'WORKFLOW_LOCKED', 'The workflow cannot change after escrow funding starts');
          }
          const body = await readObject(request);
          const draft = workflowDraftFromBody(body, context.mission, context.stages, now.toISOString());
          let ordered: WorkflowStage[];
          try {
            ordered = validateWorkflowGraph({ mission: context.mission, stages: draft.stages, edges: draft.edges });
          } catch (error) {
            graphApiError(error);
          }
          const result = await store.saveWorkflowDraft(missionId, ordered, draft.edges, draft.viewport, draft.expectedVersion);
          if (result.state === 'missing') throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
          if (result.state === 'locked') throw new ApiError(409, 'WORKFLOW_LOCKED', 'The workflow cannot change after escrow funding starts');
          if (result.state === 'version_conflict') throw new ApiError(409, 'WORKFLOW_VERSION_CONFLICT', 'The workflow changed in another session; reload before saving', { currentVersion: (await store.getMission(missionId))?.workflowVersion });
          await store.addEvent({
            id: makeId('EVT'), missionId, stageId: null, type: 'workflow.draft_saved',
            message: 'DAG 工作流草稿已保存', actorType: 'requester', actorId: user.id,
            payload: { workflowVersion: result.mission.workflowVersion, nodeCount: ordered.length, edgeCount: draft.edges.length },
            createdAt: now.toISOString(),
          });
          return success(request, env, requestId, { mission: result.mission, stages: ordered, edges: draft.edges });
        }

        const gateDecisionMatch = pathname.match(/^\/api\/missions\/([^/]+)\/gates\/([^/]+)\/decision$/);
        if (gateDecisionMatch && method === 'POST') {
          const missionId = decodeURIComponent(gateDecisionMatch[1]);
          const gateId = decodeURIComponent(gateDecisionMatch[2]);
          const context = await requireMissionAccess(store, user, missionId);
          if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can decide an approval Gate');
          if (context.mission.status !== 'running' || (await store.getEscrow(missionId))?.status !== 'held') {
            throw new ApiError(409, 'MISSION_NOT_RUNNING', 'Gate decisions require a running funded mission');
          }
          const gate = context.stages.find((stage) => stage.id === gateId && stage.nodeType === 'approval');
          if (!gate) throw new ApiError(404, 'GATE_NOT_FOUND', 'Approval Gate not found');
          if (gate.status !== 'running') throw new ApiError(409, 'GATE_NOT_READY', 'Approval Gate is not waiting for a decision');
          const body = await readObject(request);
          const decision = enumValue(body, 'decision', ['approved', 'rejected'] as const);
          const feedback = optionalString(body, 'feedback', 2_000);
          const decidedAt = now.toISOString();
          if (decision === 'approved') {
            await store.updateStage(missionId, gateId, 'done', { decision, feedback, decidedAt, actorId: user.id });
            await store.addEvent({
              id: makeId('EVT'), missionId, stageId: gateId, type: 'gate.approved', message: `${gate.name} 已批准`,
              actorType: 'requester', actorId: user.id, payload: { feedback }, createdAt: decidedAt,
            });
            await enqueueReadyTaskNodes(store, missionId, decidedAt);
            if (executionContext) executionContext.waitUntil(dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now, cascadeBuiltin: true }).then(() => undefined));
          } else {
            const reworkNodeIds = stringArray(body, 'reworkNodeIds', 30);
            if (!feedback) throw new ApiError(400, 'GATE_FEEDBACK_REQUIRED', 'Rejecting a Gate requires written feedback');
            const directUpstream = new Set(incomingStageIds(gateId, context.edges));
            const eligible = new Set(context.stages.filter((stage) => stage.nodeType === 'task' && directUpstream.has(stage.id)).map((stage) => stage.id));
            if (!reworkNodeIds.length) throw new ApiError(400, 'REWORK_NODE_REQUIRED', 'Rejecting a Gate requires at least one direct upstream task node');
            if (reworkNodeIds.some((id) => !eligible.has(id))) throw new ApiError(400, 'INVALID_REWORK_NODE', 'Gate rework nodes must be direct upstream task nodes');
            await store.updateStage(missionId, gateId, 'failed', { decision, feedback, reworkNodeIds, decidedAt, actorId: user.id });
            await store.addEvent({
              id: makeId('EVT'), missionId, stageId: gateId, type: 'gate.rejected', message: `${gate.name} 已驳回并要求返工`,
              actorType: 'requester', actorId: user.id,
              payload: { feedback, reworkNodeIds, priorOutputs: Object.fromEntries(context.stages.filter((stage) => reworkNodeIds.includes(stage.id)).map((stage) => [stage.id, stage.output])) },
              createdAt: decidedAt,
            });
            await store.resetWorkflowNodes(missionId, reworkNodeIds, gateId);
            await enqueueReadyTaskNodes(store, missionId, decidedAt);
            if (executionContext) executionContext.waitUntil(dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now, cascadeBuiltin: true }).then(() => undefined));
          }
          let updatedMission = await refreshWorkflowAggregate(store, missionId);
          const latestGateStages = await store.listStages(missionId);
          if (decision === 'approved' && latestGateStages.length > 0 && latestGateStages.every((stage) => stage.status === 'done')) {
            updatedMission = await store.submitMissionForReview(missionId, reviewDueAt(now));
          }
          return success(request, env, requestId, {
            mission: updatedMission,
            stages: latestGateStages,
            edges: context.edges,
          });
        }

        const retryNodeMatch = pathname.match(/^\/api\/missions\/([^/]+)\/nodes\/([^/]+)\/retry$/);
        if (retryNodeMatch && method === 'POST') {
          const missionId = decodeURIComponent(retryNodeMatch[1]);
          const stageId = decodeURIComponent(retryNodeMatch[2]);
          const context = await requireMissionAccess(store, user, missionId);
          if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can retry a task node');
          if (context.mission.status !== 'running' || (await store.getEscrow(missionId))?.status !== 'held') throw new ApiError(409, 'MISSION_NOT_RUNNING', 'Retry requires a running funded mission');
          const stage = context.stages.find((candidate) => candidate.id === stageId && candidate.nodeType === 'task');
          if (!stage) throw new ApiError(404, 'NODE_NOT_FOUND', 'Task node not found');
          if (stage.status !== 'failed') throw new ApiError(409, 'NODE_NOT_FAILED', 'Only a failed task node can be retried');
          await store.resetWorkflowNodes(missionId, [stageId]);
          await store.addEvent({
            id: makeId('EVT'), missionId, stageId, type: 'node.retry_requested', message: `${stage.name} 已请求重试`,
            actorType: 'requester', actorId: user.id, payload: {}, createdAt: now.toISOString(),
          });
          await enqueueReadyTaskNodes(store, missionId, now.toISOString());
          if (executionContext) executionContext.waitUntil(dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now, cascadeBuiltin: true }).then(() => undefined));
          return success(request, env, requestId, { mission: await refreshWorkflowAggregate(store, missionId), stages: await store.listStages(missionId), edges: context.edges });
        }

        const missionActionMatch = pathname.match(/^\/api\/missions\/([^/]+)\/(compile|candidates|workflow|start|dispatch|events|deliverables|review|accept|disputes)$/);
        if (missionActionMatch) {
          const missionId = decodeURIComponent(missionActionMatch[1]);
          const action = missionActionMatch[2];
          const context = await requireMissionAccess(store, user, missionId);

          if (action === 'compile' && method === 'POST') {
            if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can recompile a mission');
            if (!['draft', 'matching'].includes(context.mission.status) || (await store.getEscrow(missionId))?.status !== 'pending') {
              throw new ApiError(409, 'WORKFLOW_LOCKED', 'The workflow cannot change after escrow funding starts');
            }
            const compiler = await compileWorkflowWithLangGraph(
              context.mission,
              (messages) => (dependencies.llmCaller ?? callPinmeLlm)(env, messages),
            );
            let result = compiler.compilation;
            let compilationSource = compiler.source;
            let compilerMetadata: WorkflowCompilerMetadata = compiler.metadata;
            let ordered: WorkflowStage[];
            try {
              ordered = validateWorkflowGraph({ mission: context.mission, stages: result.stages, edges: result.edges });
            } catch (error) {
              result = adaptiveFallbackCompilation(context.mission);
              compilationSource = 'adaptive-fallback';
              ordered = result.stages;
              compilerMetadata = {
                ...compilerMetadata,
                fallbackReason: error instanceof Error ? error.message.slice(0, 1_000) : 'Final workflow validation failed.',
                warnings: [...compilerMetadata.warnings, 'Final workflow validation failed; adaptive fallback was used.'].slice(0, 8),
              };
              result.spec = { ...result.spec, source: compilationSource, compiler: compilerMetadata };
            }
            const saved = await store.saveCompilation(missionId, result.spec, ordered, result.edges, context.mission.workflowVersion);
            if (saved.state === 'missing') throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
            if (saved.state === 'locked') throw new ApiError(409, 'WORKFLOW_LOCKED', 'The workflow cannot change after escrow funding starts');
            if (saved.state === 'version_conflict') throw new ApiError(409, 'WORKFLOW_VERSION_CONFLICT', 'The workflow changed while AI was compiling it; retry from the latest version');
            await store.addEvent({
              id: makeId('EVT'), missionId, stageId: null, type: 'mission.compiled',
              message: compilationSource === 'langgraph-planner' ? 'LangGraph 已生成并校验智能 DAG 工作流' : '已使用自适应降级策略生成 DAG 工作流',
              actorType: 'platform', actorId: null, payload: { source: compilationSource, compiler: compilerMetadata },
              createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
            });
            return success(request, env, requestId, { mission: saved.mission, stages: ordered, edges: result.edges }, 200, {
              source: compilationSource,
              compiler: compilerMetadata,
            });
          }

          if (action === 'candidates' && method === 'GET') {
            return success(request, env, requestId, matchCandidates(context.mission, context.stages, context.agents));
          }

          if (action === 'workflow' && method === 'POST') {
            if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can confirm the workflow');
            if (!['draft', 'matching'].includes(context.mission.status) || (await store.getEscrow(missionId))?.status !== 'pending') {
              throw new ApiError(409, 'WORKFLOW_LOCKED', 'The workflow cannot change after escrow funding starts');
            }
            const body = await readObject(request);
            const assignments = recordValue(body, 'assignments');
            const existingOffers = await store.listStageOffers(missionId, now.toISOString());
            const canReissueOffers = existingOffers.some((offer) => offer.status === 'declined' || offer.status === 'expired');
            if (existingOffers.length && !canReissueOffers) {
              const assignmentsUnchanged = context.stages
                .filter((stage) => stage.nodeType === 'task')
                .every((stage) => assignments[stage.id] === undefined || assignments[stage.id] === stage.agentId);
              if (!assignmentsUnchanged) {
                throw new ApiError(409, 'WORKFLOW_OFFERS_ACTIVE', 'Save the updated workflow before sending a new set of invitations');
              }
              return success(request, env, requestId, {
                mission: context.mission,
                stages: context.stages,
                edges: context.edges,
                offers: existingOffers,
                escrow: await store.getEscrow(missionId),
              }, 200, { replayed: true });
            }
            const activeAgents = new Map(context.agents.filter((agent) => agent.status === 'active').map((agent) => [agent.id, agent]));
            const updatedStages = context.stages.map((stage) => {
              if (stage.nodeType === 'approval') return { ...stage, agentId: null, budget: 0, updatedAt: now.toISOString() };
              const assigned = typeof assignments[stage.id] === 'string' ? String(assignments[stage.id]) : stage.agentId;
              return { ...stage, agentId: assigned || null, updatedAt: now.toISOString() };
            });
            let orderedStages: WorkflowStage[];
            try {
              orderedStages = validateWorkflowGraph({ mission: context.mission, stages: updatedStages, edges: context.edges, agents: context.agents, requireAssignments: true });
            } catch (error) {
              graphApiError(error);
            }
            const team = [...new Set(orderedStages.map((stage) => stage.agentId).filter((id): id is string => Boolean(id)))];
            const createdAt = now.toISOString();
            const expiresAt = new Date(now.getTime() + OFFER_WINDOW_MS).toISOString();
            const offers = orderedStages.filter((stage) => stage.nodeType === 'task').map<StageOffer>((stage) => {
              const autoAccepted = Boolean(builtinAgentKind(activeAgents.get(stage.agentId!)!));
              return {
                id: makeId('OFFER'), missionId, stageId: stage.id, agentId: stage.agentId!,
                status: autoAccepted ? 'accepted' : 'pending',
                expiresAt,
                respondedAt: autoAccepted ? createdAt : null,
                createdAt,
                updatedAt: createdAt,
              };
            });
            const saved = await store.confirmWorkflow(missionId, orderedStages, team, offers);
            if (!saved) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
            const autoAcceptedCount = offers.filter((offer) => offer.status === 'accepted').length;
            await store.addEvent({
              id: makeId('EVT'), missionId, stageId: null, type: 'workflow.offers_created',
              message: autoAcceptedCount
                ? `${autoAcceptedCount} 个官方测试 Agent 阶段已自动接单，其余邀请已发送`
                : `已向 ${offers.length} 个阶段执行者发送接单邀请`,
              actorType: 'requester', actorId: user.id,
              payload: { offerIds: offers.map((offer) => offer.id), expiresAt, autoAcceptedCount }, createdAt,
            });
            await Promise.all(offers.map(async (offer) => {
              if (offer.status === 'accepted') return;
              const agent = activeAgents.get(offer.agentId);
              const stage = orderedStages.find((candidate) => candidate.id === offer.stageId);
              if (!agent) return;
              await deliverNotification(store, env, dependencies, {
                userId: agent.ownerId,
                category: 'task',
                title: '新的阶段接单邀请',
                detail: `${context.mission.title}${stage ? ` · ${stage.name}` : ''}，请在 24 小时内响应。`,
                tone: 'info',
              });
            }));
            return success(request, env, requestId, { mission: saved, stages: orderedStages, edges: context.edges, offers, escrow: await store.getEscrow(missionId) });
          }

          if (action === 'start' && method === 'POST') {
            if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can start execution');
            if (context.stages.some((stage) => stage.nodeType === 'task' && !stage.agentId)) throw new ApiError(409, 'WORKFLOW_INCOMPLETE', 'Every task node must have an assigned Agent');
            const body = await readObject(request);
            const depositTxHash = optionalString(body, 'depositTxHash', 200);
            const existingEscrow = await store.getEscrow(missionId);
            if (context.mission.status === 'running' && existingEscrow?.status === 'held') {
              const sameDeposit = isWeb3Payment(context.mission.paymentMethod)
                ? Boolean(depositTxHash && depositTxHash.toLocaleLowerCase() === existingEscrow.depositTxHash?.toLocaleLowerCase())
                : !depositTxHash;
              if (sameDeposit) return success(request, env, requestId, { mission: context.mission, escrow: existingEscrow, pollAfterMs: 3000 }, 200, { replayed: true });
            }
            if (context.mission.status !== 'matching' || existingEscrow?.status !== 'pending') {
              throw new ApiError(409, 'MISSION_ALREADY_STARTED', 'Mission funding has already started or is no longer available');
            }
            const offers = await store.listStageOffers(missionId, now.toISOString());
            const taskStages = context.stages.filter((stage) => stage.nodeType === 'task');
            const offersAccepted = taskStages.length > 0 && taskStages.every((stage) => offers.some((offer) => (
              offer.stageId === stage.id && offer.agentId === stage.agentId && offer.status === 'accepted'
            )));
            if (!offersAccepted) throw new ApiError(409, 'OFFERS_NOT_ACCEPTED', 'Every assigned Agent must accept a valid stage offer before funding starts');
            let chainVerification = null;
            let payoutHash: string | null = null;
            let requesterWalletAddress: string | null = null;
            if (isWeb3Payment(context.mission.paymentMethod)) {
              if (!isOnchainSettlementConfigured(env)) {
                throw new ApiError(503, 'CHAIN_NOT_CONFIGURED', 'Sepolia mUSDC / sETH 托管尚未配置');
              }
              if (context.mission.requesterId !== user.id) {
                throw new ApiError(403, 'ONCHAIN_REQUESTER_REQUIRED', 'Only the mission requester can authorize an on-chain escrow deposit');
              }
              if (!depositTxHash) throw new ApiError(400, 'DEPOSIT_TX_REQUIRED', 'A verified escrow deposit transaction is required');
              let settlementPlan;
              try {
                settlementPlan = buildSettlementPlan(context.stages.filter((stage) => stage.nodeType === 'task'), context.agents);
              } catch (error) {
                throw new ApiError(409, 'INVALID_SETTLEMENT_PLAN', error instanceof Error ? error.message : 'The settlement plan is invalid');
              }
              payoutHash = settlementPlan.payoutHash;
              chainVerification = await (dependencies.depositVerifier ?? verifyDepositTransaction)(
                env,
                depositTxHash,
                missionId,
                context.mission.budget,
                context.mission.paymentMethod,
                settlementPlan.payoutHash,
                user.walletAddress,
              );
              if (!chainVerification.ok) throw new ApiError(chainVerification.status, chainVerification.code, chainVerification.message);
              requesterWalletAddress = chainVerification.requester?.toLocaleLowerCase() ?? null;
              if (!requesterWalletAddress) {
                throw new ApiError(409, 'SETTLEMENT_REQUESTER_MISSING', 'The verified escrow event does not identify its requester');
              }
            } else if (depositTxHash) {
              throw new ApiError(400, 'UNEXPECTED_CHAIN_TRANSACTION', 'Web2 余额支付不接受链上交易哈希');
            }
            let startResult;
            try {
              startResult = await store.startMission(
                missionId,
                context.mission.requesterId,
                depositTxHash,
                payoutHash,
                now.toISOString(),
                requesterWalletAddress,
              );
            } catch (paymentError) {
              if (paymentError instanceof Error && paymentError.message.includes('INSUFFICIENT_BALANCE')) {
                throw new ApiError(409, 'INSUFFICIENT_BALANCE', 'Web2 余额不足，请先到测试充值页领取体验余额');
              }
              throw paymentError;
            }
            if (!startResult) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found');
            if (!startResult.applied) {
              const currentEscrow = await store.getEscrow(missionId);
              if (startResult.mission.status === 'running' && currentEscrow?.status === 'held') {
                return success(request, env, requestId, { mission: startResult.mission, escrow: currentEscrow, pollAfterMs: 3000 }, 200, { replayed: true });
              }
              throw new ApiError(409, 'MISSION_ALREADY_STARTED', 'Mission funding has already started or is no longer available');
            }
            const saved = startResult.mission;
            await store.addEvent({
              id: makeId('EVT'), missionId, stageId: null, type: 'mission.started', message: '执行网络已启动',
              actorType: 'requester', actorId: user.id,
              payload: { depositTxHash, payoutHash, requesterWalletAddress, paymentMethod: context.mission.paymentMethod, settlementMode: settlementDescriptor(env).mode, chainVerification },
              createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
            }, 1, '执行网络已启动');
            await enqueueReadyTaskNodes(store, missionId, now.toISOString());
            if (executionContext) {
              executionContext.waitUntil(dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now, cascadeBuiltin: true }).then(() => undefined));
            }
            return success(request, env, requestId, { mission: saved, escrow: await store.getEscrow(missionId), pollAfterMs: 3000 });
          }

          if (action === 'dispatch' && method === 'POST') {
            if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can dispatch execution');
            if (context.mission.status !== 'running') throw new ApiError(409, 'MISSION_NOT_RUNNING', 'Mission must be running before dispatch');
            if ((await store.getEscrow(missionId))?.status !== 'held') throw new ApiError(409, 'ESCROW_NOT_HELD', 'Mission escrow must be held before dispatch');
            const queuedReady = readyNodes(context.stages, context.edges).tasks;
            if (!queuedReady.length) {
              const pending = await store.listPendingDispatches(80, now.toISOString());
              const pendingIds = new Set(pending.filter((item) => item.missionId === missionId).map((item) => item.stageId));
              const recovering = context.stages.some((stage) => stage.nodeType === 'task' && stage.status === 'running' && pendingIds.has(stage.id));
              if (!recovering) throw new ApiError(409, 'NO_RUNNABLE_NODE', 'No queued workflow task node is ready to dispatch; failed nodes require an explicit retry');
            }
            const dispatches = await dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now });
            if (!dispatches.length) throw new ApiError(409, 'NO_RUNNABLE_NODE', 'No workflow task node is ready to dispatch');
            const first = dispatches[0];
            if (dispatches.length === 1 && 'error' in first) throw new ApiError(first.error.status, first.error.code, first.error.message);
            const firstSuccess = dispatches.find((item): item is NodeDispatchResult => !('error' in item));
            return success(request, env, requestId, {
              dispatches,
              // Compatibility fields for clients that still consume one linear stage.
              stage: firstSuccess?.stage ?? null,
              mission: firstSuccess?.mission ?? await store.getMission(missionId),
              agent: firstSuccess?.agent ?? null,
              acknowledgement: firstSuccess?.acknowledgement ?? null,
            }, 202, { count: dispatches.length, parallel: dispatches.length > 1, builtin: firstSuccess?.builtin ?? false });
          }

          if (action === 'events' && method === 'GET') {
            return success(request, env, requestId, await store.listEvents(missionId));
          }

          if (action === 'events' && method === 'POST') {
            if (context.mission.status !== 'running' && context.mission.status !== 'review') {
              throw new ApiError(409, 'MISSION_TERMINAL', 'Events cannot be appended to a terminal or unfunded mission');
            }
            const body = await readObject(request);
            if (user.role === 'developer') {
              throw new ApiError(403, 'SIGNED_AGENT_CALLBACK_REQUIRED', 'Developers must use the signed Agent callback or deliverable endpoint');
            }
            if (user.role === 'requester') {
              const type = requiredString(body, 'type', 3, 100);
              if (type !== 'mission.assistance_requested') {
                throw new ApiError(403, 'EVENT_TYPE_FORBIDDEN', 'Requesters can only submit the assistance request command');
              }
              if (body.progress !== undefined || body.currentStage !== undefined || body.stageId !== undefined) {
                throw new ApiError(400, 'CANONICAL_STATE_FORBIDDEN', 'Requester events cannot supply progress, stage, or canonical status text');
              }
              const event: ExecutionEvent = {
                id: makeId('EVT'), missionId, stageId: null, type,
                message: '任务方请求平台人工协助', actorType: 'requester', actorId: user.id,
                payload: {}, createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
              };
              await store.addEvent(event, undefined, '等待平台人工协助');
              return success(request, env, requestId, event, 201);
            }
            const stageId = optionalString(body, 'stageId', 120);
            if (stageId && !context.stages.some((stage) => stage.id === stageId)) throw new ApiError(400, 'INVALID_STAGE', 'stageId does not belong to this mission');
            const progress = body.progress === undefined ? undefined : finiteNumber(body, 'progress', context.mission.progress, 100);
            const event: ExecutionEvent = {
              id: makeId('EVT'), missionId, stageId,
              type: requiredString(body, 'type', 3, 100),
              message: requiredString(body, 'message', 2, 500),
              actorType: user.role === 'developer' ? 'developer' : user.role === 'requester' ? 'requester' : 'platform',
              actorId: user.id,
              payload: recordValue(body, 'payload'),
              createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
            };
            await store.addEvent(event, progress, optionalString(body, 'currentStage', 200) ?? undefined);
            return success(request, env, requestId, event, 201);
          }

          if (action === 'deliverables' && method === 'GET') {
            return success(request, env, requestId, await store.listDeliverables(missionId));
          }

          if (action === 'deliverables' && method === 'POST') {
            if (user.role !== 'developer' && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Developer role is required');
            if (context.mission.status !== 'running' || (await store.getEscrow(missionId))?.status !== 'held') {
              throw new ApiError(409, 'MISSION_NOT_RUNNING', 'Deliverables require a running mission with held escrow');
            }
            const body = await readObject(request);
            const stageId = optionalString(body, 'stageId', 120);
            const stage = stageId ? context.stages.find((candidate) => candidate.id === stageId) : null;
            if (stageId && !stage) throw new ApiError(400, 'INVALID_STAGE', 'stageId does not belong to this mission');
            if (user.role === 'developer' && stage?.agentId) {
              const assignedAgent = context.agents.find((candidate) => candidate.id === stage.agentId);
              if (!assignedAgent || assignedAgent.ownerId !== user.id) throw new ApiError(403, 'FORBIDDEN', 'Developers can only submit deliverables for their own assigned Agent');
            }
            const deliverable: Deliverable = {
              id: makeId('DEL'), missionId, stageId,
              agentId: stage?.agentId ?? null,
              name: requiredString(body, 'name', 2, 180),
              uri: safeUrl(requiredString(body, 'uri', 8, 2_000), 'uri'),
              contentHash: requiredString(body, 'contentHash', 8, 256),
              mimeType: requiredString(body, 'mimeType', 3, 120),
              status: 'submitted',
              createdAt: (dependencies.now?.() ?? new Date()).toISOString(),
            };
            await store.addDeliverable(deliverable);
            await store.addEvent({
              id: makeId('EVT'), missionId, stageId, type: 'deliverable.submitted', message: `${deliverable.name} 已提交`,
              actorType: 'developer', actorId: user.id, payload: { deliverableId: deliverable.id, contentHash: deliverable.contentHash },
              createdAt: deliverable.createdAt,
            });
            await deliverNotification(store, env, dependencies, {
              userId: context.mission.requesterId,
              category: 'task',
              title: '新的交付物待查看',
              detail: `${context.mission.title} · ${deliverable.name} 已提交`,
              tone: 'info',
            });
            return success(request, env, requestId, deliverable, 201);
          }

          if (action === 'review' && method === 'POST') {
            if (user.role !== 'developer' && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Developer role is required');
            if (context.mission.status === 'review') return success(request, env, requestId, context.mission, 200, { replayed: true });
            if (context.mission.status !== 'running') throw new ApiError(409, 'MISSION_NOT_RUNNING', 'Only a running mission can enter review');
            const escrow = await store.getEscrow(missionId);
            if (escrow?.status !== 'held') throw new ApiError(409, 'ESCROW_NOT_HELD', 'Mission escrow must be held before review');
            const deliverables = await store.listDeliverables(missionId);
            requireWorkflowDelivery(context.stages, deliverables);
            const saved = await store.submitMissionForReview(missionId, reviewDueAt(now));
            await deliverNotification(store, env, dependencies, {
              userId: context.mission.requesterId,
              category: 'settlement',
              title: '任务已进入验收',
              detail: `${context.mission.title} 已完成执行，等待你的验收。`,
              tone: 'success',
            });
            return success(request, env, requestId, saved);
          }

          if (action === 'accept' && method === 'POST') {
            if (context.mission.requesterId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the requester can accept delivery');
            if (context.mission.status === 'completed') return success(request, env, requestId, await missionDetail(store, context.mission, now.toISOString()), 200, { replayed: true });
            if (context.mission.status !== 'review') throw new ApiError(409, 'MISSION_NOT_REVIEWABLE', 'Mission must be in review before acceptance');
            const deliverables = await store.listDeliverables(missionId);
            requireWorkflowDelivery(context.stages, deliverables);
            const escrow = await store.getEscrow(missionId);
            if (!escrow) throw new ApiError(404, 'ESCROW_NOT_FOUND', 'Mission escrow not found');
            if (escrow.status === 'frozen') throw new ApiError(409, 'ESCROW_FROZEN', 'Resolve the active dispute before accepting this mission');
            if (escrow.status !== 'held') throw new ApiError(409, 'ESCROW_NOT_HELD', 'Mission escrow is not available for release');
            const body = await readObject(request);
            const releaseTxHash = optionalString(body, 'releaseTxHash', 200);
            if (isWeb3Payment(context.mission.paymentMethod)) {
              if (!isOnchainSettlementConfigured(env)) {
                throw new ApiError(503, 'CHAIN_NOT_CONFIGURED', 'Sepolia mUSDC / sETH 托管尚未配置');
              }
              if (context.mission.requesterId !== user.id) {
                throw new ApiError(403, 'ONCHAIN_REQUESTER_REQUIRED', 'Only the mission requester can authorize an on-chain escrow release');
              }
              const settlementRequester = escrow.requesterWalletAddress ?? user.walletAddress;
              if (!settlementRequester) {
                throw new ApiError(409, 'WALLET_IDENTITY_REQUIRED', 'Link a wallet to the verified account before using on-chain settlement');
              }
              if (!releaseTxHash) throw new ApiError(400, 'RELEASE_TX_REQUIRED', 'A verified escrow release transaction is required');
              let settlementPlan;
              try {
                settlementPlan = buildSettlementPlan(
                  context.stages.filter((stage) => stage.nodeType === 'task'),
                  context.agents,
                );
              } catch (error) {
                throw new ApiError(409, 'INVALID_SETTLEMENT_PLAN', error instanceof Error ? error.message : 'The settlement plan is invalid');
              }
              if (escrow.payoutHash !== settlementPlan.payoutHash) {
                throw new ApiError(409, 'PAYOUT_COMMITMENT_MISMATCH', 'The stored payout commitment no longer matches the assigned workflow');
              }
              const verification = await verifyReleaseTransaction(
                env,
                releaseTxHash,
                missionId,
                context.mission.budget,
                context.mission.paymentMethod,
                settlementPlan.payoutHash,
                settlementRequester,
              );
              if (!verification.ok) throw new ApiError(verification.status, verification.code, verification.message);
            } else if (releaseTxHash) {
              throw new ApiError(400, 'UNEXPECTED_CHAIN_TRANSACTION', 'Web2 余额结算不接受链上交易哈希');
            }
            const acceptance = await store.acceptMission(missionId, user.id, releaseTxHash);
            if (!acceptance) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission or escrow not found');
            if (!acceptance.applied) {
              return success(request, env, requestId, await missionDetail(store, acceptance.mission, now.toISOString()), 200, { replayed: true });
            }
            const saved = acceptance.mission;
            const developerIds = [...new Set(context.stages
              .map((stage) => context.agents.find((agent) => agent.id === stage.agentId)?.ownerId)
              .filter((ownerId): ownerId is string => Boolean(ownerId)))];
            await Promise.all(developerIds.map((developerId) => deliverNotification(store, env, dependencies, {
              userId: developerId,
              category: 'settlement',
              title: '任务已验收并结算',
              detail: `${context.mission.title} 已通过验收，分账记录已生成。`,
              tone: 'success',
            })));
            return success(request, env, requestId, await missionDetail(store, saved, now.toISOString()));
          }

          if (action === 'disputes' && method === 'POST') {
            if (context.mission.requesterId !== user.id && user.role !== 'admin') {
              throw new ApiError(403, 'FORBIDDEN', 'Only the requester or an administrator can freeze this escrow');
            }
            if (context.mission.status !== 'running' && context.mission.status !== 'review') {
              throw new ApiError(409, 'MISSION_NOT_DISPUTABLE', 'Only running or review missions can enter dispute');
            }
            const body = await readObject(request);
            const freezeTxHash = optionalString(body, 'freezeTxHash', 200);
            const activeDispute = (await store.getDisputes(missionId)).find((item) => item.status === 'open' || item.status === 'reviewing');
            if (activeDispute && freezeTxHash && activeDispute.freezeTxHash === freezeTxHash) {
              return success(request, env, requestId, activeDispute, 200, { replayed: true });
            }
            if (activeDispute) throw new ApiError(409, 'ACTIVE_DISPUTE_EXISTS', 'This mission already has an active dispute');
            const escrow = await store.getEscrow(missionId);
            if (!escrow || escrow.status !== 'held') throw new ApiError(409, 'ESCROW_NOT_HELD', 'Mission escrow is not available to freeze');
            const evidenceRaw = Array.isArray(body.evidence) ? body.evidence : [];
            const evidence = evidenceRaw.slice(0, 20).map((item) => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(400, 'VALIDATION_ERROR', 'evidence items must be objects');
              const entry = item as Record<string, unknown>;
              return {
                label: requiredString(entry, 'label', 1, 120),
                uri: safeUrl(requiredString(entry, 'uri', 8, 2_000), 'evidence.uri'),
              };
            });
            if (isWeb3Payment(context.mission.paymentMethod)) {
              const chainActor = context.mission.requesterId === user.id
                ? escrow.requesterWalletAddress ?? user.walletAddress
                : user.walletAddress;
              if (!chainActor) throw new ApiError(409, 'WALLET_IDENTITY_REQUIRED', 'Link the wallet that will freeze the on-chain escrow');
              if (!freezeTxHash) throw new ApiError(400, 'FREEZE_TX_REQUIRED', 'A verified on-chain freeze transaction is required');
              const verification = await verifyFreezeTransaction(env, freezeTxHash, missionId, chainActor);
              if (!verification.ok) throw new ApiError(verification.status, verification.code, verification.message);
            } else if (freezeTxHash) {
              throw new ApiError(400, 'UNEXPECTED_CHAIN_TRANSACTION', 'Web2 balance disputes do not accept a chain transaction hash');
            }
            const dispute: Dispute = {
              id: makeId('DSP'), missionId, openedBy: user.id,
              reason: requiredString(body, 'reason', 20, 4_000), evidence, status: 'open', resolution: null,
              freezeTxHash, resolutionTxHash: null,
              createdAt: (dependencies.now?.() ?? new Date()).toISOString(), resolvedAt: null,
            };
            try {
              await store.createDispute(dispute);
            } catch (error) {
              if (error instanceof Error && error.message.includes('ACTIVE_DISPUTE_EXISTS')) {
                throw new ApiError(409, 'ACTIVE_DISPUTE_EXISTS', 'This mission already has an active dispute');
              }
              if (error instanceof Error && error.message.includes('ESCROW_NOT_HELD')) {
                throw new ApiError(409, 'ESCROW_NOT_HELD', 'Mission escrow was already frozen or released by another request');
              }
              throw error;
            }
            const participantIds = [...new Set([
              context.mission.requesterId,
              ...context.stages
                .map((stage) => context.agents.find((agent) => agent.id === stage.agentId)?.ownerId)
                .filter((ownerId): ownerId is string => Boolean(ownerId)),
            ])].filter((participantId) => participantId !== user.id);
            await Promise.all(participantIds.map((participantId) => deliverNotification(store, env, dependencies, {
              userId: participantId,
              category: 'settlement',
              title: '任务结算已进入争议流程',
              detail: `${context.mission.title} 的托管资金已完成${isWeb3Payment(context.mission.paymentMethod) ? '链上' : '账本'}冻结，等待平台审核。`,
              tone: 'warning',
            })));
            return success(request, env, requestId, dispute, 201);
          }
        }

        if (pathname === '/api/agents' && method === 'POST') {
          if (user.role !== 'developer' && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Developer role is required');
          const body = await readObject(request);
          if ('apiKey' in body || 'token' in body || 'secret' in body || 'credential' in body) {
            throw new ApiError(400, 'SECRET_NOT_ACCEPTED', 'Agent credentials must be configured as Worker secrets and are never stored in D1');
          }
          const result = await runIdempotent(request, store, user, body, async () => {
            const now = (dependencies.now?.() ?? new Date()).toISOString();
            const name = requiredString(body, 'name', 2, 100);
            let id = slugify(name);
            if (await store.getAgent(id)) id = `${id}-${crypto.randomUUID().slice(0, 6)}`;
            const agent: Agent = {
              id, ownerId: user.id, name,
              category: requiredString(body, 'category', 2, 80),
              summary: requiredString(body, 'summary', 20, 2_000),
              tags: stringArray(body, 'tags'),
              endpoint: safeAgentEndpoint(requiredString(body, 'endpoint', 8, 2_000)),
              authType: enumValue(body, 'authType', ['none', 'api_key', 'bearer', 'jwt'] as const, 'none'),
              inputSchema: recordValue(body, 'inputSchema'),
              outputSchema: recordValue(body, 'outputSchema'),
              price: finiteNumber(body, 'price', 0, 1_000_000),
              wallet: evmAddress(body, 'wallet'),
              status: 'trial', version: optionalString(body, 'version', 40) ?? 'v1.0.0',
              trustScore: 0, successRate: 0, responseTime: '待测试', jobs: 0, volume: 0,
              author: user.displayName, official: false, createdAt: now, updatedAt: now,
            };
            await store.createAgent(agent);
            return { status: 201, body: agent };
          });
          return success(request, env, requestId, result.body, result.status, { replayed: Boolean(result.replayed) });
        }

        const agentActionMatch = pathname.match(/^\/api\/agents\/([^/]+)\/(trial|status)$/);
        if (agentActionMatch && method === 'POST') {
          const agent = await store.getAgent(decodeURIComponent(agentActionMatch[1]));
          if (!agent) throw new ApiError(404, 'AGENT_NOT_FOUND', 'Agent not found');
          if (agent.ownerId !== user.id && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only the Agent owner can update it');
          if (agentActionMatch[2] === 'trial') {
            await (dependencies.endpointValidator ?? validateAgentEndpointResolution)(agent.endpoint, env);
            const challenge = crypto.randomUUID();
            const startedAt = Date.now();
            let trialResponse: Response;
            try {
              trialResponse = await (dependencies.fetcher ?? fetch)(agent.endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-AgentMesh-Trial': challenge,
                  ...await agentCredentialHeaders(env, agent),
                },
                body: JSON.stringify({
                  type: 'agentmesh.trial.v1',
                  challenge,
                  input: { task: 'Return a structured acknowledgement for this connectivity and schema trial.' },
                }),
                signal: AbortSignal.timeout(15_000),
              });
            } catch (error) {
              if (error instanceof ApiError) throw error;
              throw new ApiError(502, 'AGENT_TRIAL_UNREACHABLE', 'The Agent endpoint could not be reached during the live trial');
            }
            if (!trialResponse.ok) throw new ApiError(502, 'AGENT_TRIAL_REJECTED', `The Agent endpoint returned HTTP ${trialResponse.status} during trial`);
            const responseTimeMs = Math.max(1, Date.now() - startedAt);
            let trialOutput: Record<string, unknown>;
            try {
              const parsed = JSON.parse(await readLimitedResponse(trialResponse)) as unknown;
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
              trialOutput = parsed as Record<string, unknown>;
            } catch (error) {
              if (error instanceof ApiError) throw error;
              throw new ApiError(502, 'AGENT_TRIAL_INVALID_RESPONSE', 'The Agent trial response must be a JSON object');
            }
            if (trialOutput.challenge !== challenge || !['ok', 'success', 'accepted'].includes(String(trialOutput.status ?? '').toLocaleLowerCase())) {
              throw new ApiError(502, 'AGENT_TRIAL_CHALLENGE_FAILED', 'The Agent must echo the signed trial challenge and return an accepted status');
            }
            const llm = await callPinmeLlm(env, [
              { role: 'system', content: 'Evaluate this Agent registration and its verified live challenge response. Return JSON only: {"score":0-10,"summary":"..."}. Reward clear schemas, focused capabilities, verifiable structured outputs, and fast valid responses.' },
              { role: 'user', content: JSON.stringify({ name: agent.name, category: agent.category, summary: agent.summary, tags: agent.tags, inputSchema: agent.inputSchema, outputSchema: agent.outputSchema, responseTimeMs, trialOutput }) },
            ]);
            const evaluation = llm.content ? parseTrialScore(llm.content) : null;
            const score = evaluation?.score ?? fallbackTrialScore(agent);
            const updated = await store.updateAgentTrial(agent.id, score, score >= 7.5 ? 'active' : 'trial', responseTimeMs);
            return success(request, env, requestId, { agent: updated, score, responseTimeMs, summary: evaluation?.summary ?? '实时端点挑战通过，已使用规则引擎完成结构化评分。' }, 200, { source: evaluation ? 'pinme-llm' : 'fallback', liveChallenge: true });
          }
          const body = await readObject(request);
          const status = enumValue(body, 'status', ['active', 'paused'] as const);
          if (agent.status === 'trial') throw new ApiError(409, 'AGENT_TRIAL_REQUIRED', 'A trial Agent must pass the live trial before it can be activated');
          if (status === 'active' && agent.trustScore < 7.5) throw new ApiError(409, 'AGENT_TRUST_REQUIRED', 'This Agent does not meet the activation trust threshold');
          if (status === agent.status) return success(request, env, requestId, agent, 200, { replayed: true });
          return success(request, env, requestId, await store.updateAgentStatus(agent.id, status));
        }

        if (pathname === '/api/developer/summary' && method === 'GET') {
          if (user.role !== 'developer' && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Developer role is required');
          return success(request, env, requestId, await store.getDeveloperSummary(user.id));
        }

        if (pathname === '/api/developer/ledger' && method === 'GET') {
          if (user.role !== 'developer' && user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Developer role is required');
          const rawLimit = url.searchParams.get('limit');
          const requestedLimit = rawLimit === null ? 50 : Number(rawLimit);
          if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100');
          }
          const token = url.searchParams.get('token') ?? 'CREDIT';
          if (!['CREDIT', 'mUSDC', 'sETH'].includes(token)) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'token must be CREDIT, mUSDC, or sETH');
          }
          const ledger = await store.getDeveloperLedger(user.id, requestedLimit, decodeLedgerCursor(url.searchParams.get('cursor')), token);
          return success(request, env, requestId, {
            ...ledger,
            pageInfo: { ...ledger.pageInfo, nextCursor: encodeLedgerCursor(ledger.pageInfo.nextCursor) },
          }, 200, { limit: requestedLimit, token });
        }

        if (pathname === '/api/disputes' && method === 'GET') {
          return success(request, env, requestId, await store.listDisputes(user));
        }

        const disputeActionMatch = pathname.match(/^\/api\/disputes\/([^/]+)\/(actions|governance|review|votes|finalize|resolve)$/);
        if (disputeActionMatch) {
          const disputeId = decodeURIComponent(disputeActionMatch[1]);
          const action = disputeActionMatch[2];
          const accessible = (await store.listDisputes(user)).find((item) => item.id === disputeId);
          if (!accessible) throw new ApiError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found');

          if (action === 'actions' && method === 'GET') {
            return success(request, env, requestId, await store.listDisputeActions(disputeId));
          }

          const arbitrationNow = (dependencies.now?.() ?? new Date()).toISOString();
          if (action === 'governance' && method === 'GET') {
            const governance = await store.getDisputeGovernance(disputeId, user.id, arbitrationNow);
            if (!governance) throw new ApiError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found');
            return success(request, env, requestId, governance);
          }

          if (action === 'votes' && method === 'POST') {
            const body = await readObject(request);
            const choice = enumValue(body, 'choice', ['support_refund', 'oppose_refund', 'abstain'] as const);
            const reason = requiredString(body, 'reason', 12, 2_000);
            const result = await store.castDisputeVote(disputeId, user.id, choice, reason, arbitrationNow);
            if (result.state === 'missing') throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Arbitration proposal not found');
            if (result.state === 'not_eligible') throw new ApiError(403, 'ARBITRATION_NOT_ELIGIBLE', 'This account is not in the proposal electorate snapshot');
            if (result.state === 'already_voted') throw new ApiError(409, 'ARBITRATION_ALREADY_VOTED', 'Each electorate member can vote only once');
            if (result.state === 'expired') throw new ApiError(409, 'ARBITRATION_VOTING_ENDED', 'The voting period has ended');
            if (result.state === 'closed') throw new ApiError(409, 'ARBITRATION_PROPOSAL_CLOSED', 'The arbitration proposal is already finalized');
            return success(request, env, requestId, result.governance, 201);
          }

          if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Admin role is required');
          if (action === 'review' && method === 'POST') {
            if (!['open', 'reviewing'].includes(accessible.status)) throw new ApiError(409, 'DISPUTE_CLOSED', 'Only open disputes can enter review');
            const existingGovernance = await store.getDisputeGovernance(disputeId, user.id, arbitrationNow);
            if (existingGovernance?.proposal) return success(request, env, requestId, accessible, 200, { replayed: true });
            let dispute;
            try {
              dispute = await store.startDisputeReview(disputeId, user.id, arbitrationNow);
            } catch (reviewError) {
              if (reviewError instanceof Error && reviewError.message.includes('ARBITRATION_NO_ELIGIBLE_MEMBERS')) {
                throw new ApiError(409, 'ARBITRATION_NO_ELIGIBLE_MEMBERS', '至少需要一名与案件无利益冲突的活跃仲裁委员');
              }
              throw reviewError;
            }
            await deliverNotification(store, env, dependencies, {
              userId: accessible.openedBy,
              category: 'settlement',
              title: '争议案件已开始审核',
              detail: `案件 ${disputeId} 已由平台管理员接手。`,
              tone: 'info',
            });
            return success(request, env, requestId, dispute);
          }

          if (action === 'finalize' && method === 'POST') {
            const result = await store.finalizeDisputeProposal(disputeId, user.id, arbitrationNow);
            if (result.state === 'missing') throw new ApiError(404, 'PROPOSAL_NOT_FOUND', 'Arbitration proposal not found');
            if (result.state === 'not_ready') throw new ApiError(409, 'ARBITRATION_VOTE_NOT_READY', 'Voting is still active and the result is not irreversible');
            return success(request, env, requestId, result.governance);
          }

          if (action === 'resolve' && method === 'POST') {
            if (accessible.status === 'resolved' || accessible.status === 'rejected') {
              throw new ApiError(409, 'DISPUTE_ALREADY_RESOLVED', 'Another ruling has already closed this dispute');
            }
            if (accessible.status !== 'reviewing') throw new ApiError(409, 'REVIEW_REQUIRED', 'Start review before resolving a dispute');
            const body = await readObject(request);
            const status = enumValue(body, 'status', ['resolved', 'rejected'] as const);
            const resolution = requiredString(body, 'resolution', 20, 4_000);
            const resolutionTxHash = optionalString(body, 'resolutionTxHash', 200);
            const governance = await store.getDisputeGovernance(disputeId, user.id, arbitrationNow);
            const authorized = status === 'resolved'
              ? governance?.proposal?.status === 'succeeded' && governance.proposal.outcome === 'refund_requester'
              : governance?.proposal?.status === 'defeated' && governance.proposal.outcome === 'reject_dispute';
            if (!authorized) {
              throw new ApiError(409, 'ARBITRATION_AUTHORIZATION_REQUIRED', 'A finalized DAO vote matching this ruling is required');
            }
            const mission = await store.getMission(accessible.missionId);
            const escrow = await store.getEscrow(accessible.missionId);
            if (!mission || !escrow) throw new ApiError(404, 'MISSION_NOT_FOUND', 'The disputed mission or escrow no longer exists');
            if (escrow.status !== 'frozen') throw new ApiError(409, 'ESCROW_NOT_FROZEN', 'The escrow must be frozen before a dispute can be resolved');
            if (isWeb3Payment(mission.paymentMethod)) {
              if (!user.walletAddress) throw new ApiError(409, 'WALLET_IDENTITY_REQUIRED', 'Link an arbiter wallet before submitting an on-chain ruling');
              if (!resolutionTxHash) throw new ApiError(400, 'RESOLUTION_TX_REQUIRED', 'A verified on-chain ruling transaction is required');
              const requesterWallet = escrow.requesterWalletAddress ?? (await store.getProfile(mission.requesterId))?.walletAddress;
              if (!requesterWallet) throw new ApiError(409, 'REQUESTER_WALLET_MISSING', 'The verified requester wallet is unavailable for refund verification');
              const verification = status === 'resolved'
                ? await verifyRefundTransaction(env, resolutionTxHash, mission.id, mission.budget, mission.paymentMethod, user.walletAddress, requesterWallet)
                : await verifyUnfreezeTransaction(env, resolutionTxHash, mission.id, user.walletAddress);
              if (!verification.ok) throw new ApiError(verification.status, verification.code, verification.message);
            } else if (resolutionTxHash) {
              throw new ApiError(400, 'UNEXPECTED_CHAIN_TRANSACTION', 'Web2 balance rulings do not accept a chain transaction hash');
            }
            const resolutionResult = await store.resolveDispute(
              disputeId,
              resolution,
              status,
              user.id,
              resolutionTxHash,
            );
            if (!resolutionResult) throw new ApiError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found');
            if (!resolutionResult.applied) {
              throw new ApiError(409, 'DISPUTE_ALREADY_RESOLVED', 'Another ruling has already closed this dispute');
            }
            const dispute = resolutionResult.dispute;
            await deliverNotification(store, env, dependencies, {
              userId: accessible.openedBy,
              category: 'settlement',
              title: dispute.status === 'resolved' ? '争议案件已解决' : '争议申请已驳回',
              detail: dispute.resolution ?? `案件 ${disputeId} 已完成裁决。`,
              tone: dispute.status === 'resolved' ? 'success' : 'warning',
            });
            return success(request, env, requestId, dispute);
          }
        }

        if (pathname === '/api/notifications' && method === 'GET') {
          return success(request, env, requestId, await store.listNotifications(user.id));
        }

        if (pathname === '/api/notifications/read' && method === 'POST') {
          await store.markNotificationsRead(user.id);
          return success(request, env, requestId, { ok: true });
        }

        if (pathname === '/api/notifications/test-email' && method === 'POST') {
          if (!user.email) throw new ApiError(409, 'EMAIL_UNAVAILABLE', 'The authenticated profile has no email address');
          const body = await readObject(request);
          const result = await (dependencies.emailSender ?? sendPinmeEmail)(env, {
            to: user.email,
            subject: optionalString(body, 'subject', 160) ?? 'AgentMesh 通知通道测试',
            html: '<p>AgentMesh 通知通道工作正常。</p>',
          });
          if (!result.ok) throw new ApiError(502, 'EMAIL_FAILED', result.error ?? 'Email delivery failed');
          return success(request, env, requestId, { ok: true, recipient: user.email });
        }

        throw new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found');
      } catch (error) {
        if (error instanceof ApiError) return failure(request, env, requestId, error);
        return failure(request, env, requestId, new ApiError(500, 'INTERNAL_ERROR', 'Internal server error'));
      }
    },
    async scheduled(_controller: unknown, env: Env, executionContext: WorkerExecutionContext): Promise<void> {
      const store = getStore(env, dependencies);
      const now = dependencies.now?.() ?? new Date();
      const pending = await store.listPendingDispatches(80, now.toISOString());
      const missionIds = [...new Set(pending.map((item) => item.missionId))];
      const configuredOrigin = env.PUBLIC_BASE_URL?.trim()
        || (env.PROJECT_NAME?.trim() ? `https://${env.PROJECT_NAME.trim()}.api.pinme.pro` : 'https://agentmesh.invalid');
      for (const missionId of missionIds) {
        const request = new Request(`${configuredOrigin.replace(/\/$/, '')}/api/internal/workflow-dispatch`);
        executionContext.waitUntil(dispatchReadyWorkflowNodes({ request, env, dependencies, store, missionId, now, cascadeBuiltin: true }).then(() => undefined));
      }
    },
  };
}

export default createApp();
