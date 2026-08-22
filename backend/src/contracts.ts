export type UserRole = 'requester' | 'developer' | 'admin';
export type AgentStatus = 'trial' | 'active' | 'paused';
export type MissionStatus = 'draft' | 'matching' | 'running' | 'review' | 'completed' | 'cancelled';
export type StageStatus = 'queued' | 'running' | 'done' | 'failed';
export type PaymentMethod = 'web2_balance' | 'web3_musdc' | 'web3_seth';

export interface UserContext {
  id: string;
  email?: string;
  displayName: string;
  role: UserRole;
  walletAddress?: string;
}

export interface AuthIdentityInput {
  provider: 'pinme' | 'privy';
  subject: string;
  email?: string;
  displayName: string;
  walletAddress?: string;
}

export interface Agent {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  summary: string;
  tags: string[];
  endpoint: string;
  authType: 'none' | 'api_key' | 'bearer' | 'jwt';
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  price: number;
  wallet: string;
  status: AgentStatus;
  version: string;
  trustScore: number;
  successRate: number;
  responseTime: string;
  jobs: number;
  volume: number;
  author: string;
  official: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Mission {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  budget: number;
  paymentMethod: PaymentMethod;
  deadline: string;
  reviewDueAt: string | null;
  priority: 'normal' | 'high' | 'urgent';
  expertise: 'standard' | 'expert' | 'principal';
  yieldEnabled: boolean;
  status: MissionStatus;
  progress: number;
  currentStage: string;
  team: string[];
  compiledSpec: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface StageOffer {
  id: string;
  missionId: string;
  stageId: string;
  agentId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStage {
  id: string;
  missionId: string;
  position: number;
  name: string;
  purpose: string;
  category: string;
  budget: number;
  status: StageStatus;
  agentId: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionEvent {
  id: string;
  missionId: string;
  stageId: string | null;
  type: string;
  message: string;
  actorType: 'platform' | 'requester' | 'developer' | 'agent';
  actorId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Deliverable {
  id: string;
  missionId: string;
  stageId: string | null;
  agentId: string | null;
  name: string;
  uri: string;
  contentHash: string;
  mimeType: string;
  status: 'submitted' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Escrow {
  id: string;
  missionId: string;
  amount: number;
  token: string;
  network: string;
  paymentMethod: PaymentMethod;
  yieldEnabled: boolean;
  platformFeeRate: number;
  status: 'pending' | 'held' | 'released' | 'frozen' | 'refunded';
  depositTxHash: string | null;
  releaseTxHash: string | null;
  payoutHash: string | null;
  freezeTxHash: string | null;
  resolutionTxHash: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  type: 'test_topup' | 'mission_hold' | 'agent_payout' | 'refund';
  amount: number;
  token: 'CREDIT';
  missionId: string | null;
  createdAt: string;
}

export interface WalletAccount {
  balance: number;
  token: 'CREDIT';
  testTopupAmount: number;
  nextTestTopupAt: string | null;
  transactions: WalletTransaction[];
}

export interface Dispute {
  id: string;
  missionId: string;
  openedBy: string;
  reason: string;
  evidence: Array<{ label: string; uri: string }>;
  status: 'open' | 'reviewing' | 'resolved' | 'rejected';
  resolution: string | null;
  freezeTxHash: string | null;
  resolutionTxHash: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  detail: string;
  tone: 'info' | 'success' | 'warning';
  read: boolean;
  createdAt: string;
}

export interface UserPreferences {
  taskUpdates: boolean;
  settlementUpdates: boolean;
  productUpdates: boolean;
  emailChannel: boolean;
  locale: 'zh-CN' | 'en-US';
  timeZone: string;
  updatedAt: string;
}

export interface DisputeAction {
  id: string;
  disputeId: string;
  actorId: string;
  action: 'review_started' | 'resolved' | 'rejected';
  note: string | null;
  createdAt: string;
}

export interface AdminUser extends UserContext {
  createdAt: string;
  updatedAt: string;
}

export interface AdminAction {
  id: string;
  actorId: string;
  targetUserId: string;
  action: 'role_changed';
  detail: {
    previousRole: UserRole;
    nextRole: UserRole;
  };
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  missionId: string;
  missionTitle: string;
  agentId: string;
  agentName: string;
  entryType: 'agent_payout' | 'refund' | 'yield';
  amount: number;
  token: string;
  status: 'pending' | 'settled' | 'failed';
  txHash: string | null;
  createdAt: string;
}

export interface LedgerCursor {
  createdAt: string;
  id: string;
}

export interface LedgerTrendPoint {
  weekStart: string;
  amount: number;
}

export interface DeveloperLedger {
  token: string;
  entries: LedgerEntry[];
  totals: {
    settled: number;
    pending: number;
    failed: number;
  };
  weekly: LedgerTrendPoint[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: LedgerCursor | null;
  };
}

export interface CandidateMatch {
  stageId: string;
  stageName: string;
  candidates: Array<{
    agent: Agent;
    score: number;
    reasons: string[];
  }>;
}

export interface MissionDetail {
  mission: Mission;
  stages: WorkflowStage[];
  offers: StageOffer[];
  events: ExecutionEvent[];
  deliverables: Deliverable[];
  escrow: Escrow | null;
  disputes: Dispute[];
}

export interface IdempotentResult {
  status: number;
  body: unknown;
}

export interface AcceptanceResult {
  mission: Mission;
  applied: boolean;
}

export interface MissionStartResult {
  mission: Mission;
  applied: boolean;
}

export interface DisputeResolutionResult {
  dispute: Dispute;
  applied: boolean;
}

export type IdempotencyClaim =
  | { state: 'acquired' }
  | { state: 'pending' }
  | { state: 'conflict' }
  | { state: 'completed'; result: IdempotentResult };

export interface AgentDispatch {
  runId: string;
  missionId: string;
  stageId: string;
  agentId: string;
  expiresAt: string;
}

export interface AgentCallbackUpdate {
  runId: string;
  callbackId: string;
  missionId: string;
  stageId: string;
  agentId: string;
  expiresAt: string;
  now: string;
  status: Exclude<StageStatus, 'queued'>;
  output?: Record<string, unknown> | null;
  progress?: number;
  currentStage: string;
  event: ExecutionEvent;
}

export type AgentCallbackApplyResult =
  | { state: 'applied'; stage: WorkflowStage }
  | { state: 'duplicate' | 'expired' | 'missing' | 'invalid' };

export interface PlatformStore {
  ensureIdentityProfile(identity: AuthIdentityInput): Promise<UserContext>;
  getProfile(id: string): Promise<UserContext | null>;
  updateRole(id: string, role: Exclude<UserRole, 'admin'>): Promise<UserContext>;
  consumeRateLimit(bucket: string, limit: number, windowSeconds: number, nowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;

  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  createAgent(agent: Agent): Promise<Agent>;
  updateAgentTrial(id: string, score: number, status: AgentStatus, responseTimeMs?: number): Promise<Agent | null>;
  updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null>;

  listMissions(user: UserContext): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  createMission(mission: Mission, stages: WorkflowStage[]): Promise<Mission>;
  saveCompilation(id: string, spec: Record<string, unknown>, stages: WorkflowStage[]): Promise<Mission | null>;
  confirmWorkflow(id: string, stages: WorkflowStage[], team: string[], offers: StageOffer[]): Promise<Mission | null>;
  startMission(id: string, requesterId: string, depositTxHash: string | null, payoutHash?: string | null, startedAt?: string): Promise<MissionStartResult | null>;
  submitMissionForReview(id: string, reviewDueAt: string): Promise<Mission | null>;
  acceptMission(id: string, actorId: string, releaseTxHash: string | null): Promise<AcceptanceResult | null>;
  listStages(missionId: string): Promise<WorkflowStage[]>;
  listStageOffers(missionId: string, now?: string): Promise<StageOffer[]>;
  getStageOffer(id: string, now?: string): Promise<StageOffer | null>;
  respondStageOffer(id: string, ownerId: string, decision: 'accepted' | 'declined', respondedAt: string): Promise<StageOffer | null>;
  claimStageForDispatch(missionId: string, stageId: string): Promise<WorkflowStage | null>;
  resetStageDispatch(missionId: string, stageId: string): Promise<void>;
  updateStage(missionId: string, stageId: string, status: StageStatus, output?: Record<string, unknown> | null): Promise<WorkflowStage | null>;
  transitionRunningStage(missionId: string, stageId: string, status: Exclude<StageStatus, 'queued'>, output?: Record<string, unknown> | null): Promise<WorkflowStage | null>;

  addEvent(event: ExecutionEvent, progress?: number, currentStage?: string, stageGuard?: StageStatus): Promise<ExecutionEvent>;
  listEvents(missionId: string): Promise<ExecutionEvent[]>;
  addDeliverable(deliverable: Deliverable): Promise<Deliverable>;
  listDeliverables(missionId: string): Promise<Deliverable[]>;

  getEscrow(missionId: string): Promise<Escrow | null>;
  getWalletAccount(userId: string, limit?: number): Promise<WalletAccount>;
  claimTestCredit(userId: string, now: string): Promise<{ account: WalletAccount; credited: boolean }>;
  listDisputes(user: UserContext): Promise<Dispute[]>;
  getDisputes(missionId: string): Promise<Dispute[]>;
  createDispute(dispute: Dispute): Promise<Dispute>;
  startDisputeReview(id: string, actorId: string): Promise<Dispute | null>;
  resolveDispute(id: string, resolution: string, status: 'resolved' | 'rejected', actorId: string, resolutionTxHash: string | null): Promise<DisputeResolutionResult | null>;
  listDisputeActions(disputeId: string): Promise<DisputeAction[]>;

  createAgentDispatch(dispatch: AgentDispatch): Promise<void>;
  applyAgentCallback(update: AgentCallbackUpdate): Promise<AgentCallbackApplyResult>;
  claimAgentCallback(runId: string, callbackId: string, now: string): Promise<'accepted' | 'duplicate' | 'expired' | 'missing'>;
  completeAgentDispatch(runId: string, now: string): Promise<void>;

  listNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: Notification): Promise<Notification>;
  markNotificationsRead(userId: string): Promise<void>;
  getUserPreferences(userId: string): Promise<UserPreferences>;
  updateUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences>;

  listAdminUsers(limit: number): Promise<AdminUser[]>;
  countProfilesByRole(role: UserRole): Promise<number>;
  updateAdminUserRole(targetId: string, role: UserRole, actorId: string, createdAt: string): Promise<{ profile: AdminUser; action: AdminAction | null } | null>;
  listAdminActions(limit: number): Promise<AdminAction[]>;
  getDeveloperSummary(ownerId: string): Promise<{ jobs: number; activeAgents: number; volume: number; pending: number }>;
  getDeveloperLedger(ownerId: string, limit: number, cursor: LedgerCursor | null, token: string): Promise<DeveloperLedger>;

  claimIdempotent(userId: string, key: string, method: string, path: string, requestHash: string): Promise<IdempotencyClaim>;
  completeIdempotent(userId: string, key: string, result: IdempotentResult): Promise<void>;
  abandonIdempotent(userId: string, key: string): Promise<void>;
}
