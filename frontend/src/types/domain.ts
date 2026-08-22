export type UserRole = 'requester' | 'developer';

export interface UserProfile {
  id: string;
  email?: string;
  displayName: string;
  role: UserRole | 'admin';
  walletAddress?: string;
}

export interface AdminUser extends UserProfile {
  createdAt: string;
  updatedAt: string;
}

export interface AdminAction {
  id: string;
  actorId: string;
  targetUserId: string;
  action: 'role_changed';
  detail: {
    previousRole: UserProfile['role'];
    nextRole: UserProfile['role'];
  };
  createdAt: string;
}

export type SyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export type MissionStatus = 'draft' | 'matching' | 'running' | 'review' | 'completed' | 'cancelled';

export type AgentStatus = 'trial' | 'active' | 'paused';

export type ExpertiseLevel = 'standard' | 'expert' | 'principal';
export type PaymentMethod = 'web2_balance' | 'web3_musdc' | 'web3_seth';

export interface Agent {
  id: string;
  name: string;
  category: string;
  summary: string;
  tags: string[];
  status: AgentStatus;
  trustScore: number;
  successRate: number;
  responseTime: string;
  price: number;
  jobs: number;
  volume: number;
  author: string;
  version: string;
  official?: boolean;
  accent: 'cyan' | 'lime' | 'amber';
  ownerId?: string;
  endpoint?: string;
  authType?: 'none' | 'api_key' | 'bearer' | 'jwt';
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  wallet?: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  budget: number;
  paymentMethod: PaymentMethod;
  deadline: string;
  priority: 'normal' | 'high' | 'urgent';
  expertise: ExpertiseLevel;
  yieldEnabled: boolean;
  status: MissionStatus;
  progress: number;
  createdAt: string;
  currentStage: string;
  team: string[];
  reviewDueAt: string | null;
}

export interface WorkflowStage {
  id: string;
  name: string;
  purpose: string;
  category: string;
  budget: number;
  status: 'done' | 'running' | 'queued' | 'failed';
  agentId: string | null;
  missionId?: string;
  position?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
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

export interface CandidateMatch {
  stageId: string;
  stageName: string;
  candidates: Array<{ agent: Agent; score: number; reasons: string[] }>;
}

export interface ExecutionEvent {
  id: string;
  missionId?: string;
  stageId?: string | null;
  type: string;
  message: string;
  actorType?: 'platform' | 'requester' | 'developer' | 'agent';
  actorId?: string | null;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface Deliverable {
  id: string;
  missionId?: string;
  stageId?: string | null;
  agentId?: string | null;
  name: string;
  uri: string;
  contentHash: string;
  mimeType: string;
  status: 'submitted' | 'accepted' | 'rejected';
  createdAt?: string;
}

export interface Escrow {
  status: 'pending' | 'held' | 'released' | 'frozen' | 'refunded' | string;
  amount: number;
  token: string;
  network: string;
  paymentMethod?: PaymentMethod;
  yieldEnabled?: boolean;
  platformFeeRate?: number;
  depositTxHash?: string | null;
  releaseTxHash?: string | null;
  payoutHash?: string | null;
  freezeTxHash?: string | null;
  resolutionTxHash?: string | null;
}

export interface Dispute {
  id: string;
  missionId: string;
  openedBy?: string;
  reason: string;
  evidence: Array<{ label: string; uri: string }>;
  status: 'open' | 'reviewing' | 'resolved' | 'rejected';
  resolution: string | null;
  freezeTxHash: string | null;
  resolutionTxHash: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface DisputeAction {
  id: string;
  disputeId: string;
  actorId: string;
  action: 'review_started' | 'resolved' | 'rejected';
  note: string | null;
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

export interface MissionDetail {
  mission: Mission;
  stages: WorkflowStage[];
  offers: StageOffer[];
  events: ExecutionEvent[];
  deliverables: Deliverable[];
  escrow: Escrow | null;
  disputes: Dispute[];
}

export interface NewDeliverableInput {
  stageId?: string;
  name: string;
  uri: string;
  contentHash: string;
  mimeType: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  tone: 'info' | 'success' | 'warning';
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

export interface DeveloperLedger {
  token: string;
  entries: LedgerEntry[];
  totals: {
    settled: number;
    pending: number;
    failed: number;
  };
  weekly: Array<{ weekStart: string; amount: number }>;
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface NewMissionInput {
  title: string;
  description: string;
  category: string;
  tags: string[];
  budget: number;
  paymentMethod: PaymentMethod;
  deadline: string;
  priority: Mission['priority'];
  expertise: ExpertiseLevel;
  yieldEnabled: boolean;
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

export interface NewAgentInput {
  name: string;
  category: string;
  summary: string;
  tags: string[];
  endpoint: string;
  authType: 'none' | 'api_key' | 'bearer' | 'jwt';
  price: number;
  wallet: string;
}
