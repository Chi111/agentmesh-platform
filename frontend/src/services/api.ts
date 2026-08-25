import type {
  Agent,
  AgentFeedback,
  AgentQualityStats,
  AgentQualityPublicDetail,
  AdminAgentQualityRow,
  AdminAction,
  AdminUser,
  ArbitrationMember,
  CandidateMatch,
  Deliverable,
  DeveloperLedger,
  Dispute,
  DisputeAction,
  DisputeGovernance,
  DisputeVoteChoice,
  ExecutionEvent,
  EcosystemGovernanceDetail,
  EcosystemProposalType,
  EcosystemVoteChoice,
  Mission,
  MissionDetail,
  NewAgentInput,
  NewDeliverableInput,
  NewMissionInput,
  NotificationItem,
  StageOffer,
  UserProfile,
  UserPreferences,
  UserRole,
  WalletAccount,
  YdChainConfig,
  YdFinanceOverview,
  RewardEpoch,
  RewardAllocation,
  WorkflowStage,
  WorkflowEdge,
  WorkflowViewport,
} from '../types/domain';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

interface AuthTokens {
  accessToken: string;
  identityToken?: string | null;
}

type TokenProvider = () => Promise<string | AuthTokens>;

let tokenProvider: TokenProvider | null = null;

interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiFailure {
  error?: { code?: string; message?: string; details?: unknown };
  meta?: { requestId?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'API_ERROR',
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function apiFailureMessage(failure: ApiFailure | null, status: number) {
  const code = failure?.error?.code;
  if (status === 429 || code === 'RATE_LIMITED') {
    const details = failure?.error?.details;
    const resetAt = details && typeof details === 'object' && 'resetAt' in details
      ? Number(details.resetAt)
      : Number.NaN;
    const seconds = Number.isFinite(resetAt)
      ? Math.max(1, Math.ceil(resetAt - Date.now() / 1_000))
      : null;
    return seconds
      ? `请求过于频繁，请在 ${seconds} 秒后重试。`
      : '请求过于频繁，请稍候再试。';
  }
  return failure?.error?.message ?? `请求失败（HTTP ${status}）`;
}

export function setApiTokenProvider(provider: TokenProvider | null) {
  tokenProvider = provider;
}

export function hasApiSession() {
  return tokenProvider !== null;
}

export function getApiUrl(path: string) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

async function authenticatedHeaders(): Promise<Headers> {
  if (!tokenProvider) throw new ApiError('请先登录后再执行此操作。', 401, 'AUTH_REQUIRED');
  const provided = await tokenProvider();
  const tokens = typeof provided === 'string' ? { accessToken: provided } : provided;
  const headers = new Headers({ Authorization: `Bearer ${tokens.accessToken}` });
  if (tokens.identityToken) headers.set('Privy-Id-Token', tokens.identityToken);
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean; idempotencyKey?: string } = {},
): Promise<T> {
  const { authenticated = false, idempotencyKey, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set('Accept', 'application/json');
  if (requestOptions.body) headers.set('Content-Type', 'application/json');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  if (authenticated) {
    const authHeaders = await authenticatedHeaders();
    authHeaders.forEach((value, key) => headers.set(key, value));
  }

  let response: Response;
  try {
    response = await fetch(getApiUrl(path), { ...requestOptions, headers });
  } catch {
    throw new ApiError('无法连接 AgentMesh 服务，请检查网络后重试。', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const failure = await response.json().catch(() => null) as ApiFailure | null;
    throw new ApiError(
      apiFailureMessage(failure, response.status),
      response.status,
      failure?.error?.code ?? 'API_ERROR',
      failure?.meta?.requestId,
      failure?.error?.details,
    );
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!payload || !('data' in payload)) throw new ApiError('服务返回了无法识别的数据。', response.status, 'INVALID_RESPONSE');
  return payload.data;
}

export const api = {
  listAgents: () => request<Agent[]>('/api/agents'),
  getAgentQuality: (agentId: string) => request<AgentQualityPublicDetail>(`/api/agents/${encodeURIComponent(agentId)}/quality`),
  register: (input: { email: string; password: string; displayName?: string }) =>
    request<{ user: unknown; emailVerificationRequired: boolean }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  verifySession: (idToken: string, identityToken?: string | null) =>
    request<{ profile: UserProfile }>('/api/auth/verify', {
      method: 'POST',
      headers: identityToken ? { 'Privy-Id-Token': identityToken } : undefined,
      body: JSON.stringify({ idToken }),
    }),
  bootstrap: () => request<{
    profile: UserProfile;
    missions: Mission[];
    agents: Agent[];
    notifications: Array<{
      id: string;
      title: string;
      detail: string;
      tone: NotificationItem['tone'];
      read: boolean;
      createdAt: string;
    }>;
    developer: { jobs: number; activeAgents: number; volume: number; pending: number } | null;
  }>('/api/bootstrap', { authenticated: true }),
  updateRole: (role: Exclude<UserRole, 'admin'>) => request<UserProfile>('/api/me/role', {
    method: 'PUT', authenticated: true, body: JSON.stringify({ role }),
  }),
  getPreferences: () => request<UserPreferences>('/api/me/preferences', { authenticated: true }),
  updatePreferences: (preferences: Omit<UserPreferences, 'updatedAt'>) => request<UserPreferences>('/api/me/preferences', {
    method: 'PUT', authenticated: true, body: JSON.stringify(preferences),
  }),
  getWalletAccount: () => request<WalletAccount>('/api/wallet', { authenticated: true }),
  claimTestCredit: () => request<{ account: WalletAccount; credited: boolean }>('/api/wallet/test-topup', {
    method: 'POST', authenticated: true, body: '{}',
  }),
  getYdConfig: () => request<YdChainConfig & { phase: string; escrowSeparated: boolean; earnVaultEnabled: boolean; warnings: string[] }>('/api/yd/config'),
  getYdOverview: () => request<YdFinanceOverview>('/api/yd/overview', { authenticated: true }),
  syncYdClaim: (epochId: string, txHash: string) => request<{ claim: unknown; applied: boolean }>('/api/yd/claims/sync', {
    method: 'POST', authenticated: true, body: JSON.stringify({ epochId, txHash }),
  }),
  syncYdStaking: (txHash: string) => request<YdFinanceOverview['staking']>('/api/yd/staking/sync', {
    method: 'POST', authenticated: true, body: JSON.stringify({ txHash }),
  }),
  createRewardEpoch: (input: {
    epochNumber: number;
    startsAt: string;
    endsAt: string;
    claimEndsAt: string;
    totalRewardUnits: string;
    accountScoreCap: number;
    rules?: Record<string, unknown>;
  }) => request<RewardEpoch>('/api/yd/admin/epochs', {
    method: 'POST', authenticated: true, body: JSON.stringify(input),
  }),
  computeRewardEpoch: (epochId: string) => request<{ state: 'computed'; epoch: RewardEpoch; allocations: RewardAllocation[] }>(`/api/yd/admin/epochs/${encodeURIComponent(epochId)}/compute`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  publishRewardEpoch: (epochId: string, txHash: string) => request<RewardEpoch>(`/api/yd/admin/epochs/${encodeURIComponent(epochId)}/publish`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ txHash }),
  }),
  expireRewardEpoch: (epochId: string, txHash: string) => request<RewardEpoch>(`/api/yd/admin/epochs/${encodeURIComponent(epochId)}/expire`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ txHash }),
  }),
  listYdGovernance: () => request<EcosystemGovernanceDetail[]>('/api/yd/governance/proposals', { authenticated: true }),
  createYdProposal: (input: {
    proposalType: EcosystemProposalType;
    title: string;
    description: string;
    payload?: Record<string, unknown>;
    endsAt: string;
    quorumBps: number;
    approvalBps: number;
    snapshotBlock?: string;
  }) => request<EcosystemGovernanceDetail>('/api/yd/admin/governance/proposals', {
    method: 'POST', authenticated: true, body: JSON.stringify(input),
  }),
  castYdVote: (proposalId: string, choice: EcosystemVoteChoice, reason: string) => request<EcosystemGovernanceDetail>(`/api/yd/governance/proposals/${encodeURIComponent(proposalId)}/votes`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ choice, reason }),
  }),
  finalizeYdProposal: (proposalId: string) => request<EcosystemGovernanceDetail>(`/api/yd/governance/proposals/${encodeURIComponent(proposalId)}/finalize`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  testNotificationEmail: () => request<{ ok: boolean; recipient: string }>('/api/notifications/test-email', {
    method: 'POST', authenticated: true, body: '{}',
  }),
  listAdminUsers: (limit = 100) => request<AdminUser[]>(`/api/admin/users?limit=${encodeURIComponent(String(limit))}`, { authenticated: true }),
  updateAdminUserRole: (userId: string, role: UserProfile['role']) => request<{ profile: AdminUser; action: AdminAction | null }>(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PUT', authenticated: true, body: JSON.stringify({ role }),
  }),
  listAdminActions: (limit = 100) => request<AdminAction[]>(`/api/admin/audit?limit=${encodeURIComponent(String(limit))}`, { authenticated: true }),
  listArbitrationMembers: () => request<ArbitrationMember[]>('/api/arbitration/members', { authenticated: true }),
  setArbitrationMember: (userId: string, active: boolean) => request<ArbitrationMember>(`/api/arbitration/members/${encodeURIComponent(userId)}`, {
    method: 'PUT', authenticated: true, body: JSON.stringify({ active }),
  }),
  createMission: (input: NewMissionInput) => request<{ mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[] }>('/api/missions', {
    method: 'POST',
    authenticated: true,
    idempotencyKey: `mission-${crypto.randomUUID()}`,
    body: JSON.stringify(input),
  }),
  getMission: (missionId: string) => request<MissionDetail>(`/api/missions/${encodeURIComponent(missionId)}`, { authenticated: true }),
  compileWorkflow: (missionId: string) => request<{ mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[] }>(`/api/missions/${encodeURIComponent(missionId)}/compile`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  saveWorkflowDraft: (missionId: string, input: {
    workflowVersion: number;
    nodes: WorkflowStage[];
    edges: WorkflowEdge[];
    viewport: WorkflowViewport;
  }) => request<{ mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[] }>(`/api/missions/${encodeURIComponent(missionId)}/workflow/draft`, {
    method: 'PUT', authenticated: true, body: JSON.stringify(input),
  }),
  getCandidates: (missionId: string) => request<CandidateMatch[]>(`/api/missions/${encodeURIComponent(missionId)}/candidates`, { authenticated: true }),
  confirmWorkflow: (missionId: string, assignments: Record<string, string>) => request<{ mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[]; offers: StageOffer[] }>(`/api/missions/${encodeURIComponent(missionId)}/workflow`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ assignments }),
  }),
  respondStageOffer: (missionId: string, offerId: string, decision: 'accepted' | 'declined') => request<StageOffer>(`/api/missions/${encodeURIComponent(missionId)}/offers/${encodeURIComponent(offerId)}`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ decision }),
  }),
  startMission: (missionId: string, depositTxHash: string | null = null) => request<{ mission: Mission }>(`/api/missions/${encodeURIComponent(missionId)}/start`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ depositTxHash }),
  }),
  dispatchMission: (missionId: string) => request<{ dispatches: unknown[]; stage: WorkflowStage | null; agent: { id: string; name: string } | null; acknowledgement: unknown }>(`/api/missions/${encodeURIComponent(missionId)}/dispatch`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  decideGate: (missionId: string, nodeId: string, input: { decision: 'approved' | 'rejected'; feedback?: string; reworkNodeIds?: string[] }) => request<{ mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[] }>(`/api/missions/${encodeURIComponent(missionId)}/gates/${encodeURIComponent(nodeId)}/decision`, {
    method: 'POST', authenticated: true, body: JSON.stringify(input),
  }),
  retryNode: (missionId: string, nodeId: string) => request<{ mission: Mission; stages: WorkflowStage[]; edges: WorkflowEdge[] }>(`/api/missions/${encodeURIComponent(missionId)}/nodes/${encodeURIComponent(nodeId)}/retry`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  addMissionEvent: (missionId: string, input: { type: string; message: string; currentStage?: string; stageId?: string; progress?: number }) => request<ExecutionEvent>(`/api/missions/${encodeURIComponent(missionId)}/events`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ ...input, payload: {} }),
  }),
  submitDeliverable: (missionId: string, input: NewDeliverableInput) => request<Deliverable>(`/api/missions/${encodeURIComponent(missionId)}/deliverables`, {
    method: 'POST', authenticated: true, body: JSON.stringify(input),
  }),
  submitForReview: (missionId: string) => request<Mission>(`/api/missions/${encodeURIComponent(missionId)}/review`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  acceptMission: (missionId: string, releaseTxHash: string | null = null) => request<MissionDetail>(`/api/missions/${encodeURIComponent(missionId)}/accept`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ releaseTxHash }),
  }),
  createDispute: (missionId: string, reason: string, freezeTxHash: string | null = null) => request<Dispute>(`/api/missions/${encodeURIComponent(missionId)}/disputes`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ reason, evidence: [], freezeTxHash }),
  }),
  listDisputes: () => request<Dispute[]>('/api/disputes', { authenticated: true }),
  listDisputeActions: (disputeId: string) => request<DisputeAction[]>(`/api/disputes/${encodeURIComponent(disputeId)}/actions`, { authenticated: true }),
  getDisputeGovernance: (disputeId: string) => request<DisputeGovernance>(`/api/disputes/${encodeURIComponent(disputeId)}/governance`, { authenticated: true }),
  startDisputeReview: (disputeId: string) => request<Dispute>(`/api/disputes/${encodeURIComponent(disputeId)}/review`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  castDisputeVote: (disputeId: string, choice: DisputeVoteChoice, reason: string) => request<DisputeGovernance>(`/api/disputes/${encodeURIComponent(disputeId)}/votes`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ choice, reason }),
  }),
  finalizeDisputeVote: (disputeId: string) => request<DisputeGovernance>(`/api/disputes/${encodeURIComponent(disputeId)}/finalize`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  resolveDispute: (disputeId: string, resolution: string, status: 'resolved' | 'rejected', resolutionTxHash: string | null = null) => request<Dispute>(`/api/disputes/${encodeURIComponent(disputeId)}/resolve`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ resolution, status, resolutionTxHash }),
  }),
  listNotifications: () => request<Array<{
    id: string;
    title: string;
    detail: string;
    tone: NotificationItem['tone'];
    read: boolean;
    createdAt: string;
  }>>('/api/notifications', { authenticated: true }),
  registerAgent: (input: NewAgentInput) => request<Agent>('/api/agents', {
    method: 'POST',
    authenticated: true,
    idempotencyKey: `agent-${crypto.randomUUID()}`,
    body: JSON.stringify({
      ...input,
      inputSchema: { task: 'string', context: 'object', request_id: 'uuid' },
      outputSchema: { status: 'string', result: 'object', evidence_hash: 'string' },
    }),
  }),
  runAgentTrial: (agentId: string) => request<{ agent: Agent; score: number; summary: string }>(`/api/agents/${encodeURIComponent(agentId)}/trial`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  updateAgentStatus: (agentId: string, status: 'active' | 'paused') => request<Agent>(`/api/agents/${encodeURIComponent(agentId)}/status`, {
    method: 'POST', authenticated: true, body: JSON.stringify({ status }),
  }),
  getAgentFeedback: (missionId: string, stageId: string) => request<AgentFeedback | null>(`/api/missions/${encodeURIComponent(missionId)}/stages/${encodeURIComponent(stageId)}/feedback`, { authenticated: true }),
  saveAgentFeedback: (missionId: string, stageId: string, input: { deliveryQuality: number; requirementsFit: number; communication: number; onTime: boolean; reuse: boolean; comment: string }) => request<{ feedback: AgentFeedback }>(`/api/missions/${encodeURIComponent(missionId)}/stages/${encodeURIComponent(stageId)}/feedback`, {
    method: 'PUT', authenticated: true, idempotencyKey: `feedback-${missionId}-${stageId}-${crypto.randomUUID()}`, body: JSON.stringify(input),
  }),
  listAdminAgentQuality: () => request<AdminAgentQualityRow[]>('/api/admin/agent-quality', { authenticated: true }),
  recomputeAgentQuality: (agentId: string) => request<AgentQualityStats>(`/api/admin/agents/${encodeURIComponent(agentId)}/quality/recompute`, {
    method: 'POST', authenticated: true, body: '{}',
  }),
  recordAdminAgentQualityEvent: (agentId: string, input: { type: 'security_incident' | 'security_resolved' | 'admin_adjustment'; reason: string; value?: number; severe?: boolean }) => request<{ applied: boolean; stats: AgentQualityStats | null }>(`/api/admin/agents/${encodeURIComponent(agentId)}/quality/events`, {
    method: 'POST', authenticated: true, idempotencyKey: `agent-quality-${agentId}-${crypto.randomUUID()}`, body: JSON.stringify(input),
  }),
  getDeveloperLedger: (limit = 50, cursor?: string | null, token = 'CREDIT') => request<DeveloperLedger>(`/api/developer/ledger?limit=${encodeURIComponent(String(limit))}&token=${encodeURIComponent(token)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {
    authenticated: true,
  }),
  markNotificationsRead: () => request<{ ok: boolean }>('/api/notifications/read', {
    method: 'POST', authenticated: true, body: '{}',
  }),
  subscribeMission: (
    missionId: string,
    onDetail: (detail: MissionDetail) => void,
    onState: (state: 'connecting' | 'live' | 'fallback') => void,
  ) => {
    const controller = new AbortController();
    const decoder = new TextDecoder();
    const connect = async () => {
      while (!controller.signal.aborted) {
        try {
          onState('connecting');
          const headers = await authenticatedHeaders();
          headers.set('Accept', 'text/event-stream');
          const response = await fetch(getApiUrl(`/api/missions/${encodeURIComponent(missionId)}/stream`), {
            headers,
            signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new ApiError('实时事件流暂时不可用。', response.status, 'STREAM_UNAVAILABLE');
          onState('live');
          const reader = response.body.getReader();
          let buffer = '';
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
              if (!frame.includes('event: mission')) continue;
              const data = frame.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
              if (!data) continue;
              try { onDetail(JSON.parse(data) as MissionDetail); } catch { /* Ignore malformed frames and reconnect normally. */ }
            }
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          onState('fallback');
        }
        await new Promise((resolve) => window.setTimeout(resolve, 3_000));
      }
    };
    void connect();
    return () => controller.abort();
  },
};
