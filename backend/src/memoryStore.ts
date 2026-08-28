import type {
  Agent,
  AgentCallbackUpdate,
  AgentDispatch,
  AgentFeedback,
  AgentHealthCheck,
  AgentMetricEvent,
  AgentMetricRecordResult,
  AgentQualityStats,
  AgentReputationSnapshot,
  AgentStatus,
  AgentTrial,
  AdminAction,
  AdminUser,
  ArbitrationElector,
  ArbitrationMember,
  ArbitrationProposal,
  AuthIdentityInput,
  AgentCidPortfolioItem,
  Deliverable,
  DeveloperLedger,
  Dispute,
  DisputeAction,
  DisputeAppealResult,
  DisputeExecutionQueueResult,
  DisputeFinalizeResult,
  DisputeGovernance,
  DisputeVote,
  DisputeVoteChoice,
  DisputeVoteMutationResult,
  DispatchOutboxItem,
  EcosystemFinalizeResult,
  EcosystemGovernanceDetail,
  EcosystemProposal,
  EcosystemVote,
  EcosystemVoteChoice,
  EcosystemVoteResult,
  Escrow,
  EvidencePublication,
  ExecutionEvent,
  GovernancePowerSnapshot,
  GovernanceExecutionItem,
  IdempotencyClaim,
  IdempotentResult,
  LedgerCursor,
  LedgerEntry,
  LedgerExportClaim,
  LedgerExportJob,
  LedgerExportMutationResult,
  LedgerExportPrivateArtifact,
  LedgerExportRequestResult,
  Mission,
  MissionEvidenceSnapshot,
  MissionChangeRequest,
  MissionPauseMode,
  Notification,
  PlatformStore,
  RewardActivity,
  RewardAllocation,
  RewardClaim,
  RewardEpoch,
  RewardEpochComputeResult,
  StageOffer,
  UserContext,
  UserPreferences,
  WalletAccount,
  WalletTransaction,
  YdFinanceOverview,
  YdStakingPosition,
  WorkflowStage,
  WorkflowDraftSaveResult,
  WorkflowEdge,
  WorkflowCheckpoint,
  WorkflowTransitionCheckpoint,
  WorkflowTemplateDetail,
  WorkflowTemplateSaveResult,
  WorkflowViewport,
} from './contracts';
import { isDefaultPlatformUserName } from '../../shared/brand';
import { calculateAgentQuality, feedbackWeightForPriorCount } from './agentQuality';
import {
  arbitrationAppealEndsAt,
  arbitrationExecutionPayloadHash,
  arbitrationExecutionReady,
  arbitrationQuorum,
  arbitrationVoteWeight,
  arbitrationVotingEndsAt,
  arbitrationWeightVersion,
  evaluateArbitrationProposal,
} from './arbitration';
import { paymentConfig, TEST_TOPUP_AMOUNT } from './payments';
import {
  exportArtifactExpiresAt,
  exportJobExpiresAt,
  exportLeaseExpiresAt,
  exportProgress,
  MAX_DIRECT_LEDGER_EXPORT_ROWS,
} from './exportJobs';
import { allocateRewardEpoch, evaluateEcosystemProposal, REWARD_FORMULA_VERSION, rewardScoreMicros } from './ydFinance';
import type { Address } from 'viem';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function defaultPreferences(updatedAt = ''): UserPreferences {
  return {
    taskUpdates: true,
    settlementUpdates: true,
    productUpdates: false,
    emailChannel: true,
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    updatedAt,
  };
}

function weekStart(value: string): string {
  const date = new Date(value);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

export class MemoryPlatformStore implements PlatformStore {
  readonly profiles = new Map<string, UserContext>();
  readonly agents = new Map<string, Agent>();
  readonly missions = new Map<string, Mission>();
  readonly stages = new Map<string, WorkflowStage[]>();
  readonly edges = new Map<string, WorkflowEdge[]>();
  readonly workflowTransitions = new Map<string, WorkflowTransitionCheckpoint[]>();
  readonly workflowTemplates = new Map<string, WorkflowTemplateDetail[]>();
  readonly stageOffers = new Map<string, StageOffer[]>();
  readonly agentPerformance = new Map<string, { agentId: string; outcome: 'done' | 'failed' }>();
  readonly events = new Map<string, ExecutionEvent[]>();
  readonly deliverables = new Map<string, Deliverable[]>();
  readonly acceptanceEvidenceSnapshots = new Map<string, MissionEvidenceSnapshot>();
  readonly evidencePublications = new Map<string, EvidencePublication[]>();
  readonly escrows = new Map<string, Escrow>();
  readonly disputes = new Map<string, Dispute[]>();
  readonly disputeActions = new Map<string, DisputeAction[]>();
  readonly arbitrationMembers = new Map<string, ArbitrationMember>();
  readonly disputeProposals = new Map<string, ArbitrationProposal[]>();
  readonly disputeElectorate = new Map<string, ArbitrationElector[]>();
  readonly disputeVotes = new Map<string, DisputeVote[]>();
  readonly governanceExecutionQueue = new Map<string, GovernanceExecutionItem>();
  readonly notifications = new Map<string, Notification[]>();
  readonly preferences = new Map<string, UserPreferences>();
  readonly adminActions: AdminAction[] = [];
  readonly ledgerEntries: LedgerEntry[] = [];
  readonly ledgerExportJobs = new Map<string, LedgerExportJob & {
    ownerId: string;
    exportType: 'developer_ledger';
    leaseOwner: string | null;
    leaseExpiresAt: string | null;
    snapshotCreatedAt: string;
    snapshotId: string;
  }>();
  readonly ledgerExportArtifacts = new Map<string, LedgerExportPrivateArtifact>();
  readonly ledgerExportEvents: Array<{
    id: string; jobId: string; actorType: 'user' | 'service' | 'system'; actorId: string | null;
    action: string; detail: Record<string, string | number>; createdAt: string;
  }> = [];
  readonly walletBalances = new Map<string, number>();
  readonly walletTransactions = new Map<string, WalletTransaction[]>();
  readonly testTopupClaims = new Map<string, string>();
  readonly idempotency = new Map<string, { method: string; path: string; requestHash: string; result: IdempotentResult | null }>();
  readonly identities = new Map<string, string>();
  readonly rateLimits = new Map<string, { windowStart: number; count: number }>();
  readonly agentDispatches = new Map<string, AgentDispatch & {
    attemptNo: number;
    completedAt: string | null;
    callbackIds: Set<string>;
    appliedCallbackIds: Set<string>;
  }>();
  readonly dispatchOutbox = new Map<string, DispatchOutboxItem & { status: 'pending' | 'processing' | 'done' }>();
  readonly rewardActivities = new Map<string, RewardActivity>();
  readonly rewardEpochs = new Map<string, RewardEpoch>();
  readonly rewardAllocations = new Map<string, RewardAllocation[]>();
  readonly rewardClaims = new Map<string, RewardClaim>();
  readonly stakingPositions = new Map<string, YdStakingPosition>();
  readonly ecosystemProposals = new Map<string, EcosystemProposal>();
  readonly ecosystemSnapshots = new Map<string, GovernancePowerSnapshot[]>();
  readonly ecosystemVotes = new Map<string, EcosystemVote[]>();
  readonly agentQualityStats = new Map<string, AgentQualityStats>();
  readonly agentTrials = new Map<string, AgentTrial[]>();
  readonly agentHealthChecks = new Map<string, AgentHealthCheck[]>();
  readonly agentMetricEvents = new Map<string, AgentMetricEvent[]>();
  readonly agentReputationSnapshots = new Map<string, AgentReputationSnapshot[]>();
  readonly agentFeedback = new Map<string, AgentFeedback[]>();
  readonly missionControls = new Map<string, {
    pausedAt: string | null; pausedBy: string | null; pauseReason: string | null; pauseMode: MissionPauseMode | null;
    schedulerRevision: number; schedulerState: 'clean' | 'dirty'; changeVersion: number; checkpointSequence: number;
  }>();
  readonly missionChangeRequests = new Map<string, MissionChangeRequest[]>();
  readonly workflowCheckpoints = new Map<string, WorkflowCheckpoint[]>();

  private missionView(mission: Mission): Mission {
    const control = this.missionControls.get(mission.id);
    return {
      ...mission,
      status: control?.pausedAt && mission.status === 'running' ? 'paused' : mission.status,
      pausedAt: control?.pausedAt ?? null,
      pausedBy: control?.pausedBy ?? null,
      pauseReason: control?.pauseReason ?? null,
      pauseMode: control?.pauseMode ?? null,
      schedulerRevision: control?.schedulerRevision ?? 0,
    };
  }

  private recordAgentPerformance(stageId: string, agentId: string, outcome: 'done' | 'failed') {
    if (this.agentPerformance.has(stageId)) return;
    this.agentPerformance.set(stageId, { agentId, outcome });
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const outcomes = [...this.agentPerformance.values()].filter((item) => item.agentId === agentId);
    const completed = outcomes.filter((item) => item.outcome === 'done').length;
    const prior = Math.max(0.8, Math.min(0.99, agent.trustScore / 10));
    const successRate = Number((100 * ((prior * 5 + completed) / (5 + outcomes.length))).toFixed(1));
    this.agents.set(agentId, { ...agent, successRate, updatedAt: new Date().toISOString() });
  }

  async ensureIdentityProfile(identity: AuthIdentityInput): Promise<UserContext> {
    const identityKey = `${identity.provider}:${identity.subject}`;
    const normalizedEmail = identity.email?.toLocaleLowerCase();
    const normalizedWallet = identity.walletAddress?.toLocaleLowerCase();
    const emailProfile = normalizedEmail
      ? [...this.profiles.values()].find((profile) => profile.email?.toLocaleLowerCase() === normalizedEmail)
      : undefined;
    const walletProfile = normalizedWallet
      ? [...this.profiles.values()].find((profile) => profile.walletAddress?.toLocaleLowerCase() === normalizedWallet)
      : undefined;
    if (emailProfile && walletProfile && emailProfile.id !== walletProfile.id) throw new Error('IDENTITY_CONFLICT');
    const matchedProfile = emailProfile ?? walletProfile;
    const profileId = this.identities.get(identityKey) ?? matchedProfile?.id ?? identity.subject;
    this.identities.set(identityKey, profileId);
    const existing = this.profiles.get(profileId);
    if (existing) {
      const updated = {
        ...existing,
        email: existing.email ?? normalizedEmail,
        walletAddress: existing.walletAddress ?? normalizedWallet,
        displayName: isDefaultPlatformUserName(existing.displayName) ? identity.displayName : existing.displayName,
      };
      this.profiles.set(profileId, updated);
      return copy(updated);
    }
    const profile: UserContext = {
      id: profileId,
      email: normalizedEmail,
      walletAddress: normalizedWallet,
      displayName: identity.displayName,
      role: 'requester',
    };
    this.profiles.set(profileId, profile);
    return copy(profile);
  }

  async getProfile(id: string): Promise<UserContext | null> {
    return copy(this.profiles.get(id) ?? null);
  }

  async updateRole(id: string, role: 'requester' | 'developer'): Promise<UserContext> {
    const profile = this.profiles.get(id);
    if (!profile) throw new Error('Profile not found');
    const updated = { ...profile, role };
    this.profiles.set(id, updated);
    return copy(updated);
  }

  async consumeRateLimit(bucket: string, limit: number, windowSeconds: number, nowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const currentWindow = nowSeconds - (nowSeconds % windowSeconds);
    const existing = this.rateLimits.get(bucket);
    const next = !existing || existing.windowStart < currentWindow
      ? { windowStart: currentWindow, count: 1 }
      : { ...existing, count: existing.count + 1 };
    this.rateLimits.set(bucket, next);
    return { allowed: next.count <= limit, remaining: Math.max(0, limit - next.count), resetAt: next.windowStart + windowSeconds };
  }

  async listAgents(): Promise<Agent[]> {
    return copy([...this.agents.values()]);
  }

  async getAgent(id: string): Promise<Agent | null> {
    return copy(this.agents.get(id) ?? null);
  }

  async createAgent(agent: Agent): Promise<Agent> {
    if (this.agents.has(agent.id)) throw new Error('Duplicate agent');
    this.agents.set(agent.id, copy(agent));
    this.agentQualityStats.set(agent.id, calculateAgentQuality(agent, [], agent.createdAt, 'registered'));
    return copy(agent);
  }

  async updateAgentTrial(id: string, score: number, status: AgentStatus, responseTimeMs = 1800): Promise<Agent | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;
    const outcomes = [...this.agentPerformance.values()].filter((item) => item.agentId === id);
    const completed = outcomes.filter((item) => item.outcome === 'done').length;
    const prior = Math.max(0.8, Math.min(0.99, score / 10));
    const updated = { ...agent, trustScore: score, successRate: Number((100 * ((prior * 5 + completed) / (5 + outcomes.length))).toFixed(1)), status, responseTime: `${(Math.max(1, responseTimeMs) / 1000).toFixed(1)}s` };
    this.agents.set(id, updated);
    return copy(updated);
  }

  async updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;
    const updated = { ...agent, status };
    this.agents.set(id, updated);
    return copy(updated);
  }

  async getAgentQualityStats(agentId: string): Promise<AgentQualityStats | null> {
    return copy(this.agentQualityStats.get(agentId) ?? null);
  }

  async listAgentQualityStats(): Promise<AgentQualityStats[]> {
    return copy([...this.agentQualityStats.values()].sort((left, right) => right.reputation - left.reputation || left.agentId.localeCompare(right.agentId)));
  }

  async recordAgentTrial(trial: AgentTrial): Promise<AgentTrial> {
    const rows = this.agentTrials.get(trial.agentId) ?? [];
    rows.push(copy(trial));
    this.agentTrials.set(trial.agentId, rows);
    return copy(trial);
  }

  async listAgentTrials(agentId: string, limit = 20): Promise<AgentTrial[]> {
    return copy([...(this.agentTrials.get(agentId) ?? [])].sort((left, right) => right.startedAt.localeCompare(left.startedAt)).slice(0, limit));
  }

  async recordAgentHealthCheck(check: AgentHealthCheck): Promise<AgentHealthCheck> {
    const rows = this.agentHealthChecks.get(check.agentId) ?? [];
    rows.push(copy(check));
    this.agentHealthChecks.set(check.agentId, rows);
    return copy(check);
  }

  async listAgentHealthChecks(agentId: string, limit = 50): Promise<AgentHealthCheck[]> {
    return copy([...(this.agentHealthChecks.get(agentId) ?? [])].sort((left, right) => right.checkedAt.localeCompare(left.checkedAt)).slice(0, limit));
  }

  async listAgentMetricEvents(agentId: string): Promise<AgentMetricEvent[]> {
    return copy([...(this.agentMetricEvents.get(agentId) ?? [])].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)));
  }

  async recomputeAgentQuality(agentId: string, evaluatedAt: string): Promise<AgentQualityStats | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    const events = await this.listAgentMetricEvents(agentId);
    const previous = this.agentQualityStats.get(agentId)?.marketplaceStatus ?? 'registered';
    const stats = calculateAgentQuality(agent, events, evaluatedAt, previous);
    this.agentQualityStats.set(agentId, copy(stats));
    const snapshots = this.agentReputationSnapshots.get(agentId) ?? [];
    const existingSnapshot = snapshots.findIndex((snapshot) => snapshot.evaluatedAt === evaluatedAt && snapshot.formulaVersion === stats.formulaVersion);
    const snapshot = {
      id: existingSnapshot >= 0 ? snapshots[existingSnapshot].id : `AGSNAP-${crypto.randomUUID()}`,
      agentId, evaluatedAt, formulaVersion: stats.formulaVersion,
      eventCount: events.length, reputation: stats.reputation, breakdown: copy(stats.breakdown), confidence: stats.confidence,
      marketplaceStatus: stats.marketplaceStatus, eligibilityReasons: [...stats.eligibilityReasons], createdAt: evaluatedAt,
    };
    if (existingSnapshot >= 0) snapshots[existingSnapshot] = snapshot;
    else snapshots.push(snapshot);
    this.agentReputationSnapshots.set(agentId, snapshots);
    return copy(stats);
  }

  async recordAgentMetricEvent(event: AgentMetricEvent, evaluatedAt: string): Promise<AgentMetricRecordResult> {
    const rows = this.agentMetricEvents.get(event.agentId) ?? [];
    if (rows.some((row) => row.idempotencyKey === event.idempotencyKey)) {
      return { applied: false, stats: await this.recomputeAgentQuality(event.agentId, evaluatedAt) };
    }
    rows.push(copy(event));
    this.agentMetricEvents.set(event.agentId, rows);
    return { applied: true, stats: await this.recomputeAgentQuality(event.agentId, evaluatedAt) };
  }

  async listAgentReputationSnapshots(agentId: string, limit = 20): Promise<AgentReputationSnapshot[]> {
    return copy([...(this.agentReputationSnapshots.get(agentId) ?? [])].sort((left, right) => right.evaluatedAt.localeCompare(left.evaluatedAt)).slice(0, limit));
  }

  async saveAgentFeedback(feedback: AgentFeedback, evaluatedAt: string): Promise<{ feedback: AgentFeedback; stats: AgentQualityStats | null }> {
    const key = `${feedback.missionId}:${feedback.stageId}:${feedback.agentId}`;
    const rows = this.agentFeedback.get(key) ?? [];
    rows.forEach((row) => { row.effective = false; });
    const saved = { ...copy(feedback), version: (rows.at(-1)?.version ?? 0) + 1 };
    rows.push(saved);
    this.agentFeedback.set(key, rows);
    const score = ((saved.deliveryQuality + saved.requirementsFit + saved.communication + (saved.onTime ? 5 : 1) + (saved.reuse ? 5 : 1)) / 25) * 100;
    const priorFeedbackCount = [...this.agentFeedback.entries()].reduce((count, [sourceKey, feedbackRows]) => count + (
      sourceKey !== key && feedbackRows.some((row) => row.agentId === saved.agentId && row.requesterId === saved.requesterId && row.effective) ? 1 : 0
    ), 0);
    const feedbackWeight = feedbackWeightForPriorCount(priorFeedbackCount);
    const result = await this.recordAgentMetricEvent({
      id: `AGMETRIC-${crypto.randomUUID()}`, idempotencyKey: `feedback:${saved.id}`, agentId: saved.agentId,
      type: 'feedback_received', value: score, weight: feedbackWeight, severity: 'info', sourceType: 'feedback', sourceId: key,
      detail: { feedbackId: saved.id, version: saved.version, feedbackWeight }, occurredAt: saved.createdAt, createdAt: saved.createdAt,
    }, evaluatedAt);
    return { feedback: copy(saved), stats: result.stats };
  }

  async getAgentFeedback(missionId: string, stageId: string, agentId: string): Promise<AgentFeedback | null> {
    const rows = this.agentFeedback.get(`${missionId}:${stageId}:${agentId}`) ?? [];
    return copy([...rows].reverse().find((row) => row.effective) ?? null);
  }

  async listAgentFeedback(agentId: string, limit = 50): Promise<AgentFeedback[]> {
    const rows = [...this.agentFeedback.values()].flat().filter((row) => row.agentId === agentId && row.effective);
    return copy(rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit));
  }

  async listMissions(user: UserContext): Promise<Mission[]> {
    const missions = [...this.missions.values()];
    if (user.role === 'admin') return copy(missions.map((mission) => this.missionView(mission)));
    if (user.role === 'requester') return copy(missions.filter((mission) => mission.requesterId === user.id).map((mission) => this.missionView(mission)));
    const owned = new Set([...this.agents.values()].filter((agent) => agent.ownerId === user.id).map((agent) => agent.id));
    return copy(missions.filter((mission) => (this.stages.get(mission.id) ?? []).some((stage) => stage.agentId && owned.has(stage.agentId))).map((mission) => this.missionView(mission)));
  }

  async getMission(id: string): Promise<Mission | null> {
    const mission = this.missions.get(id);
    return mission ? copy(this.missionView(mission)) : null;
  }

  async createMission(mission: Mission, stages: WorkflowStage[], edges: WorkflowEdge[] = []): Promise<Mission> {
    this.missions.set(mission.id, copy({ ...mission, status: mission.status === 'paused' ? 'running' : mission.status }));
    this.stages.set(mission.id, copy(stages.map((stage) => ({ ...stage, attemptNo: stage.attemptNo || 1, attemptCreatedAt: stage.attemptCreatedAt || stage.createdAt }))));
    this.edges.set(mission.id, copy(edges));
    this.missionControls.set(mission.id, {
      pausedAt: mission.pausedAt, pausedBy: mission.pausedBy, pauseReason: mission.pauseReason, pauseMode: mission.pauseMode,
      schedulerRevision: mission.schedulerRevision, schedulerState: 'clean', changeVersion: 0, checkpointSequence: 0,
    });
    const now = mission.createdAt;
    const payment = paymentConfig(mission.paymentMethod);
    this.escrows.set(mission.id, {
      id: `ESC-${mission.id}`, missionId: mission.id, amount: mission.budget, token: payment.token, network: payment.network,
      paymentMethod: mission.paymentMethod,
      yieldEnabled: mission.yieldEnabled, platformFeeRate: 0.004, status: 'pending', depositTxHash: null,
      releaseTxHash: null, payoutHash: null, requesterWalletAddress: null, freezeTxHash: null, resolutionTxHash: null,
      releasedAt: null, createdAt: now, updatedAt: now,
    });
    return copy(this.missionView(mission));
  }

  async saveCompilation(
    id: string,
    spec: Record<string, unknown>,
    stages: WorkflowStage[],
    edges: WorkflowEdge[],
    expectedVersion: number,
  ): Promise<WorkflowDraftSaveResult> {
    const result = await this.saveWorkflowDraft(id, stages, edges, { x: 0, y: 0, zoom: 1 }, expectedVersion);
    if (result.state !== 'saved') return result;
    const updated = { ...result.mission, compiledSpec: copy(spec), currentStage: 'AI 已生成 DAG 工作流' };
    this.missions.set(id, updated);
    return { state: 'saved', mission: copy(updated) };
  }

  async saveWorkflowDraft(
    id: string,
    stages: WorkflowStage[],
    edges: WorkflowEdge[],
    viewport: WorkflowViewport,
    expectedVersion: number,
  ): Promise<WorkflowDraftSaveResult> {
    const mission = this.missions.get(id);
    if (!mission) return { state: 'missing' };
    if (!['draft', 'matching'].includes(mission.status) || this.escrows.get(id)?.status !== 'pending') return { state: 'locked' };
    if (mission.workflowVersion !== expectedVersion) return { state: 'version_conflict' };
    const updated: Mission = {
      ...mission,
      workflowVersion: mission.workflowVersion + 1,
      workflowViewport: copy(viewport),
      compiledSpec: null,
      team: [],
      status: 'matching',
      currentStage: 'DAG 草稿已保存，等待校验与邀请',
    };
    this.missions.set(id, updated);
    this.stages.set(id, copy(stages));
    this.edges.set(id, copy(edges));
    this.stageOffers.delete(id);
    return { state: 'saved', mission: copy(updated) };
  }

  async confirmWorkflow(id: string, stages: WorkflowStage[], team: string[], offers: StageOffer[]): Promise<Mission | null> {
    const mission = this.missions.get(id);
    if (!mission) return null;
    if (!['draft', 'matching'].includes(mission.status) || this.escrows.get(id)?.status !== 'pending') return copy(mission);
    const updated: Mission = { ...mission, team: copy(team), status: 'matching', currentStage: '接单邀请已发送，等待 Agent 确认' };
    this.missions.set(id, updated);
    this.stages.set(id, copy(stages));
    this.stageOffers.set(id, copy(offers));
    return copy(updated);
  }

  async startMission(
    id: string,
    requesterId: string,
    depositTxHash: string | null,
    payoutHash: string | null = null,
    startedAt = new Date().toISOString(),
    requesterWalletAddress: string | null = null,
  ) {
    const mission = this.missions.get(id);
    if (!mission) return null;
    const currentEscrow = this.escrows.get(id);
    const stages = this.stages.get(id) ?? [];
    const offers = this.stageOffers.get(id) ?? [];
    const taskStages = stages.filter((stage) => stage.nodeType === 'task');
    const accepted = taskStages.length > 0 && taskStages.every((stage) => stage.agentId && offers.some((offer) => (
      offer.stageId === stage.id
      && offer.agentId === stage.agentId
      && offer.status === 'accepted'
    )));
    if (mission.status !== 'matching' || currentEscrow?.status !== 'pending' || !accepted) return { mission: copy(mission), applied: false };
    if (mission.paymentMethod === 'web2_balance') {
      const transactions = this.walletTransactions.get(requesterId) ?? [];
      if (!transactions.some((transaction) => transaction.type === 'mission_hold' && transaction.missionId === id)) {
        const balance = this.walletBalances.get(requesterId) ?? 0;
        if (balance < mission.budget) throw new Error('INSUFFICIENT_BALANCE');
        this.walletBalances.set(requesterId, Number((balance - mission.budget).toFixed(6)));
        this.walletTransactions.set(requesterId, [{
          id: crypto.randomUUID(), type: 'mission_hold', amount: -mission.budget, token: 'CREDIT',
          missionId: id, createdAt: new Date().toISOString(),
        }, ...transactions]);
      }
    }
    const updated: Mission = { ...mission, status: 'running', progress: Math.max(1, mission.progress), currentStage: '执行网络已启动' };
    this.missions.set(id, updated);
    const escrow = this.escrows.get(id);
    if (escrow) this.escrows.set(id, {
      ...escrow,
      status: 'held',
      depositTxHash: depositTxHash ?? escrow.depositTxHash,
      payoutHash: payoutHash ?? escrow.payoutHash,
      requesterWalletAddress: requesterWalletAddress?.toLocaleLowerCase() ?? escrow.requesterWalletAddress,
    });
    return { mission: copy(updated), applied: true };
  }

  async submitMissionForReview(id: string, reviewDueAt: string): Promise<Mission | null> {
    const mission = this.missions.get(id);
    if (!mission) return null;
    if (mission.status !== 'running' || this.missionControls.get(id)?.pausedAt) return copy(this.missionView(mission));
    const updated: Mission = { ...mission, status: 'review', progress: 100, currentStage: '等待验收', reviewDueAt };
    this.missions.set(id, updated);
    return copy(this.missionView(updated));
  }

  async pauseMission(id: string, actorId: string, mode: MissionPauseMode, reason: string, pausedAt: string) {
    const mission = this.missions.get(id);
    const escrow = this.escrows.get(id);
    const control = this.missionControls.get(id);
    if (!mission || !control || mission.status !== 'running' || escrow?.status !== 'held') {
      return { state: 'invalid' as const, mission: mission ? copy(this.missionView(mission)) : null };
    }
    const escalatesToEmergency = Boolean(control.pausedAt && control.pauseMode === 'requester' && mode === 'emergency');
    if (control.pausedAt && !escalatesToEmergency) {
      return { state: 'unchanged' as const, mission: copy(this.missionView(mission)) };
    }
    const next = {
      ...control, pausedAt, pausedBy: actorId, pauseReason: reason, pauseMode: mode,
      schedulerRevision: control.schedulerRevision + 1, schedulerState: 'clean' as const,
      checkpointSequence: control.checkpointSequence + 1,
    };
    this.missionControls.set(id, next);
    this.events.set(id, [...(this.events.get(id) ?? []), {
      id: `EVT-${crypto.randomUUID()}`, missionId: id, stageId: null, type: 'mission.paused',
      message: mode === 'emergency' ? '管理员已紧急暂停任务' : '任务方已暂停执行',
      actorType: mode === 'emergency' ? 'platform' : 'requester', actorId, payload: { mode, reason }, createdAt: pausedAt,
    }]);
    this.workflowCheckpoints.set(id, [{
      id: `CHECKPOINT-${crypto.randomUUID()}`, missionId: id, sequence: next.checkpointSequence, kind: 'pause',
      workflowVersion: mission.workflowVersion, schedulerRevision: next.schedulerRevision, changeVersion: next.changeVersion,
      schedulerState: 'clean', payload: { mode, reason }, createdBy: actorId, createdAt: pausedAt,
    }, ...(this.workflowCheckpoints.get(id) ?? [])]);
    const view = this.missionView(mission);
    return { state: 'applied' as const, mission: copy(view), schedulerRevision: view.schedulerRevision };
  }

  async resumeMission(
    id: string,
    actorId: string,
    expectedMode: MissionPauseMode,
    expectedSchedulerRevision: number,
    resumedAt: string,
  ) {
    const mission = this.missions.get(id);
    const escrow = this.escrows.get(id);
    const control = this.missionControls.get(id);
    if (!mission || !control || mission.status !== 'running' || escrow?.status !== 'held') {
      return { state: 'invalid' as const, mission: mission ? copy(this.missionView(mission)) : null };
    }
    if (!control.pausedAt) return { state: 'unchanged' as const, mission: copy(this.missionView(mission)) };
    if (control.pauseMode !== expectedMode || control.schedulerRevision !== expectedSchedulerRevision) {
      return { state: 'invalid' as const, mission: copy(this.missionView(mission)) };
    }
    const payload = { mode: control.pauseMode, pausedAt: control.pausedAt, reason: control.pauseReason };
    const next = {
      ...control, pausedAt: null, pausedBy: null, pauseReason: null, pauseMode: null,
      schedulerRevision: control.schedulerRevision + 1, schedulerState: 'dirty' as const,
      checkpointSequence: control.checkpointSequence + 1,
    };
    this.missionControls.set(id, next);
    this.events.set(id, [...(this.events.get(id) ?? []), {
      id: `EVT-${crypto.randomUUID()}`, missionId: id, stageId: null, type: 'mission.resumed',
      message: '任务执行已恢复', actorType: expectedMode === 'emergency' ? 'platform' : 'requester',
      actorId, payload, createdAt: resumedAt,
    }]);
    this.workflowCheckpoints.set(id, [{
      id: `CHECKPOINT-${crypto.randomUUID()}`, missionId: id, sequence: next.checkpointSequence, kind: 'resume',
      workflowVersion: mission.workflowVersion, schedulerRevision: next.schedulerRevision, changeVersion: next.changeVersion,
      schedulerState: 'dirty', payload, createdBy: actorId, createdAt: resumedAt,
    }, ...(this.workflowCheckpoints.get(id) ?? [])]);
    const view = this.missionView(mission);
    return { state: 'applied' as const, mission: copy(view), schedulerRevision: view.schedulerRevision };
  }

  async applyMissionChangeRequest(input: {
    id: string; missionId: string; targetStageIds: string[]; resetStageIds: string[];
    reason: string; acceptanceCriteria: string; requestedBy: string; createdAt: string;
    expectedRunningStageIds?: string[];
  }) {
    const mission = this.missions.get(input.missionId);
    const escrow = this.escrows.get(input.missionId);
    const control = this.missionControls.get(input.missionId);
    const stages = this.stages.get(input.missionId) ?? [];
    const resetIds = new Set(input.resetStageIds);
    const expectedRunningIds = new Set(input.expectedRunningStageIds ?? []);
    const resetStages = stages.filter((stage) => resetIds.has(stage.id));
    const targetStages = stages.filter((stage) => input.targetStageIds.includes(stage.id));
    if (!mission || !control || escrow?.status !== 'held' || !resetIds.size || resetStages.length !== resetIds.size
      || targetStages.length !== new Set(input.targetStageIds).size || targetStages.some((stage) => !['done', 'failed'].includes(stage.status))
      || [...expectedRunningIds].some((stageId) => !resetIds.has(stageId))
      || [...expectedRunningIds].some((stageId) => {
        const stage = resetStages.find((candidate) => candidate.id === stageId);
        return stage?.status !== 'running' || stage.nodeType !== 'approval';
      })
      || !(mission.status === 'review' || (mission.status === 'running' && control.pausedAt))) {
      return { state: 'invalid' as const, mission: mission ? copy(this.missionView(mission)) : null };
    }
    if (resetStages.some((stage) => stage.status === 'running' && !expectedRunningIds.has(stage.id))) {
      return { state: 'blocked_running_stage' as const, mission: copy(this.missionView(mission)) };
    }
    const priorStageState = resetStages.map((stage) => ({
      stageId: stage.id, attemptNo: stage.attemptNo, status: stage.status,
      progress: stage.progress, input: copy(stage.input), output: copy(stage.output),
    }));
    const changeVersion = control.changeVersion + 1;
    const schedulerRevision = control.schedulerRevision + 1;
    const changeRequest: MissionChangeRequest = {
      id: input.id, missionId: input.missionId, version: changeVersion,
      targetStageIds: copy(input.targetStageIds), resetStageIds: [...resetIds], reason: input.reason,
      acceptanceCriteria: input.acceptanceCriteria, requestedBy: input.requestedBy,
      priorStageState, status: 'applied', createdAt: input.createdAt,
    };
    this.missionChangeRequests.set(input.missionId, [changeRequest, ...(this.missionChangeRequests.get(input.missionId) ?? [])]);
    for (const [id, item] of this.dispatchOutbox) {
      if (item.missionId === input.missionId && resetIds.has(item.stageId)) {
        this.dispatchOutbox.set(id, { ...item, status: 'done', updatedAt: input.createdAt });
      }
    }
    this.stages.set(input.missionId, stages.map((stage) => resetIds.has(stage.id) ? {
      ...stage, status: 'queued' as const, progress: 0, output: null, attemptNo: stage.attemptNo + 1, updatedAt: input.createdAt,
      attemptCreatedAt: input.createdAt,
      input: {
        ...stage.input,
        rework: {
          changeRequestId: input.id,
          reason: input.reason,
          acceptanceCriteria: input.acceptanceCriteria,
          targetStageIds: copy(input.targetStageIds),
          isTarget: input.targetStageIds.includes(stage.id),
          requestedAt: input.createdAt,
        },
      },
    } : stage));
    const nextControl = {
      ...control, changeVersion, schedulerRevision, schedulerState: 'dirty' as const,
      checkpointSequence: control.checkpointSequence + 1,
    };
    this.missionControls.set(input.missionId, nextControl);
    const updatedMission = mission.status === 'review' ? {
      ...mission, status: 'running' as const, reviewDueAt: null,
      currentStage: '已创建返工版本，等待重新执行', updatedAt: input.createdAt,
    } : mission;
    this.missions.set(input.missionId, updatedMission);
    this.events.set(input.missionId, [...(this.events.get(input.missionId) ?? []), {
      id: `EVT-${crypto.randomUUID()}`, missionId: input.missionId, stageId: null,
      type: 'mission.change_requested', message: '任务方已创建版本化返工请求', actorType: 'requester', actorId: input.requestedBy,
      payload: { changeRequestId: input.id, targetStageIds: input.targetStageIds, resetStageIds: [...resetIds], reason: input.reason, acceptanceCriteria: input.acceptanceCriteria },
      createdAt: input.createdAt,
    }]);
    this.workflowCheckpoints.set(input.missionId, [{
      id: `CHECKPOINT-${crypto.randomUUID()}`, missionId: input.missionId,
      sequence: nextControl.checkpointSequence, kind: 'change_request', workflowVersion: mission.workflowVersion,
      schedulerRevision, changeVersion, schedulerState: 'dirty',
      payload: { changeRequestId: input.id, targetStageIds: input.targetStageIds, resetStageIds: [...resetIds] },
      createdBy: input.requestedBy, createdAt: input.createdAt,
    }, ...(this.workflowCheckpoints.get(input.missionId) ?? [])]);
    const view = this.missionView(updatedMission);
    return { state: 'applied' as const, mission: copy(view), changeRequest: copy(changeRequest), schedulerRevision };
  }

  async listMissionChangeRequests(missionId: string): Promise<MissionChangeRequest[]> {
    return copy(this.missionChangeRequests.get(missionId) ?? []);
  }

  async listWorkflowCheckpoints(missionId: string, limit = 50): Promise<WorkflowCheckpoint[]> {
    return copy((this.workflowCheckpoints.get(missionId) ?? []).slice(0, Math.max(1, Math.min(200, limit))));
  }

  async listDirtyMissionControls(limit = 50): Promise<Array<{ missionId: string; schedulerRevision: number }>> {
    const rows = [...this.missionControls.entries()].filter(([missionId, control]) => {
      const mission = this.missions.get(missionId);
      return control.schedulerState === 'dirty' && !control.pausedAt
        && ['running', 'review'].includes(mission?.status ?? '') && this.escrows.get(missionId)?.status === 'held';
    }).map(([missionId, control]) => ({ missionId, schedulerRevision: control.schedulerRevision }));
    return copy(rows.slice(0, Math.max(1, Math.min(200, limit))));
  }

  async markMissionCheckpointClean(missionId: string, schedulerRevision: number, actorId: string | null, reconciledAt: string): Promise<boolean> {
    const control = this.missionControls.get(missionId);
    const mission = this.missions.get(missionId);
    if (!control || !mission || control.pausedAt || control.schedulerState !== 'dirty' || control.schedulerRevision !== schedulerRevision) return false;
    const next = { ...control, schedulerState: 'clean' as const, checkpointSequence: control.checkpointSequence + 1 };
    this.missionControls.set(missionId, next);
    this.workflowCheckpoints.set(missionId, [{
      id: `CHECKPOINT-${crypto.randomUUID()}`, missionId, sequence: next.checkpointSequence, kind: 'reconciled',
      workflowVersion: mission.workflowVersion, schedulerRevision, changeVersion: next.changeVersion,
      schedulerState: 'clean', payload: {}, createdBy: actorId, createdAt: reconciledAt,
    }, ...(this.workflowCheckpoints.get(missionId) ?? [])]);
    return true;
  }

  async acceptMission(id: string, actorId: string, releaseTxHash: string | null, evidenceSnapshot?: MissionEvidenceSnapshot) {
    const mission = this.missions.get(id);
    const escrow = this.escrows.get(id);
    if (!mission || !escrow) return null;
    if (mission.status !== 'review' || escrow.status !== 'held') return { mission: copy(mission), applied: false };
    const now = new Date().toISOString();
    const updated: Mission = { ...mission, status: 'completed', progress: 100, currentStage: '已结算', updatedAt: now };
    this.missions.set(id, updated);
    this.escrows.set(id, { ...escrow, status: 'released', releaseTxHash, releasedAt: now, updatedAt: now });
    const acceptedEvent: ExecutionEvent = {
      id: `${id}:mission.accepted`,
      missionId: id,
      stageId: null,
      type: 'mission.accepted',
      message: '任务已验收，资金释放完成',
      actorType: 'requester',
      actorId,
      payload: { amount: escrow.amount, token: escrow.token, releaseTxHash },
      createdAt: now,
    };
    this.events.set(id, [...(this.events.get(id) ?? []), acceptedEvent]);
    if (evidenceSnapshot && !this.acceptanceEvidenceSnapshots.has(id)) {
      this.acceptanceEvidenceSnapshots.set(id, copy(evidenceSnapshot));
    }
    await this.recordRewardActivity({
      id: `YDACT-${id}-requester`,
      sourceKey: `${id}:settlement:requester`,
      userId: mission.requesterId,
      missionId: id,
      disputeId: null,
      role: 'requester',
      formulaVersion: REWARD_FORMULA_VERSION,
      asset: escrow.token,
      settledAmount: escrow.amount,
      qualityBps: 10_000,
      penaltyBps: 0,
      scoreMicros: rewardScoreMicros(escrow.amount, 'requester'),
      eligible: true,
      detail: { source: 'mission_settlement', releaseTxHash },
      occurredAt: now,
      createdAt: now,
    });
    const stages = this.stages.get(id) ?? [];
    const stageTotal = stages.reduce((sum, stage) => sum + stage.budget, 0) || escrow.amount;
    const payouts = new Map<string, number>();
    for (const stage of stages) {
      if (!stage.agentId) continue;
      const gross = escrow.amount * (stage.budget / stageTotal);
      payouts.set(stage.agentId, (payouts.get(stage.agentId) ?? 0) + gross);
    }
    const walletPayouts = new Map<string, number>();
    const ownerRewards = new Map<string, { amount: number; qualityBps: number; agentIds: string[] }>();
    for (const [agentId, gross] of payouts) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;
      const amount = Number((gross * (1 - escrow.platformFeeRate)).toFixed(6));
      this.ledgerEntries.push({
        id: crypto.randomUUID(),
        missionId: id,
        missionTitle: mission.title,
        agentId,
        agentName: agent.name,
        entryType: 'agent_payout',
        amount,
        token: escrow.token,
        status: 'settled',
        txHash: releaseTxHash,
        createdAt: now,
      });
      this.agents.set(agentId, { ...agent, jobs: agent.jobs + 1, volume: agent.volume + amount, updatedAt: now });
      if (escrow.paymentMethod === 'web2_balance') {
        walletPayouts.set(agent.ownerId, (walletPayouts.get(agent.ownerId) ?? 0) + amount);
      }
      const current = ownerRewards.get(agent.ownerId) ?? { amount: 0, qualityBps: 0, agentIds: [] };
      const qualityBps = Math.max(5_000, Math.min(12_000, Math.round(agent.successRate * 100)));
      const nextAmount = current.amount + amount;
      ownerRewards.set(agent.ownerId, {
        amount: nextAmount,
        qualityBps: nextAmount > 0 ? Math.round((current.qualityBps * current.amount + qualityBps * amount) / nextAmount) : qualityBps,
        agentIds: [...current.agentIds, agentId],
      });
    }
    for (const [ownerId, amount] of walletPayouts) {
      const ownerTransactions = this.walletTransactions.get(ownerId) ?? [];
      if (ownerTransactions.some((transaction) => transaction.type === 'agent_payout' && transaction.missionId === id)) continue;
      this.walletBalances.set(ownerId, Number(((this.walletBalances.get(ownerId) ?? 0) + amount).toFixed(6)));
      this.walletTransactions.set(ownerId, [{
        id: crypto.randomUUID(), type: 'agent_payout', amount, token: 'CREDIT', missionId: id, createdAt: now,
      }, ...ownerTransactions]);
    }
    for (const [ownerId, reward] of ownerRewards) {
      await this.recordRewardActivity({
        id: `YDACT-${id}-agent-${ownerId}`,
        sourceKey: `${id}:settlement:agent_owner:${ownerId}`,
        userId: ownerId,
        missionId: id,
        disputeId: null,
        role: 'agent_owner',
        formulaVersion: REWARD_FORMULA_VERSION,
        asset: escrow.token,
        settledAmount: reward.amount,
        qualityBps: reward.qualityBps,
        penaltyBps: 0,
        scoreMicros: rewardScoreMicros(reward.amount, 'agent_owner', reward.qualityBps),
        eligible: true,
        detail: { source: 'mission_settlement', agentIds: reward.agentIds, releaseTxHash },
        occurredAt: now,
        createdAt: now,
      });
    }
    return { mission: copy(updated), applied: true };
  }

  async listStages(missionId: string): Promise<WorkflowStage[]> {
    return copy(this.stages.get(missionId) ?? []);
  }

  async listEdges(missionId: string): Promise<WorkflowEdge[]> {
    return copy(this.edges.get(missionId) ?? []);
  }

  async recordWorkflowTransition(checkpoint: WorkflowTransitionCheckpoint): Promise<{ applied: boolean; checkpoint: WorkflowTransitionCheckpoint }> {
    const rows = this.workflowTransitions.get(checkpoint.missionId) ?? [];
    const existing = rows.find((item) => item.edgeId === checkpoint.edgeId && item.sourceAttemptNo === checkpoint.sourceAttemptNo);
    if (existing) return { applied: false, checkpoint: copy(existing) };
    const mission = this.missions.get(checkpoint.missionId);
    const edge = (this.edges.get(checkpoint.missionId) ?? []).find((candidate) => candidate.id === checkpoint.edgeId);
    const source = (this.stages.get(checkpoint.missionId) ?? []).find((stage) => stage.id === checkpoint.sourceStageId);
    if (!mission || mission.workflowVersion !== checkpoint.workflowVersion || !edge
      || edge.sourceStageId !== checkpoint.sourceStageId || edge.targetStageId !== checkpoint.targetStageId
      || source?.status !== 'done' || source.attemptNo !== checkpoint.sourceAttemptNo) {
      throw new Error('WORKFLOW_TRANSITION_CONFLICT');
    }
    this.workflowTransitions.set(checkpoint.missionId, [...rows, copy(checkpoint)]);
    return { applied: true, checkpoint: copy(checkpoint) };
  }

  async listWorkflowTransitions(missionId: string, limit?: number): Promise<WorkflowTransitionCheckpoint[]> {
    const rows = (this.workflowTransitions.get(missionId) ?? [])
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.edgeId.localeCompare(right.edgeId));
    return copy(limit === undefined ? rows : rows.slice(-Math.max(1, Math.min(5_000, limit))));
  }

  async listCurrentWorkflowTransitions(missionId: string): Promise<WorkflowTransitionCheckpoint[]> {
    const stages = new Map((this.stages.get(missionId) ?? []).map((stage) => [stage.id, stage]));
    return copy((this.workflowTransitions.get(missionId) ?? [])
      .filter((checkpoint) => stages.get(checkpoint.sourceStageId)?.attemptNo === checkpoint.sourceAttemptNo)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.edgeId.localeCompare(right.edgeId)));
  }

  async saveWorkflowTemplateVersion(input: {
    id: string; ownerId: string; name: string; description: string; nodes: WorkflowStage[]; edges: WorkflowEdge[];
    entryIds: string[]; exitIds: string[]; contentHash: string; createdAt: string;
  }): Promise<WorkflowTemplateSaveResult> {
    const rows = this.workflowTemplates.get(input.ownerId) ?? [];
    const existingIndex = rows.findIndex((detail) => detail.template.name === input.name);
    if (existingIndex < 0) {
      const detail: WorkflowTemplateDetail = {
        template: {
          id: input.id, ownerId: input.ownerId, name: input.name, description: input.description,
          currentVersion: 1, createdAt: input.createdAt, updatedAt: input.createdAt,
        },
        version: {
          templateId: input.id, version: 1, nodes: copy(input.nodes), edges: copy(input.edges),
          entryIds: copy(input.entryIds), exitIds: copy(input.exitIds), contentHash: input.contentHash, createdAt: input.createdAt,
        },
      };
      this.workflowTemplates.set(input.ownerId, [...rows, detail]);
      return { state: 'saved', detail: copy(detail) };
    }
    const existing = rows[existingIndex];
    const versions = (existing as WorkflowTemplateDetail & { versions?: WorkflowTemplateDetail['version'][] }).versions
      ?? [existing.version];
    const current = versions.find((version) => version.version === existing.template.currentVersion) ?? existing.version;
    if (current.contentHash === input.contentHash && existing.template.description === input.description) {
      return { state: 'unchanged', detail: copy({ template: existing.template, version: current }) };
    }
    const nextVersion = existing.template.currentVersion + 1;
    const version = {
      templateId: existing.template.id, version: nextVersion, nodes: copy(input.nodes), edges: copy(input.edges),
      entryIds: copy(input.entryIds), exitIds: copy(input.exitIds), contentHash: input.contentHash, createdAt: input.createdAt,
    };
    const next = {
      template: {
        ...existing.template, description: input.description, currentVersion: nextVersion, updatedAt: input.createdAt,
      },
      version,
      versions: [...versions, version],
    };
    const nextRows = [...rows];
    nextRows[existingIndex] = next;
    this.workflowTemplates.set(input.ownerId, nextRows);
    return { state: 'saved', detail: copy({ template: next.template, version }) };
  }

  async listWorkflowTemplates(ownerId: string): Promise<WorkflowTemplateDetail[]> {
    return copy((this.workflowTemplates.get(ownerId) ?? [])
      .map((detail) => ({ template: detail.template, version: detail.version }))
      .sort((left, right) => right.template.updatedAt.localeCompare(left.template.updatedAt)));
  }

  async getWorkflowTemplate(ownerId: string, templateId: string, version?: number): Promise<WorkflowTemplateDetail | null> {
    const detail = (this.workflowTemplates.get(ownerId) ?? []).find((candidate) => candidate.template.id === templateId);
    if (!detail) return null;
    const versions = (detail as WorkflowTemplateDetail & { versions?: WorkflowTemplateDetail['version'][] }).versions
      ?? [detail.version];
    const selected = version === undefined ? versions.find((candidate) => candidate.version === detail.template.currentVersion)
      : versions.find((candidate) => candidate.version === version);
    return selected ? copy({ template: detail.template, version: selected }) : null;
  }

  async listStageOffers(missionId: string, now = new Date().toISOString()): Promise<StageOffer[]> {
    return copy((this.stageOffers.get(missionId) ?? []).map((offer) => (
      offer.status === 'pending' && Date.parse(offer.expiresAt) <= Date.parse(now)
        ? { ...offer, status: 'expired' as const }
        : offer
    )));
  }

  async getStageOffer(id: string, now = new Date().toISOString()): Promise<StageOffer | null> {
    const offer = [...this.stageOffers.values()].flat().find((item) => item.id === id);
    if (!offer) return null;
    return copy(offer.status === 'pending' && Date.parse(offer.expiresAt) <= Date.parse(now)
      ? { ...offer, status: 'expired' as const }
      : offer);
  }

  async respondStageOffer(id: string, ownerId: string, decision: 'accepted' | 'declined', respondedAt: string): Promise<StageOffer | null> {
    for (const [missionId, offers] of this.stageOffers) {
      const index = offers.findIndex((offer) => offer.id === id);
      if (index < 0) continue;
      const offer = offers[index];
      const agent = this.agents.get(offer.agentId);
      if (offer.status !== 'pending' || Date.parse(offer.expiresAt) <= Date.parse(respondedAt) || agent?.ownerId !== ownerId || this.escrows.get(missionId)?.status !== 'pending') return null;
      const updated: StageOffer = { ...offer, status: decision, respondedAt, updatedAt: respondedAt };
      const next = [...offers];
      next[index] = updated;
      this.stageOffers.set(missionId, next);
      const mission = this.missions.get(missionId);
      if (mission?.status === 'matching') {
        if (decision === 'declined') {
          this.missions.set(missionId, { ...mission, currentStage: 'Agent 已拒绝接单，等待重新选择', updatedAt: respondedAt });
        } else {
          const stages = this.stages.get(missionId) ?? [];
          const taskStages = stages.filter((stage) => stage.nodeType === 'task');
          const allAccepted = taskStages.length > 0 && taskStages.every((stage) => stage.agentId && next.some((candidate) => (
            candidate.stageId === stage.id
            && candidate.agentId === stage.agentId
            && candidate.status === 'accepted'
          )));
          if (allAccepted) this.missions.set(missionId, { ...mission, currentStage: 'Agent 已全部接单，等待托管支付', updatedAt: respondedAt });
        }
      }
      return copy(updated);
    }
    return null;
  }

  async claimStageForDispatch(missionId: string, stageId: string): Promise<WorkflowStage | null> {
    const stages = this.stages.get(missionId) ?? [];
    const mission = this.missions.get(missionId);
    const escrow = this.escrows.get(missionId);
    if (mission?.status !== 'running' || escrow?.status !== 'held' || this.missionControls.get(missionId)?.pausedAt) return null;
    const edges = this.edges.get(missionId) ?? [];
    const dependenciesDone = edges
      .filter((edge) => edge.targetStageId === stageId)
      .every((edge) => stages.find((stage) => stage.id === edge.sourceStageId)?.status === 'done');
    const hasCurrentTransitionError = (this.workflowTransitions.get(missionId) ?? []).some((checkpoint) => (
      checkpoint.targetStageId === stageId && checkpoint.errorCode
      && stages.find((stage) => stage.id === checkpoint.sourceStageId)?.attemptNo === checkpoint.sourceAttemptNo
    ));
    const hasMissingRuleCheckpoint = edges
      .filter((edge) => edge.targetStageId === stageId && (edge.condition || edge.mappings?.length))
      .some((edge) => !(this.workflowTransitions.get(missionId) ?? []).some((checkpoint) => (
        checkpoint.edgeId === edge.id
        && checkpoint.sourceAttemptNo === stages.find((stage) => stage.id === edge.sourceStageId)?.attemptNo
      )));
    const index = stages.findIndex((stage) => (
      stage.id === stageId && stage.nodeType === 'task' && stage.agentId && (stage.status === 'queued' || stage.status === 'failed')
    ));
    if (index < 0 || !dependenciesDone || hasCurrentTransitionError || hasMissingRuleCheckpoint) return null;
    const updated = { ...stages[index], status: 'running' as const, progress: Math.max(1, stages[index].progress) };
    const next = [...stages];
    next[index] = updated;
    this.stages.set(missionId, next);
    return copy(updated);
  }

  async resetStageDispatch(missionId: string, stageId: string): Promise<void> {
    const stages = this.stages.get(missionId) ?? [];
    this.stages.set(missionId, stages.map((stage) => stage.id === stageId && stage.status === 'running' ? { ...stage, status: 'queued' } : stage));
  }

  async setStageProgress(missionId: string, stageId: string, progress: number): Promise<WorkflowStage | null> {
    const stages = this.stages.get(missionId) ?? [];
    const index = stages.findIndex((stage) => stage.id === stageId && stage.status === 'running');
    if (index < 0) return null;
    const updated = { ...stages[index], progress: Math.max(stages[index].progress, Math.min(100, progress)) };
    const next = [...stages];
    next[index] = updated;
    this.stages.set(missionId, next);
    return copy(updated);
  }

  async resetWorkflowNodes(missionId: string, stageIds: string[], gateId?: string): Promise<void> {
    const ids = new Set([...stageIds, ...(gateId ? [gateId] : [])]);
    const stages = this.stages.get(missionId) ?? [];
    this.stages.set(missionId, stages.map((stage) => ids.has(stage.id)
      ? { ...stage, status: 'queued' as const, progress: 0, output: null }
      : stage));
  }

  async updateMissionWorkflowState(missionId: string, progress: number, currentStage: string): Promise<Mission | null> {
    const mission = this.missions.get(missionId);
    if (!mission) return null;
    const updated = { ...mission, progress: Math.max(0, Math.min(100, progress)), currentStage, updatedAt: new Date().toISOString() };
    this.missions.set(missionId, updated);
    return copy(updated);
  }

  async enqueueDispatches(missionId: string, stageIds: string[], now: string): Promise<DispatchOutboxItem[]> {
    const mission = this.missions.get(missionId);
    if (mission?.status !== 'running' || this.escrows.get(missionId)?.status !== 'held' || this.missionControls.get(missionId)?.pausedAt) return [];
    const queued: DispatchOutboxItem[] = [];
    const expiresAt = new Date(Date.parse(now) + 2 * 60 * 60 * 1_000).toISOString();
    for (const stageId of stageIds) {
      const existing = [...this.dispatchOutbox.values()].find((item) => item.missionId === missionId && item.stageId === stageId);
      const refreshRun = existing?.status === 'done'
        || (existing?.status === 'pending' && Date.parse(existing.expiresAt) <= Date.parse(now));
      const item = existing
        ? {
          ...existing,
          status: refreshRun ? 'pending' as const : existing.status,
          runId: refreshRun ? crypto.randomUUID() : existing.runId,
          expiresAt: refreshRun ? expiresAt : existing.expiresAt,
          attempts: refreshRun ? 0 : existing.attempts,
          nextAttemptAt: now,
          updatedAt: now,
        }
        : {
          id: `OUTBOX-${crypto.randomUUID()}`,
          missionId,
          stageId,
          runId: crypto.randomUUID(),
          expiresAt,
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        };
      this.dispatchOutbox.set(item.id, item);
      queued.push(copy(item));
    }
    return queued;
  }

  async recoverExpiredStageDispatches(missionId: string, now: string): Promise<string[]> {
    const mission = this.missions.get(missionId);
    if (mission?.status !== 'running' || this.escrows.get(missionId)?.status !== 'held'
      || this.missionControls.get(missionId)?.pausedAt) return [];
    const stages = this.stages.get(missionId) ?? [];
    const recovered: string[] = [];
    const nextStages = stages.map((stage) => {
      if (stage.status !== 'running') return stage;
      const outbox = [...this.dispatchOutbox.values()].find((item) => (
        item.missionId === missionId && item.stageId === stage.id
      ));
      const dispatch = outbox ? this.agentDispatches.get(outbox.runId) : null;
      if (!outbox || !dispatch || dispatch.completedAt || dispatch.attemptNo !== stage.attemptNo
        || Date.parse(dispatch.expiresAt) > Date.parse(now)) return stage;
      dispatch.completedAt = now;
      this.dispatchOutbox.set(outbox.id, { ...outbox, status: 'done', updatedAt: now });
      recovered.push(stage.id);
      return { ...stage, status: 'queued' as const, progress: 0, output: null, updatedAt: now };
    });
    if (recovered.length) this.stages.set(missionId, nextStages);
    return recovered;
  }

  async listPendingDispatches(limit: number, now: string): Promise<DispatchOutboxItem[]> {
    for (const [id, item] of this.dispatchOutbox) {
      if (item.status === 'processing' && !this.missionControls.get(item.missionId)?.pausedAt && Date.parse(item.updatedAt) <= Date.parse(now) - 2 * 60 * 1_000) {
        this.dispatchOutbox.set(id, { ...item, status: 'pending', nextAttemptAt: now, updatedAt: now });
      }
    }
    return copy([...this.dispatchOutbox.values()]
      .filter((item) => item.status === 'pending' && !this.missionControls.get(item.missionId)?.pausedAt && Date.parse(item.nextAttemptAt) <= Date.parse(now))
      .sort((left, right) => left.nextAttemptAt.localeCompare(right.nextAttemptAt) || left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit));
  }

  async claimDispatch(id: string, now: string): Promise<boolean> {
    const item = this.dispatchOutbox.get(id);
    const mission = item ? this.missions.get(item.missionId) : null;
    if (!item || item.status !== 'pending' || Date.parse(item.nextAttemptAt) > Date.parse(now)
      || mission?.status !== 'running' || this.escrows.get(item.missionId)?.status !== 'held'
      || this.missionControls.get(item.missionId)?.pausedAt) return false;
    this.dispatchOutbox.set(id, { ...item, status: 'processing', attempts: item.attempts + 1, updatedAt: now });
    return true;
  }

  async completeDispatch(id: string, status: 'done' | 'pending', now: string, nextAttemptAt = now): Promise<void> {
    const item = this.dispatchOutbox.get(id);
    if (!item || item.status !== 'processing') return;
    this.dispatchOutbox.set(id, { ...item, status, nextAttemptAt, updatedAt: now });
  }

  async updateStage(
    missionId: string,
    stageId: string,
    status: WorkflowStage['status'],
    output?: Record<string, unknown> | null,
  ): Promise<WorkflowStage | null> {
    const stages = this.stages.get(missionId) ?? [];
    const index = stages.findIndex((stage) => stage.id === stageId);
    if (index < 0) return null;
    const updated: WorkflowStage = {
      ...stages[index],
      status,
      progress: status === 'done' ? 100 : status === 'queued' ? 0 : stages[index].progress,
      ...(output === undefined ? {} : { output: copy(output) }),
    };
    const next = [...stages];
    next[index] = updated;
    this.stages.set(missionId, next);
    if (updated.agentId && (status === 'done' || status === 'failed')) this.recordAgentPerformance(stageId, updated.agentId, status);
    return copy(updated);
  }

  async transitionStage(
    missionId: string,
    stageId: string,
    expectedStatus: WorkflowStage['status'],
    status: WorkflowStage['status'],
    output?: Record<string, unknown> | null,
  ): Promise<WorkflowStage | null> {
    const stages = this.stages.get(missionId) ?? [];
    const index = stages.findIndex((stage) => stage.id === stageId);
    const mission = this.missions.get(missionId);
    const escrow = this.escrows.get(missionId);
    if (index < 0 || stages[index].status !== expectedStatus || mission?.status !== 'running'
      || escrow?.status !== 'held' || this.missionControls.get(missionId)?.pausedAt) return null;
    const updated: WorkflowStage = {
      ...stages[index],
      status,
      progress: status === 'done' ? 100 : status === 'queued' ? 0 : stages[index].progress,
      ...(output === undefined ? {} : { output: copy(output) }),
    };
    const next = [...stages];
    next[index] = updated;
    this.stages.set(missionId, next);
    return copy(updated);
  }

  async transitionRunningStage(
    missionId: string,
    stageId: string,
    status: Exclude<WorkflowStage['status'], 'queued'>,
    output?: Record<string, unknown> | null,
  ): Promise<WorkflowStage | null> {
    const stages = this.stages.get(missionId) ?? [];
    const index = stages.findIndex((stage) => stage.id === stageId);
    const mission = this.missions.get(missionId);
    const escrow = this.escrows.get(missionId);
    if (index < 0 || stages[index].status !== 'running' || mission?.status !== 'running' || escrow?.status !== 'held') return null;
    const updated: WorkflowStage = {
      ...stages[index],
      status,
      progress: status === 'done' ? 100 : stages[index].progress,
      ...(output === undefined ? {} : { output: copy(output) }),
    };
    const next = [...stages];
    next[index] = updated;
    this.stages.set(missionId, next);
    if (updated.agentId && (status === 'done' || status === 'failed')) this.recordAgentPerformance(stageId, updated.agentId, status);
    return copy(updated);
  }

  async addEvent(event: ExecutionEvent, progress?: number, currentStage?: string, stageGuard?: WorkflowStage['status']): Promise<ExecutionEvent> {
    this.events.set(event.missionId, [...(this.events.get(event.missionId) ?? []), copy(event)]);
    const mission = this.missions.get(event.missionId);
    const guardedStage = stageGuard && event.stageId
      ? (this.stages.get(event.missionId) ?? []).find((stage) => stage.id === event.stageId && stage.status === stageGuard)
      : null;
    if (mission && (!stageGuard || guardedStage) && (progress !== undefined || currentStage !== undefined)) {
      this.missions.set(event.missionId, {
        ...mission,
        progress: progress === undefined ? mission.progress : Math.max(mission.progress, progress),
        currentStage: currentStage ?? mission.currentStage,
      });
    }
    return copy(event);
  }

  async listEvents(missionId: string): Promise<ExecutionEvent[]> {
    return copy(this.events.get(missionId) ?? []);
  }

  async addDeliverable(deliverable: Deliverable): Promise<Deliverable> {
    const stage = deliverable.stageId
      ? (this.stages.get(deliverable.missionId) ?? []).find((candidate) => candidate.id === deliverable.stageId)
      : null;
    const attemptNo = stage ? deliverable.attemptNo ?? stage.attemptNo : null;
    if (deliverable.stageId && (!stage || attemptNo !== stage.attemptNo)) throw new Error('STALE_STAGE_ATTEMPT');
    if (deliverable.ipfsEvidence) {
      const prior = (this.deliverables.get(deliverable.missionId) ?? [])
        .filter((item) => item.ipfsEvidence?.scopeKey === deliverable.ipfsEvidence?.scopeKey)
        .sort((left, right) => (right.ipfsEvidence?.versionNo ?? 0) - (left.ipfsEvidence?.versionNo ?? 0))[0];
      const expectedVersion = prior ? prior.ipfsEvidence!.versionNo + 1 : 1;
      if (deliverable.ipfsEvidence.versionNo !== expectedVersion) throw new Error('IPFS_VERSION_CONFLICT');
      if (deliverable.ipfsEvidence.supersedesDeliverableId !== (prior?.id ?? null)) throw new Error('IPFS_PARENT_CONFLICT');
      if (deliverable.ipfsEvidence.manifest.supersedesRootCid !== (prior?.ipfsEvidence?.rootCid ?? null)) throw new Error('IPFS_PARENT_CID_CONFLICT');
      if ((this.deliverables.get(deliverable.missionId) ?? []).some((item) =>
        item.ipfsEvidence?.scopeKey === deliverable.ipfsEvidence?.scopeKey
        && item.ipfsEvidence.rootCid === deliverable.ipfsEvidence?.rootCid)) throw new Error('IPFS_CID_CONFLICT');
    }
    const stored = { ...deliverable, attemptNo };
    this.deliverables.set(deliverable.missionId, [...(this.deliverables.get(deliverable.missionId) ?? []), copy(stored)]);
    return copy(stored);
  }

  async listDeliverables(missionId: string): Promise<Deliverable[]> {
    return copy(this.deliverables.get(missionId) ?? []);
  }

  async updateDeliverableIpfsVerification(
    missionId: string,
    deliverableId: string,
    status: NonNullable<Deliverable['ipfsEvidence']>['verificationStatus'],
    verifiedAt: string,
    error: string | null,
  ): Promise<Deliverable | null> {
    const rows = this.deliverables.get(missionId) ?? [];
    const index = rows.findIndex((item) => item.id === deliverableId && item.ipfsEvidence);
    if (index < 0) return null;
    const next = [...rows];
    const persistedStatus = next[index].ipfsEvidence!.verificationStatus === 'verified' && status === 'unavailable'
      ? 'verified'
      : status;
    next[index] = {
      ...next[index],
      ipfsEvidence: { ...next[index].ipfsEvidence!, verificationStatus: persistedStatus, lastVerifiedAt: verifiedAt, lastVerificationError: error },
    };
    this.deliverables.set(missionId, next);
    return copy(next[index]);
  }

  async getAcceptanceEvidenceSnapshot(missionId: string): Promise<MissionEvidenceSnapshot | null> {
    return copy(this.acceptanceEvidenceSnapshots.get(missionId) ?? null);
  }

  async recordEvidencePublication(publication: EvidencePublication): Promise<EvidencePublication> {
    const rows = this.evidencePublications.get(publication.missionId) ?? [];
    const existing = rows.find((item) => item.kind === publication.kind && item.subjectId === publication.subjectId);
    if (existing) {
      if (existing.payloadSha256 !== publication.payloadSha256 || existing.rootCid !== publication.rootCid) {
        throw new Error('EVIDENCE_PUBLICATION_CONFLICT');
      }
      return copy(existing);
    }
    this.evidencePublications.set(publication.missionId, [...rows, copy(publication)]);
    return copy(publication);
  }

  async listEvidencePublications(missionId: string): Promise<EvidencePublication[]> {
    return copy([...(this.evidencePublications.get(missionId) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async listAgentCidPortfolio(agentId: string, limit = 20): Promise<AgentCidPortfolioItem[]> {
    const rows: AgentCidPortfolioItem[] = [];
    for (const mission of this.missions.values()) {
      if (mission.status !== 'completed') continue;
      const attempts = new Map((this.stages.get(mission.id) ?? []).map((stage) => [stage.id, stage.attemptNo]));
      for (const deliverable of this.deliverables.get(mission.id) ?? []) {
        const evidence = deliverable.ipfsEvidence;
        if (!evidence || deliverable.agentId !== agentId) continue;
        if (deliverable.stageId && deliverable.attemptNo !== attempts.get(deliverable.stageId)) continue;
        rows.push({
          missionId: mission.id, missionTitle: mission.title, deliverableId: deliverable.id, name: deliverable.name,
          rootCid: evidence.rootCid, manifestSha256: evidence.manifestSha256, versionNo: evidence.versionNo,
          visibility: evidence.visibility, verificationStatus: evidence.verificationStatus, completedAt: mission.updatedAt,
        });
      }
    }
    return copy(rows.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.versionNo - a.versionNo).slice(0, Math.max(1, Math.min(50, limit))));
  }

  async getEscrow(missionId: string): Promise<Escrow | null> {
    return copy(this.escrows.get(missionId) ?? null);
  }

  async getWalletAccount(userId: string, limit = 30): Promise<WalletAccount> {
    const lastClaimAt = this.testTopupClaims.get(userId) ?? null;
    return {
      balance: this.walletBalances.get(userId) ?? 0,
      token: 'CREDIT',
      testTopupAmount: TEST_TOPUP_AMOUNT,
      nextTestTopupAt: lastClaimAt ? new Date(Date.parse(lastClaimAt) + 24 * 60 * 60 * 1000).toISOString() : null,
      transactions: copy((this.walletTransactions.get(userId) ?? []).slice(0, limit)),
    };
  }

  async claimTestCredit(userId: string, now: string): Promise<{ account: WalletAccount; credited: boolean }> {
    const lastClaimAt = this.testTopupClaims.get(userId);
    const credited = !lastClaimAt || Date.parse(now) - Date.parse(lastClaimAt) >= 24 * 60 * 60 * 1000;
    if (credited) {
      this.testTopupClaims.set(userId, now);
      this.walletBalances.set(userId, Number(((this.walletBalances.get(userId) ?? 0) + TEST_TOPUP_AMOUNT).toFixed(6)));
      this.walletTransactions.set(userId, [{
        id: crypto.randomUUID(), type: 'test_topup', amount: TEST_TOPUP_AMOUNT, token: 'CREDIT', missionId: null, createdAt: now,
      }, ...(this.walletTransactions.get(userId) ?? [])]);
    }
    return { account: await this.getWalletAccount(userId), credited };
  }

  private latestDisputeProposal(disputeId: string): ArbitrationProposal | null {
    return [...(this.disputeProposals.get(disputeId) ?? [])].sort((left, right) => right.round - left.round)[0] ?? null;
  }

  private disputeParty(dispute: Dispute, userId: string): boolean {
    const mission = this.missions.get(dispute.missionId);
    if (dispute.openedBy === userId || mission?.requesterId === userId) return true;
    return (this.stages.get(dispute.missionId) ?? []).some((stage) => (
      stage.agentId ? this.agents.get(stage.agentId)?.ownerId === userId : false
    ));
  }

  private arbitrationConflicts(dispute: Dispute): Set<string> {
    const conflicts = new Set<string>([dispute.openedBy]);
    const mission = this.missions.get(dispute.missionId);
    if (mission) conflicts.add(mission.requesterId);
    for (const stage of this.stages.get(dispute.missionId) ?? []) {
      const ownerId = stage.agentId ? this.agents.get(stage.agentId)?.ownerId : null;
      if (ownerId) conflicts.add(ownerId);
    }
    return conflicts;
  }

  async listDisputes(user: UserContext): Promise<Dispute[]> {
    const all = [...this.disputes.values()].flat();
    if (user.role === 'admin' || this.arbitrationMembers.get(user.id)?.status === 'active') return copy(all);
    return copy(all.filter((dispute) => {
      if (this.disputeParty(dispute, user.id)) return true;
      const proposal = this.latestDisputeProposal(dispute.id);
      return proposal ? (this.disputeElectorate.get(proposal.id) ?? []).some((elector) => elector.userId === user.id) : false;
    }));
  }

  async getDisputes(missionId: string): Promise<Dispute[]> {
    return copy(this.disputes.get(missionId) ?? []);
  }

  async createDispute(dispute: Dispute): Promise<Dispute> {
    if ((this.disputes.get(dispute.missionId) ?? []).some((item) => item.status === 'open' || item.status === 'reviewing')) {
      throw new Error('ACTIVE_DISPUTE_EXISTS');
    }
    const mission = this.missions.get(dispute.missionId);
    const escrow = this.escrows.get(dispute.missionId);
    if (!mission || !['running', 'review'].includes(mission.status) || escrow?.status !== 'held') {
      throw new Error('ESCROW_NOT_HELD');
    }
    this.disputes.set(dispute.missionId, [...(this.disputes.get(dispute.missionId) ?? []), copy(dispute)]);
    if (escrow) this.escrows.set(dispute.missionId, { ...escrow, status: 'frozen', freezeTxHash: dispute.freezeTxHash });
    return copy(dispute);
  }

  async startDisputeReview(
    id: string,
    actorId: string,
    startedAt = new Date().toISOString(),
    weightMode: ArbitrationProposal['weightMode'] = 'one_person_one_vote',
  ): Promise<Dispute | null> {
    for (const [missionId, disputes] of this.disputes) {
      const index = disputes.findIndex((dispute) => dispute.id === id);
      if (index < 0) continue;
      const existing = disputes[index];
      if (!['open', 'reviewing'].includes(existing.status)) return copy(existing);
      if ((this.disputeProposals.get(id) ?? []).length > 0) {
        if (existing.status === 'open') {
          const next = [...disputes];
          next[index] = { ...existing, status: 'reviewing' };
          this.disputes.set(missionId, next);
          return copy(next[index]);
        }
        return copy(existing);
      }
      if (this.arbitrationMembers.size === 0) {
        for (const profile of this.profiles.values()) {
          if (profile.role !== 'admin') continue;
          this.arbitrationMembers.set(profile.id, {
            userId: profile.id,
            displayName: profile.displayName,
            email: profile.email,
            role: profile.role,
            status: 'active',
            power: 1,
            appointedBy: profile.id,
            appointedAt: startedAt,
            updatedAt: startedAt,
          });
        }
      }
      const conflictIds = this.arbitrationConflicts(existing);
      const eligibleMembers = [...this.arbitrationMembers.values()]
        .filter((member) => member.status === 'active' && !conflictIds.has(member.userId))
        .sort((left, right) => left.userId.localeCompare(right.userId));
      if (eligibleMembers.length === 0) throw new Error('ARBITRATION_NO_ELIGIBLE_MEMBERS');
      const proposalId = `PROP-${crypto.randomUUID()}`;
      const electorate = eligibleMembers.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        powerSnapshot: member.power,
        voteWeight: arbitrationVoteWeight(weightMode, member.power),
      }));
      const eligibleWeight = electorate.reduce((sum, member) => sum + member.voteWeight, 0);
      const proposal: ArbitrationProposal = {
        id: proposalId,
        disputeId: id,
        proposerId: actorId,
        status: 'active',
        weightMode,
        weightVersion: arbitrationWeightVersion(weightMode),
        round: 0,
        parentProposalId: null,
        appealReason: null,
        appealDeadlineAt: null,
        votingStartsAt: startedAt,
        votingEndsAt: arbitrationVotingEndsAt(startedAt),
        quorumRequired: arbitrationQuorum(eligibleWeight),
        eligibleWeight,
        supportVotes: 0,
        opposeVotes: 0,
        abstainVotes: 0,
        outcome: null,
        finalizedAt: null,
        finalizedBy: null,
        executedAt: null,
        executedBy: null,
        createdAt: startedAt,
      };
      this.disputeProposals.set(id, [proposal]);
      this.disputeElectorate.set(proposalId, electorate);
      this.disputeVotes.set(proposalId, []);
      const updated = { ...existing, status: 'reviewing' as const };
      const next = [...disputes];
      next[index] = updated;
      this.disputes.set(missionId, next);
      this.disputeActions.set(id, [...(this.disputeActions.get(id) ?? []), {
        id: `${id}:review_started`, disputeId: id, actorId, action: 'review_started',
        note: `DAO proposal ${proposalId} created in ${weightMode} mode with ${eligibleWeight} eligible weight`, createdAt: startedAt,
      }]);
      return copy(updated);
    }
    return null;
  }

  async getDisputeGovernance(id: string, userId: string, now = new Date().toISOString()): Promise<DisputeGovernance | null> {
    const dispute = [...this.disputes.values()].flat().find((item) => item.id === id);
    if (!dispute) return null;
    const proposals = [...(this.disputeProposals.get(id) ?? [])].sort((left, right) => left.round - right.round);
    const proposal = proposals.at(-1) ?? null;
    if (!proposal) {
      return {
        proposal: null, electorate: [], votes: [], rounds: [], execution: null, executionReady: false,
        appeal: { used: false, deadlineAt: null, canAppeal: false, reason: null, appellantId: null, createdAt: null },
        currentUser: { eligible: false, canVote: false, hasVoted: false, choice: null },
      };
    }
    const electorate = this.disputeElectorate.get(proposal.id) ?? [];
    const votes = this.disputeVotes.get(proposal.id) ?? [];
    const currentVote = votes.find((vote) => vote.voterId === userId);
    const eligible = electorate.some((elector) => elector.userId === userId);
    const appealProposal = proposals.find((item) => item.round === 1) ?? null;
    const initialProposal = proposals.find((item) => item.round === 0) ?? null;
    return copy({
      proposal,
      electorate,
      votes,
      rounds: proposals.map((item) => ({
        proposal: item,
        electorate: this.disputeElectorate.get(item.id) ?? [],
        votes: this.disputeVotes.get(item.id) ?? [],
      })),
      appeal: {
        used: Boolean(appealProposal),
        deadlineAt: initialProposal?.appealDeadlineAt ?? null,
        canAppeal: !appealProposal && initialProposal?.status !== 'active' && initialProposal?.status !== 'executed'
          && !this.governanceExecutionQueue.has(id) && Boolean(initialProposal?.appealDeadlineAt)
          && Date.parse(now) < Date.parse(initialProposal!.appealDeadlineAt!) && this.disputeParty(dispute, userId),
        reason: appealProposal?.appealReason ?? null,
        appellantId: appealProposal?.proposerId ?? null,
        createdAt: appealProposal?.createdAt ?? null,
      },
      execution: this.governanceExecutionQueue.get(id) ?? null,
      executionReady: arbitrationExecutionReady(proposal, Boolean(appealProposal), now),
      currentUser: {
        eligible,
        canVote: eligible && !currentVote && proposal.status === 'active'
          && Date.parse(now) >= Date.parse(proposal.votingStartsAt)
          && Date.parse(now) < Date.parse(proposal.votingEndsAt),
        hasVoted: Boolean(currentVote),
        choice: currentVote?.choice ?? null,
      },
    });
  }

  async castDisputeVote(id: string, voterId: string, choice: DisputeVoteChoice, reason: string, votedAt: string): Promise<DisputeVoteMutationResult> {
    const governance = await this.getDisputeGovernance(id, voterId, votedAt);
    if (!governance?.proposal) return { state: 'missing' };
    if (governance.proposal.status !== 'active') return { state: 'closed' };
    if (Date.parse(votedAt) < Date.parse(governance.proposal.votingStartsAt)) return { state: 'closed' };
    if (Date.parse(votedAt) >= Date.parse(governance.proposal.votingEndsAt)) return { state: 'expired' };
    if (!governance.currentUser.eligible) return { state: 'not_eligible' };
    if (governance.currentUser.hasVoted) return { state: 'already_voted' };
    const elector = governance.electorate.find((item) => item.userId === voterId)!;
    const profile = this.profiles.get(voterId);
    const vote: DisputeVote = {
      id: `VOTE-${crypto.randomUUID()}`,
      proposalId: governance.proposal.id,
      voterId,
      voterDisplayName: profile?.displayName ?? voterId,
      choice,
      reason,
      voteWeight: elector.voteWeight,
      createdAt: votedAt,
    };
    this.disputeVotes.set(governance.proposal.id, [...governance.votes, vote]);
    const proposals = this.disputeProposals.get(id) ?? [];
    this.disputeProposals.set(id, proposals.map((proposal) => proposal.id === governance.proposal!.id ? {
      ...proposal,
      supportVotes: proposal.supportVotes + (choice === 'support_refund' ? elector.voteWeight : 0),
      opposeVotes: proposal.opposeVotes + (choice === 'oppose_refund' ? elector.voteWeight : 0),
      abstainVotes: proposal.abstainVotes + (choice === 'abstain' ? elector.voteWeight : 0),
    } : proposal));
    const finalized = await this.finalizeDisputeProposal(id, voterId, votedAt);
    if (finalized.state === 'missing') return { state: 'missing' };
    return { state: 'applied', governance: finalized.governance };
  }

  async finalizeDisputeProposal(id: string, actorId: string, finalizedAt: string): Promise<DisputeFinalizeResult> {
    const governance = await this.getDisputeGovernance(id, actorId, finalizedAt);
    if (!governance?.proposal) return { state: 'missing' };
    if (governance.proposal.status !== 'active') return { state: 'finalized', governance };
    const evaluation = evaluateArbitrationProposal(governance.proposal, finalizedAt);
    if (!evaluation.finalizable) return { state: 'not_ready', governance };
    const proposals = this.disputeProposals.get(id) ?? [];
    this.disputeProposals.set(id, proposals.map((proposal) => proposal.id === governance.proposal!.id ? {
      ...proposal,
      status: evaluation.status,
      outcome: evaluation.outcome,
      finalizedAt,
      finalizedBy: actorId,
      appealDeadlineAt: proposal.round === 0 ? arbitrationAppealEndsAt(finalizedAt) : null,
    } : proposal));
    return { state: 'finalized', governance: (await this.getDisputeGovernance(id, actorId, finalizedAt))! };
  }

  async createDisputeAppeal(id: string, appellantId: string, reason: string, createdAt: string): Promise<DisputeAppealResult> {
    const dispute = [...this.disputes.values()].flat().find((item) => item.id === id);
    if (!dispute) return { state: 'missing' };
    if (!this.disputeParty(dispute, appellantId)) return { state: 'not_allowed' };
    const proposals = this.disputeProposals.get(id) ?? [];
    if (proposals.some((proposal) => proposal.round === 1)) return { state: 'already_appealed' };
    const initial = proposals.find((proposal) => proposal.round === 0);
    if (!initial || initial.status === 'active' || initial.status === 'executed' || !initial.appealDeadlineAt) {
      return { state: 'not_finalized' };
    }
    if (Date.parse(createdAt) >= Date.parse(initial.appealDeadlineAt)) return { state: 'expired' };
    if (this.governanceExecutionQueue.has(id)) return { state: 'execution_queued' };
    const originalElectorate = this.disputeElectorate.get(initial.id) ?? [];
    const originalIds = new Set(originalElectorate.map((member) => member.userId));
    const currentEligible = [...this.arbitrationMembers.values()]
      .filter((member) => member.status === 'active' && !this.arbitrationConflicts(dispute).has(member.userId));
    if (!currentEligible.some((member) => !originalIds.has(member.userId))) return { state: 'no_expanded_electorate' };
    const currentById = new Map(this.arbitrationMembers.values().map((member) => [member.userId, member]));
    const electorateById = new Map(originalElectorate.map((member) => [member.userId, {
      ...member,
      powerSnapshot: currentById.get(member.userId)?.power ?? member.powerSnapshot,
    }]));
    for (const member of currentEligible) {
      electorateById.set(member.userId, {
        userId: member.userId, displayName: member.displayName, powerSnapshot: member.power,
        voteWeight: arbitrationVoteWeight(initial.weightMode, member.power),
      });
    }
    const electorate = [...electorateById.values()].sort((left, right) => left.userId.localeCompare(right.userId))
      .map((member) => ({ ...member, voteWeight: arbitrationVoteWeight(initial.weightMode, member.powerSnapshot) }));
    const eligibleWeight = electorate.reduce((sum, member) => sum + member.voteWeight, 0);
    const proposal: ArbitrationProposal = {
      id: `PROP-${crypto.randomUUID()}`, disputeId: id, proposerId: appellantId, status: 'active',
      weightMode: initial.weightMode, weightVersion: initial.weightVersion, round: 1, parentProposalId: initial.id,
      appealReason: reason, appealDeadlineAt: null, votingStartsAt: createdAt, votingEndsAt: arbitrationVotingEndsAt(createdAt),
      quorumRequired: arbitrationQuorum(eligibleWeight), eligibleWeight, supportVotes: 0, opposeVotes: 0, abstainVotes: 0,
      outcome: null, finalizedAt: null, finalizedBy: null, executedAt: null, executedBy: null, createdAt,
    };
    this.disputeProposals.set(id, [...proposals, proposal]);
    this.disputeElectorate.set(proposal.id, electorate);
    this.disputeVotes.set(proposal.id, []);
    this.disputeActions.set(id, [...(this.disputeActions.get(id) ?? []), {
      id: `${id}:appeal`, disputeId: id, actorId: appellantId, action: 'appeal_created', note: reason, createdAt,
    }]);
    return { state: 'created', governance: (await this.getDisputeGovernance(id, appellantId, createdAt))! };
  }

  async queueDisputeExecution(id: string, actorId: string, queuedAt: string, web3: boolean): Promise<DisputeExecutionQueueResult> {
    const governance = await this.getDisputeGovernance(id, actorId, queuedAt);
    if (!governance?.proposal) return { state: 'missing' };
    const existing = this.governanceExecutionQueue.get(id);
    if (existing?.status === 'executed') return { state: 'already_executed' };
    if (existing) return { state: 'replayed', governance };
    const dispute = [...this.disputes.values()].flat().find((item) => item.id === id)!;
    if (this.escrows.get(dispute.missionId)?.status !== 'frozen') return { state: 'escrow_not_frozen' };
    if (dispute.status !== 'reviewing' || !governance.executionReady) return { state: 'not_ready' };
    const action = governance.proposal.outcome === 'refund_requester' ? 'refund_requester' : 'reject_dispute';
    const payloadHash = await arbitrationExecutionPayloadHash(id, governance.proposal.id, action);
    const concurrentExecution = this.governanceExecutionQueue.get(id);
    if (concurrentExecution?.status === 'executed') return { state: 'already_executed' };
    if (concurrentExecution) {
      return { state: 'replayed', governance: (await this.getDisputeGovernance(id, actorId, queuedAt))! };
    }
    const currentProposals = [...(this.disputeProposals.get(id) ?? [])].sort((left, right) => left.round - right.round);
    const currentProposal = currentProposals.at(-1) ?? null;
    const currentDispute = [...this.disputes.values()].flat().find((item) => item.id === id);
    if (currentDispute?.status !== 'reviewing'
      || this.escrows.get(currentDispute.missionId)?.status !== 'frozen'
      || currentProposal?.id !== governance.proposal.id
      || !arbitrationExecutionReady(currentProposal, currentProposals.some((proposal) => proposal.round === 1), queuedAt)) {
      return { state: 'not_ready' };
    }
    const item: GovernanceExecutionItem = {
      id: `GEXEC-${crypto.randomUUID()}`, scope: 'task_dispute', sourceId: id, proposalId: governance.proposal.id,
      action, payloadHash,
      status: web3 ? 'awaiting_transaction' : 'queued', requestedBy: actorId, requestedAt: queuedAt,
      txHash: null, executedBy: null, executedAt: null,
    };
    this.governanceExecutionQueue.set(id, item);
    this.disputeActions.set(id, [...(this.disputeActions.get(id) ?? []), {
      id: `${id}:execution_queued`, disputeId: id, actorId, action: 'execution_queued', note: item.payloadHash, createdAt: queuedAt,
    }]);
    return { state: 'queued', governance: (await this.getDisputeGovernance(id, actorId, queuedAt))! };
  }

  async resolveDispute(id: string, resolution: string, status: 'resolved' | 'rejected', actorId: string, resolutionTxHash: string | null) {
    for (const [missionId, disputes] of this.disputes) {
      const index = disputes.findIndex((dispute) => dispute.id === id);
      if (index < 0) continue;
      const proposal = this.latestDisputeProposal(id);
      const execution = this.governanceExecutionQueue.get(id);
      const authorized = status === 'resolved'
        ? proposal?.status === 'succeeded' && proposal.outcome === 'refund_requester' && execution?.action === 'refund_requester'
        : proposal?.status === 'defeated' && proposal.outcome === 'reject_dispute' && execution?.action === 'reject_dispute';
      if (disputes[index].status !== 'reviewing' || !authorized) return { dispute: copy(disputes[index]), applied: false };
      const resolvedAt = new Date().toISOString();
      const updated = { ...disputes[index], status, resolution, resolutionTxHash, resolvedAt };
      const next = [...disputes];
      next[index] = updated;
      this.disputes.set(missionId, next);
      this.disputeProposals.set(id, (this.disputeProposals.get(id) ?? []).map((item) => item.id === proposal!.id
        ? { ...item, status: 'executed', executedAt: resolvedAt, executedBy: actorId }
        : item));
      this.governanceExecutionQueue.set(id, {
        ...execution!, status: 'executed', txHash: resolutionTxHash, executedBy: actorId, executedAt: resolvedAt,
      });
      const escrow = this.escrows.get(missionId);
      if (escrow?.status === 'frozen') {
        this.escrows.set(missionId, { ...escrow, status: status === 'resolved' ? 'refunded' : 'held', resolutionTxHash });
        if (status === 'resolved' && escrow.paymentMethod === 'web2_balance') {
          const mission = this.missions.get(missionId);
          if (mission) {
            const transactions = this.walletTransactions.get(mission.requesterId) ?? [];
            if (!transactions.some((transaction) => transaction.type === 'refund' && transaction.missionId === missionId)) {
              this.walletBalances.set(mission.requesterId, Number(((this.walletBalances.get(mission.requesterId) ?? 0) + escrow.amount).toFixed(6)));
              this.walletTransactions.set(mission.requesterId, [{
                id: crypto.randomUUID(), type: 'refund', amount: escrow.amount, token: 'CREDIT', missionId, createdAt: resolvedAt,
              }, ...transactions]);
            }
          }
        }
      }
      if (status === 'resolved') {
        const mission = this.missions.get(missionId);
        if (mission) this.missions.set(missionId, { ...mission, status: 'cancelled', progress: 100, currentStage: '争议退款，任务已终止', updatedAt: resolvedAt });
      }
      this.disputeActions.set(id, [...(this.disputeActions.get(id) ?? []), {
        id: `${id}:${status}`, disputeId: id, actorId, action: status, note: resolution, createdAt: resolvedAt,
      }, {
        id: `${id}:execution_executed`, disputeId: id, actorId, action: 'execution_executed', note: execution!.payloadHash, createdAt: resolvedAt,
      }]);
      for (const vote of this.disputeVotes.get(proposal!.id) ?? []) {
        await this.recordRewardActivity({
          id: `YDACT-${id}-arb-${vote.voterId}`,
          sourceKey: `${id}:arbitration:${vote.voterId}`,
          userId: vote.voterId,
          missionId,
          disputeId: id,
          role: 'arbitrator',
          formulaVersion: REWARD_FORMULA_VERSION,
          asset: 'YD_CONTRIBUTION',
          settledAmount: 1,
          qualityBps: 10_000,
          penaltyBps: 0,
          scoreMicros: rewardScoreMicros(1, 'arbitrator'),
          eligible: true,
          detail: { source: 'executed_arbitration', choice: vote.choice },
          occurredAt: resolvedAt,
          createdAt: resolvedAt,
        });
      }
      return { dispute: copy(updated), applied: true };
    }
    return null;
  }

  async listDisputeActions(disputeId: string): Promise<DisputeAction[]> {
    return copy(this.disputeActions.get(disputeId) ?? []);
  }

  async createAgentDispatch(dispatch: AgentDispatch): Promise<void> {
    if (this.agentDispatches.has(dispatch.runId)) return;
    const stage = (this.stages.get(dispatch.missionId) ?? []).find((candidate) => candidate.id === dispatch.stageId && candidate.status === 'running');
    if (!stage) throw new Error('STALE_STAGE_ATTEMPT');
    this.agentDispatches.set(dispatch.runId, {
      ...copy(dispatch), attemptNo: stage.attemptNo, completedAt: null,
      callbackIds: new Set(), appliedCallbackIds: new Set(),
    });
  }

  async applyAgentCallback(update: AgentCallbackUpdate) {
    const dispatch = this.agentDispatches.get(update.runId);
    if (!dispatch
      || dispatch.missionId !== update.missionId
      || dispatch.stageId !== update.stageId
      || dispatch.agentId !== update.agentId
      || dispatch.expiresAt !== update.expiresAt) return { state: 'missing' as const };
    if (dispatch.appliedCallbackIds.has(update.callbackId)) return { state: 'duplicate' as const };
    if (dispatch.completedAt || Date.parse(dispatch.expiresAt) <= Date.parse(update.now)) return { state: 'expired' as const };

    const mission = this.missions.get(update.missionId);
    const paused = Boolean(this.missionControls.get(update.missionId)?.pausedAt);
    const escrow = this.escrows.get(update.missionId);
    const stages = this.stages.get(update.missionId) ?? [];
    const index = stages.findIndex((stage) => stage.id === update.stageId && stage.agentId === update.agentId);
    if (mission?.status !== 'running' || escrow?.status !== 'held' || index < 0 || stages[index].status !== 'running'
      || dispatch.attemptNo !== stages[index].attemptNo
      || update.artifacts?.some((artifact) => artifact.attemptNo !== undefined
        && artifact.attemptNo !== null && artifact.attemptNo !== stages[index].attemptNo)
      || (paused && update.status === 'running')) {
      return { state: 'invalid' as const };
    }

    const stage: WorkflowStage = {
      ...stages[index],
      status: update.status,
      progress: update.status === 'done' ? 100 : update.progress === undefined ? stages[index].progress : Math.max(stages[index].progress, update.progress),
      ...(update.output === undefined ? {} : { output: copy(update.output) }),
      updatedAt: update.now,
    };
    const nextStages = [...stages];
    nextStages[index] = stage;
    this.stages.set(update.missionId, nextStages);
    if (update.status === 'done' || update.status === 'failed') this.recordAgentPerformance(update.stageId, update.agentId, update.status);
    this.events.set(update.missionId, [...(this.events.get(update.missionId) ?? []), copy(update.event)]);
    if (update.artifacts?.length) {
      this.deliverables.set(update.missionId, [
        ...(this.deliverables.get(update.missionId) ?? []),
        ...update.artifacts.map((artifact) => copy({ ...artifact, attemptNo: stage.attemptNo })),
      ]);
    }
    this.missions.set(update.missionId, {
      ...mission,
      progress: update.progress === undefined ? mission.progress : Math.max(mission.progress, update.progress),
      currentStage: update.currentStage,
      updatedAt: update.now,
    });
    dispatch.callbackIds.add(update.callbackId);
    dispatch.appliedCallbackIds.add(update.callbackId);
    if (update.status === 'done' || update.status === 'failed') {
      dispatch.completedAt = update.now;
      const outbox = [...this.dispatchOutbox.values()].find((item) => item.runId === update.runId);
      if (outbox) this.dispatchOutbox.set(outbox.id, { ...outbox, status: 'done', updatedAt: update.now });
    }
    return { state: 'applied' as const, stage: copy(stage) };
  }

  async claimAgentCallback(input: {
    runId: string; callbackId: string; missionId: string; stageId: string; agentId: string;
    expiresAt: string; now: string; status: WorkflowStage['status'];
  }): Promise<'accepted' | 'duplicate' | 'expired' | 'missing' | 'invalid'> {
    const dispatch = this.agentDispatches.get(input.runId);
    if (!dispatch) return 'missing';
    if (dispatch.missionId !== input.missionId || dispatch.stageId !== input.stageId
      || dispatch.agentId !== input.agentId || dispatch.expiresAt !== input.expiresAt) return 'missing';
    if (dispatch.appliedCallbackIds.has(input.callbackId)) return 'duplicate';
    if (dispatch.completedAt || Date.parse(dispatch.expiresAt) <= Date.parse(input.now)) return 'expired';
    const mission = this.missions.get(input.missionId);
    const stage = (this.stages.get(input.missionId) ?? []).find((candidate) => candidate.id === input.stageId);
    const paused = Boolean(this.missionControls.get(input.missionId)?.pausedAt);
    if (mission?.status !== 'running' || this.escrows.get(input.missionId)?.status !== 'held'
      || !stage || stage.agentId !== input.agentId || stage.status !== 'running'
      || stage.attemptNo !== dispatch.attemptNo || (paused && !['done', 'failed'].includes(input.status))) return 'invalid';
    dispatch.callbackIds.add(input.callbackId);
    return 'accepted';
  }

  async completeAgentDispatch(runId: string, now: string): Promise<void> {
    const dispatch = this.agentDispatches.get(runId);
    if (dispatch) dispatch.completedAt = now;
  }

  async listNotifications(userId: string): Promise<Notification[]> {
    return copy(this.notifications.get(userId) ?? []);
  }

  async createNotification(notification: Notification): Promise<Notification> {
    this.notifications.set(notification.userId, [copy(notification), ...(this.notifications.get(notification.userId) ?? [])]);
    return copy(notification);
  }

  async markNotificationsRead(userId: string): Promise<void> {
    this.notifications.set(userId, (this.notifications.get(userId) ?? []).map((notification) => ({ ...notification, read: true })));
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    return copy(this.preferences.get(userId) ?? defaultPreferences());
  }

  async updateUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    this.preferences.set(userId, copy(preferences));
    return copy(preferences);
  }

  async listAdminUsers(limit: number): Promise<AdminUser[]> {
    return copy([...this.profiles.values()]
      .map((profile) => {
        const member = this.arbitrationMembers.get(profile.id);
        return {
          ...profile,
          createdAt: '',
          updatedAt: '',
          arbitration: member ? { status: member.status, power: member.power } : null,
        };
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .slice(0, limit));
  }

  async listArbitrationMembers(): Promise<ArbitrationMember[]> {
    return copy([...this.arbitrationMembers.values()]
      .sort((left, right) => left.status.localeCompare(right.status) || left.displayName.localeCompare(right.displayName)));
  }

  async setArbitrationMember(userId: string, active: boolean, actorId: string, updatedAt: string, power?: number): Promise<ArbitrationMember | null> {
    const profile = this.profiles.get(userId);
    if (!profile) return null;
    const existing = this.arbitrationMembers.get(userId);
    const member: ArbitrationMember = {
      userId,
      displayName: profile.displayName,
      email: profile.email,
      role: profile.role,
      status: active ? 'active' : 'inactive',
      power: power === undefined ? existing?.power ?? 1 : Math.max(1, Math.floor(power)),
      appointedBy: existing?.appointedBy ?? actorId,
      appointedAt: existing?.appointedAt ?? updatedAt,
      updatedAt,
    };
    this.arbitrationMembers.set(userId, member);
    return copy(member);
  }

  async countProfilesByRole(role: UserContext['role']): Promise<number> {
    return [...this.profiles.values()].filter((profile) => profile.role === role).length;
  }

  async updateAdminUserRole(targetId: string, role: UserContext['role'], actorId: string, createdAt: string): Promise<{ profile: AdminUser; action: AdminAction | null } | null> {
    const existing = this.profiles.get(targetId);
    if (!existing) return null;
    const member = this.arbitrationMembers.get(targetId);
    const profile: AdminUser = {
      ...existing,
      role,
      createdAt: '',
      updatedAt: createdAt,
      arbitration: member ? { status: member.status, power: member.power } : null,
    };
    this.profiles.set(targetId, profile);
    if (existing.role === role) return { profile: copy(profile), action: null };
    const action: AdminAction = {
      id: `ADM-${crypto.randomUUID()}`,
      actorId,
      targetUserId: targetId,
      action: 'role_changed',
      detail: { previousRole: existing.role, nextRole: role },
      createdAt,
    };
    this.adminActions.unshift(action);
    return { profile: copy(profile), action: copy(action) };
  }

  async listAdminActions(limit: number): Promise<AdminAction[]> {
    return copy(this.adminActions.slice(0, limit));
  }

  async getDeveloperSummary(ownerId: string): Promise<{ jobs: number; activeAgents: number; volume: number; pending: number }> {
    const agents = [...this.agents.values()].filter((agent) => agent.ownerId === ownerId);
    return {
      jobs: agents.reduce((sum, agent) => sum + agent.jobs, 0),
      activeAgents: agents.filter((agent) => agent.status === 'active').length,
      volume: agents.reduce((sum, agent) => sum + agent.volume, 0),
      pending: 0,
    };
  }

  async getDeveloperLedger(ownerId: string, limit: number, cursor: LedgerCursor | null, token: string): Promise<DeveloperLedger> {
    const ownedAgentIds = new Set([...this.agents.values()].filter((agent) => agent.ownerId === ownerId).map((agent) => agent.id));
    const allEntries = this.ledgerEntries
      .filter((entry) => ownedAgentIds.has(entry.agentId) && entry.token === token)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const totals = allEntries.reduce((sum, entry) => ({
      ...sum,
      [entry.status]: sum[entry.status] + (entry.entryType === 'refund' ? -entry.amount : entry.amount),
    }), { settled: 0, pending: 0, failed: 0 });
    const weeklyMap = new Map<string, number>();
    for (const entry of allEntries) {
      if (entry.status !== 'settled') continue;
      const key = weekStart(entry.createdAt);
      weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + (entry.entryType === 'refund' ? -entry.amount : entry.amount));
    }
    const filtered = cursor
      ? allEntries.filter((entry) => entry.createdAt < cursor.createdAt || (entry.createdAt === cursor.createdAt && entry.id < cursor.id))
      : allEntries;
    const pageEntries = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const lastEntry = pageEntries.at(-1);
    return copy({
      token,
      entries: pageEntries,
      totals,
      weekly: [...weeklyMap].sort(([left], [right]) => left.localeCompare(right)).map(([weekStartValue, amount]) => ({ weekStart: weekStartValue, amount })),
      pageInfo: {
        hasMore,
        nextCursor: hasMore && lastEntry ? { createdAt: lastEntry.createdAt, id: lastEntry.id } : null,
      },
    });
  }

  private ledgerExportView(source: LedgerExportJob & {
    ownerId: string; exportType: 'developer_ledger'; leaseOwner: string | null; leaseExpiresAt: string | null;
    snapshotCreatedAt: string; snapshotId: string;
  }): LedgerExportJob {
    const value = copy(source) as LedgerExportJob & {
      ownerId?: string; exportType?: string; leaseOwner?: string | null; leaseExpiresAt?: string | null;
      snapshotCreatedAt?: string; snapshotId?: string;
    };
    delete value.ownerId;
    delete value.exportType;
    delete value.leaseOwner;
    delete value.leaseExpiresAt;
    delete value.snapshotCreatedAt;
    delete value.snapshotId;
    return value;
  }

  private expireDeveloperLedgerExports(now: string): void {
    for (const [id, job] of this.ledgerExportJobs) {
      const expired = ['queued', 'processing'].includes(job.status) && Date.parse(now) >= Date.parse(job.expiresAt)
        || job.status === 'completed' && job.artifact !== null && Date.parse(now) >= Date.parse(job.artifact.expiresAt);
      if (!expired) continue;
      const expiresAt = job.artifact?.expiresAt ?? job.expiresAt;
      this.ledgerExportJobs.set(id, {
        ...job, status: 'expired', artifact: null, expiresAt, leaseOwner: null, leaseExpiresAt: null, updatedAt: now,
      });
      this.ledgerExportEvents.push({
        id: `${id}:expired:${job.attempt}`, jobId: id, actorType: 'system', actorId: null,
        action: 'expired', detail: { reason: 'retention' }, createdAt: now,
      });
    }
  }

  async requestDeveloperLedgerExport(ownerId: string, token: string, requestedAt: string): Promise<LedgerExportRequestResult> {
    this.expireDeveloperLedgerExports(requestedAt);
    const ownedAgentIds = new Set([...this.agents.values()].filter((agent) => agent.ownerId === ownerId).map((agent) => agent.id));
    const matchingEntries = this.ledgerEntries.filter((entry) => ownedAgentIds.has(entry.agentId) && entry.token === token)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const rowCount = matchingEntries.length;
    if (rowCount <= MAX_DIRECT_LEDGER_EXPORT_ROWS) return { mode: 'direct', rowCount };
    const existing = [...this.ledgerExportJobs.values()].find((job) => (
      job.ownerId === ownerId && job.token === token && ['queued', 'processing', 'completed'].includes(job.status)
    ));
    if (existing) return { mode: 'async', job: this.ledgerExportView(existing) };
    const id = `EXPORT-${crypto.randomUUID()}`;
    const job = {
      id, ownerId, exportType: 'developer_ledger' as const, token, status: 'queued' as const,
      totalRows: rowCount, processedRows: 0, progress: 0, attempt: 1, errorCode: null, errorMessage: null,
      startedAt: null, completedAt: null, cancelledAt: null, expiresAt: exportJobExpiresAt(requestedAt),
      createdAt: requestedAt, updatedAt: requestedAt, artifact: null, leaseOwner: null, leaseExpiresAt: null,
      snapshotCreatedAt: matchingEntries[0].createdAt, snapshotId: matchingEntries[0].id,
    };
    this.ledgerExportJobs.set(id, job);
    this.ledgerExportEvents.push({
      id: `${id}:created`, jobId: id, actorType: 'user', actorId: ownerId, action: 'created',
      detail: { token, totalRows: rowCount, attempt: 1 }, createdAt: requestedAt,
    });
    return { mode: 'async', job: this.ledgerExportView(job) };
  }

  async listDeveloperLedgerExports(ownerId: string, now: string): Promise<LedgerExportJob[]> {
    this.expireDeveloperLedgerExports(now);
    return [...this.ledgerExportJobs.values()].filter((job) => job.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .slice(0, 50).map((job) => this.ledgerExportView(job));
  }

  async getDeveloperLedgerExport(ownerId: string, id: string, now: string): Promise<LedgerExportJob | null> {
    this.expireDeveloperLedgerExports(now);
    const job = this.ledgerExportJobs.get(id);
    return job?.ownerId === ownerId ? this.ledgerExportView(job) : null;
  }

  async cancelDeveloperLedgerExport(ownerId: string, id: string, cancelledAt: string): Promise<LedgerExportMutationResult> {
    this.expireDeveloperLedgerExports(cancelledAt);
    const job = this.ledgerExportJobs.get(id);
    if (!job || job.ownerId !== ownerId) return { state: 'missing' };
    if (job.status === 'cancelled') return { state: 'unchanged', job: this.ledgerExportView(job) };
    if (!['queued', 'processing'].includes(job.status)) return { state: 'invalid_state' };
    const updated = { ...job, status: 'cancelled' as const, cancelledAt, updatedAt: cancelledAt, leaseOwner: null, leaseExpiresAt: null };
    this.ledgerExportJobs.set(id, updated);
    this.ledgerExportEvents.push({
      id: `${id}:cancelled:${job.attempt}`, jobId: id, actorType: 'user', actorId: ownerId,
      action: 'cancelled', detail: { attempt: job.attempt }, createdAt: cancelledAt,
    });
    return { state: 'applied', job: this.ledgerExportView(updated) };
  }

  async retryDeveloperLedgerExport(ownerId: string, id: string, retriedAt: string): Promise<LedgerExportMutationResult> {
    this.expireDeveloperLedgerExports(retriedAt);
    const job = this.ledgerExportJobs.get(id);
    if (!job || job.ownerId !== ownerId) return { state: 'missing' };
    const activeSibling = [...this.ledgerExportJobs.values()].some((candidate) => (
      candidate.id !== id && candidate.ownerId === ownerId && candidate.token === job.token
      && ['queued', 'processing', 'completed'].includes(candidate.status)
    ));
    if (job.status !== 'failed' || Date.parse(retriedAt) >= Date.parse(job.expiresAt) || activeSibling) {
      return { state: 'invalid_state' };
    }
    const attempt = job.attempt + 1;
    const updated = {
      ...job, status: 'queued' as const, processedRows: 0, progress: 0, attempt,
      errorCode: null, errorMessage: null, startedAt: null, completedAt: null, cancelledAt: null,
      updatedAt: retriedAt, artifact: null, leaseOwner: null, leaseExpiresAt: null,
    };
    this.ledgerExportJobs.set(id, updated);
    this.ledgerExportEvents.push({
      id: `${id}:retried:${attempt}`, jobId: id, actorType: 'user', actorId: ownerId,
      action: 'retried', detail: { attempt }, createdAt: retriedAt,
    });
    return { state: 'applied', job: this.ledgerExportView(updated) };
  }

  async claimDeveloperLedgerExport(workerId: string, claimedAt: string): Promise<LedgerExportClaim | null> {
    this.expireDeveloperLedgerExports(claimedAt);
    for (const [id, job] of this.ledgerExportJobs) {
      if (job.status !== 'processing' || !job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) > Date.parse(claimedAt)) continue;
      this.ledgerExportEvents.push({
        id: `${id}:lease_expired:${job.attempt}`, jobId: id, actorType: 'system', actorId: null,
        action: 'retried', detail: { attempt: job.attempt + 1, reason: 'lease_expired' }, createdAt: claimedAt,
      });
      this.ledgerExportJobs.set(id, {
        ...job, status: 'queued', processedRows: 0, progress: 0, attempt: job.attempt + 1,
        leaseOwner: null, leaseExpiresAt: null, errorCode: 'LEASE_EXPIRED',
        errorMessage: 'Previous export worker lease expired', updatedAt: claimedAt,
      });
    }
    const candidate = [...this.ledgerExportJobs.values()].filter((job) => job.status === 'queued')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0];
    if (!candidate) return null;
    const updated = {
      ...candidate, status: 'processing' as const, startedAt: candidate.startedAt ?? claimedAt,
      leaseOwner: workerId, leaseExpiresAt: exportLeaseExpiresAt(claimedAt), errorCode: null, errorMessage: null, updatedAt: claimedAt,
    };
    this.ledgerExportJobs.set(candidate.id, updated);
    this.ledgerExportEvents.push({
      id: `${candidate.id}:claimed:${candidate.attempt}`, jobId: candidate.id, actorType: 'service', actorId: workerId,
      action: 'claimed', detail: { attempt: candidate.attempt, workerId }, createdAt: claimedAt,
    });
    return {
      job: this.ledgerExportView(updated), ownerId: candidate.ownerId, exportType: 'developer_ledger',
      snapshot: { createdAt: candidate.snapshotCreatedAt, id: candidate.snapshotId },
    };
  }

  async updateDeveloperLedgerExportProgress(id: string, workerId: string, attempt: number, processedRows: number, updatedAt: string): Promise<LedgerExportJob | null> {
    this.expireDeveloperLedgerExports(updatedAt);
    const job = this.ledgerExportJobs.get(id);
    if (!job || job.status !== 'processing' || job.leaseOwner !== workerId || job.attempt !== attempt
      || !job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= Date.parse(updatedAt)
      || processedRows < job.processedRows || processedRows > job.totalRows) return null;
    const updated = {
      ...job, processedRows, progress: exportProgress(processedRows, job.totalRows),
      leaseExpiresAt: exportLeaseExpiresAt(updatedAt), updatedAt,
    };
    this.ledgerExportJobs.set(id, updated);
    const eventId = `${id}:progress:${job.attempt}:${processedRows}`;
    if (!this.ledgerExportEvents.some((event) => event.id === eventId)) {
      this.ledgerExportEvents.push({
        id: eventId, jobId: id, actorType: 'service', actorId: workerId,
        action: 'progressed', detail: { attempt: job.attempt, processedRows, totalRows: job.totalRows }, createdAt: updatedAt,
      });
    }
    return this.ledgerExportView(updated);
  }

  async completeDeveloperLedgerExport(input: {
    id: string; workerId: string; attempt: number; objectKey: string; sha256: string; rowCount: number; byteSize: number; completedAt: string;
  }): Promise<LedgerExportJob | null> {
    this.expireDeveloperLedgerExports(input.completedAt);
    const job = this.ledgerExportJobs.get(input.id);
    if (!job || job.status !== 'processing' || job.leaseOwner !== input.workerId || job.attempt !== input.attempt
      || !job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= Date.parse(input.completedAt) || input.rowCount !== job.totalRows
      || !input.objectKey.startsWith(`private/exports/${input.id}/`)) return null;
    const artifact: LedgerExportPrivateArtifact = {
      id: `EXPORT-ARTIFACT-${crypto.randomUUID()}`, objectKey: input.objectKey, sha256: input.sha256,
      contentType: 'text/csv', rowCount: input.rowCount, byteSize: input.byteSize,
      createdAt: input.completedAt, expiresAt: exportArtifactExpiresAt(input.completedAt),
    };
    this.ledgerExportArtifacts.set(input.id, artifact);
    const { objectKey: _objectKey, ...publicArtifact } = artifact;
    void _objectKey;
    const updated = {
      ...job, status: 'completed' as const, processedRows: job.totalRows, progress: 100,
      completedAt: input.completedAt, expiresAt: artifact.expiresAt, updatedAt: input.completedAt,
      artifact: publicArtifact, leaseOwner: null, leaseExpiresAt: null,
    };
    this.ledgerExportJobs.set(input.id, updated);
    this.ledgerExportEvents.push({
      id: `${input.id}:completed:${job.attempt}`, jobId: input.id, actorType: 'service', actorId: input.workerId,
      action: 'completed', detail: { attempt: job.attempt, rowCount: input.rowCount, byteSize: input.byteSize }, createdAt: input.completedAt,
    });
    return this.ledgerExportView(updated);
  }

  async failDeveloperLedgerExport(id: string, workerId: string, attempt: number, errorCode: string, errorMessage: string, failedAt: string): Promise<LedgerExportJob | null> {
    this.expireDeveloperLedgerExports(failedAt);
    const job = this.ledgerExportJobs.get(id);
    if (!job || job.status !== 'processing' || job.leaseOwner !== workerId || job.attempt !== attempt
      || !job.leaseExpiresAt || Date.parse(job.leaseExpiresAt) <= Date.parse(failedAt)) return null;
    const updated = {
      ...job, status: 'failed' as const, errorCode, errorMessage, updatedAt: failedAt, leaseOwner: null, leaseExpiresAt: null,
    };
    this.ledgerExportJobs.set(id, updated);
    this.ledgerExportEvents.push({
      id: `${id}:failed:${job.attempt}`, jobId: id, actorType: 'service', actorId: workerId,
      action: 'failed', detail: { attempt: job.attempt, errorCode }, createdAt: failedAt,
    });
    return this.ledgerExportView(updated);
  }

  async getDeveloperLedgerExportArtifact(ownerId: string, id: string, now: string): Promise<LedgerExportPrivateArtifact | null> {
    this.expireDeveloperLedgerExports(now);
    const job = this.ledgerExportJobs.get(id);
    const artifact = this.ledgerExportArtifacts.get(id);
    return job?.ownerId === ownerId && job.status === 'completed' && artifact && Date.parse(now) < Date.parse(artifact.expiresAt)
      ? copy(artifact) : null;
  }

  async recordRewardActivity(activity: RewardActivity): Promise<boolean> {
    if (this.rewardActivities.has(activity.sourceKey)) return false;
    this.rewardActivities.set(activity.sourceKey, copy(activity));
    return true;
  }

  async createRewardEpoch(epoch: RewardEpoch): Promise<RewardEpoch> {
    if ([...this.rewardEpochs.values()].some((item) => item.epochNumber === epoch.epochNumber)) throw new Error('DUPLICATE_REWARD_EPOCH');
    this.rewardEpochs.set(epoch.id, copy(epoch));
    return copy(epoch);
  }

  async listRewardEpochs(): Promise<RewardEpoch[]> {
    return copy([...this.rewardEpochs.values()].sort((left, right) => right.epochNumber - left.epochNumber));
  }

  async getRewardEpoch(id: string): Promise<RewardEpoch | null> {
    return copy(this.rewardEpochs.get(id) ?? null);
  }

  async listRewardAllocations(epochId: string): Promise<RewardAllocation[]> {
    return copy(this.rewardAllocations.get(epochId) ?? []);
  }

  async computeRewardEpoch(id: string, computedAt: string, _actorId: string): Promise<RewardEpochComputeResult> {
    const epoch = this.rewardEpochs.get(id);
    if (!epoch) return { state: 'missing' };
    if (epoch.status !== 'draft') return { state: 'not_draft' };
    const wallets = new Map<string, Address>();
    for (const profile of this.profiles.values()) {
      const wallet = profile.walletAddress?.toLocaleLowerCase();
      if (wallet && /^0x[a-f0-9]{40}$/.test(wallet)) wallets.set(profile.id, wallet as Address);
    }
    let computed;
    try {
      computed = allocateRewardEpoch({
        epochNumber: epoch.epochNumber,
        chainId: epoch.chainId,
        distributorAddress: epoch.distributorAddress as Address,
        totalRewardUnits: BigInt(epoch.totalRewardUnits),
        accountScoreCap: epoch.accountScoreCap,
        activities: [...this.rewardActivities.values()].filter((activity) => (
          activity.eligible
          && activity.formulaVersion === epoch.formulaVersion
          && Date.parse(activity.occurredAt) >= Date.parse(epoch.startsAt)
          && Date.parse(activity.occurredAt) < Date.parse(epoch.endsAt)
        )),
        wallets,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_ELIGIBLE_REWARD_ACCOUNTS') return { state: 'no_eligible_accounts' };
      throw error;
    }
    const allocations: RewardAllocation[] = computed.allocations.map((allocation) => ({
      id: `YDALLOC-${epoch.id}-${allocation.userId}`,
      epochId: epoch.id,
      userId: allocation.userId,
      walletAddress: allocation.walletAddress,
      effectiveScore: allocation.effectiveScore,
      amountUnits: allocation.amountUnits,
      leafHash: allocation.leafHash,
      proof: allocation.proof,
      status: 'unclaimed',
      claimTxHash: null,
      claimedAt: null,
      createdAt: computedAt,
    }));
    const updated = { ...epoch, status: 'computed' as const, merkleRoot: computed.merkleRoot, manifestHash: computed.manifestHash, computedAt, updatedAt: computedAt };
    this.rewardEpochs.set(id, updated);
    this.rewardAllocations.set(id, allocations);
    return { state: 'computed', epoch: copy(updated), allocations: copy(allocations) };
  }

  async markRewardEpochPublished(id: string, txHash: string, publishedAt: string, _actorId: string): Promise<RewardEpoch | null> {
    const epoch = this.rewardEpochs.get(id);
    if (!epoch) return null;
    if (epoch.status === 'computed') {
      this.rewardEpochs.set(id, { ...epoch, status: 'published', publishTxHash: txHash, publishedAt, updatedAt: publishedAt });
    }
    return copy(this.rewardEpochs.get(id)!);
  }

  async markRewardEpochExpired(id: string, _txHash: string, expiredAt: string, _actorId: string): Promise<RewardEpoch | null> {
    const epoch = this.rewardEpochs.get(id);
    if (!epoch) return null;
    if (epoch.status === 'published' && Date.parse(expiredAt) > Date.parse(epoch.claimEndsAt)) {
      this.rewardEpochs.set(id, { ...epoch, status: 'expired', updatedAt: expiredAt });
      this.rewardAllocations.set(id, (this.rewardAllocations.get(id) ?? []).map((allocation) => (
        allocation.status === 'unclaimed' ? { ...allocation, status: 'expired' } : allocation
      )));
    }
    return copy(this.rewardEpochs.get(id)!);
  }

  async getYdFinanceOverview(userId: string, now = new Date().toISOString()): Promise<YdFinanceOverview> {
    return copy({
      epochs: await this.listRewardEpochs(),
      allocations: [...this.rewardAllocations.values()].flat().filter((allocation) => allocation.userId === userId),
      activities: [...this.rewardActivities.values()].filter((activity) => activity.userId === userId)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 100),
      staking: this.stakingPositions.get(userId) ?? null,
      governance: await this.listEcosystemGovernance(userId, now),
    });
  }

  async recordRewardClaim(claim: RewardClaim): Promise<{ claim: RewardClaim; applied: boolean } | null> {
    const allocations = this.rewardAllocations.get(claim.epochId) ?? [];
    const index = allocations.findIndex((allocation) => allocation.userId === claim.userId
      && allocation.walletAddress.toLocaleLowerCase() === claim.walletAddress.toLocaleLowerCase()
      && allocation.amountUnits === claim.amountUnits);
    if (index < 0) return null;
    const key = `${claim.epochId}:${claim.userId}`;
    if (this.rewardClaims.has(key)) return { claim: copy(this.rewardClaims.get(key)!), applied: false };
    this.rewardClaims.set(key, copy(claim));
    const next = [...allocations];
    next[index] = { ...next[index], status: 'claimed', claimTxHash: claim.txHash, claimedAt: claim.claimedAt };
    this.rewardAllocations.set(claim.epochId, next);
    return { claim: copy(claim), applied: true };
  }

  async syncYdStakingPosition(position: YdStakingPosition): Promise<YdStakingPosition> {
    const existing = this.stakingPositions.get(position.userId);
    const incomingBlock = BigInt(position.lastBlockNumber ?? '0');
    const existingBlock = BigInt(existing?.lastBlockNumber ?? '0');
    const newer = !existing || incomingBlock > existingBlock
      || (incomingBlock === existingBlock && (position.lastLogIndex ?? -1) >= (existing.lastLogIndex ?? -1));
    if (newer) this.stakingPositions.set(position.userId, copy({ ...position, walletAddress: position.walletAddress.toLocaleLowerCase() }));
    return copy(this.stakingPositions.get(position.userId) ?? position);
  }

  async listGovernanceCandidates(): Promise<Array<{ userId: string; walletAddress: string }>> {
    return copy([...this.profiles.values()]
      .filter((profile) => profile.walletAddress && /^0x[a-fA-F0-9]{40}$/.test(profile.walletAddress))
      .map((profile) => ({ userId: profile.id, walletAddress: profile.walletAddress!.toLocaleLowerCase() }))
      .sort((left, right) => left.userId.localeCompare(right.userId)));
  }

  async createEcosystemProposal(proposal: EcosystemProposal, electorate: GovernancePowerSnapshot[]): Promise<EcosystemGovernanceDetail> {
    this.ecosystemProposals.set(proposal.id, copy(proposal));
    this.ecosystemSnapshots.set(proposal.id, copy(electorate));
    this.ecosystemVotes.set(proposal.id, []);
    return this.ecosystemDetail(proposal.id, proposal.proposerId, proposal.createdAt)!;
  }

  private ecosystemDetail(id: string, userId: string, now: string): EcosystemGovernanceDetail | null {
    const proposal = this.ecosystemProposals.get(id);
    if (!proposal) return null;
    const electorate = this.ecosystemSnapshots.get(id) ?? [];
    const votes = this.ecosystemVotes.get(id) ?? [];
    const snapshot = electorate.find((item) => item.userId === userId);
    const vote = votes.find((item) => item.voterId === userId);
    return copy({
      proposal,
      electorate,
      votes,
      currentUser: {
        eligible: Boolean(snapshot),
        canVote: Boolean(snapshot) && !vote && proposal.status === 'active'
          && Date.parse(now) >= Date.parse(proposal.startsAt) && Date.parse(now) <= Date.parse(proposal.endsAt),
        hasVoted: Boolean(vote),
        power: snapshot?.power ?? '0',
        choice: vote?.choice ?? null,
      },
    });
  }

  async listEcosystemGovernance(userId: string, now = new Date().toISOString()): Promise<EcosystemGovernanceDetail[]> {
    return [...this.ecosystemProposals.values()]
      .sort((left, right) => right.proposalNumber - left.proposalNumber)
      .map((proposal) => this.ecosystemDetail(proposal.id, userId, now)!)
      .filter(Boolean);
  }

  async castEcosystemVote(
    id: string,
    voterId: string,
    choice: EcosystemVoteChoice,
    reason: string,
    votedAt: string,
  ): Promise<EcosystemVoteResult> {
    const governance = this.ecosystemDetail(id, voterId, votedAt);
    if (!governance) return { state: 'missing' };
    if (!governance.currentUser.eligible) return { state: 'not_eligible' };
    if (governance.currentUser.hasVoted) return { state: 'already_voted' };
    if (governance.proposal.status !== 'active') return { state: 'closed' };
    if (!governance.currentUser.canVote) return { state: 'expired' };
    const snapshot = governance.electorate.find((item) => item.userId === voterId)!;
    const vote: EcosystemVote = {
      id: `YDVOTE-${crypto.randomUUID()}`,
      proposalId: id,
      voterId,
      walletAddress: snapshot.walletAddress,
      choice,
      power: snapshot.power,
      reason,
      createdAt: votedAt,
    };
    this.ecosystemVotes.set(id, [...governance.votes, vote]);
    const field = choice === 'for' ? 'forPower' : choice === 'against' ? 'againstPower' : 'abstainPower';
    this.ecosystemProposals.set(id, { ...governance.proposal, [field]: (BigInt(governance.proposal[field]) + BigInt(vote.power)).toString() });
    return { state: 'applied', governance: this.ecosystemDetail(id, voterId, votedAt)! };
  }

  async finalizeEcosystemProposal(id: string, actorId: string, finalizedAt: string): Promise<EcosystemFinalizeResult> {
    const governance = this.ecosystemDetail(id, actorId, finalizedAt);
    if (!governance) return { state: 'missing' };
    if (governance.proposal.status !== 'active') return { state: 'finalized', governance };
    const evaluation = evaluateEcosystemProposal(governance.proposal, finalizedAt, governance.votes.length, governance.electorate.length);
    if (!evaluation.finalizable) return { state: 'not_ready', governance };
    this.ecosystemProposals.set(id, { ...governance.proposal, status: evaluation.status, finalizedAt, finalizedBy: actorId });
    return { state: 'finalized', governance: this.ecosystemDetail(id, actorId, finalizedAt)! };
  }

  async claimIdempotent(userId: string, key: string, method: string, path: string, requestHash: string): Promise<IdempotencyClaim> {
    const storageKey = `${userId}:${key}`;
    const existing = this.idempotency.get(storageKey);
    if (!existing) {
      this.idempotency.set(storageKey, { method, path, requestHash, result: null });
      return { state: 'acquired' };
    }
    if (existing.method !== method || existing.path !== path || existing.requestHash !== requestHash) return { state: 'conflict' };
    return existing.result ? { state: 'completed', result: copy(existing.result) } : { state: 'pending' };
  }

  async completeIdempotent(userId: string, key: string, result: IdempotentResult): Promise<void> {
    const storageKey = `${userId}:${key}`;
    const existing = this.idempotency.get(storageKey);
    if (existing) this.idempotency.set(storageKey, { ...existing, result: copy(result) });
  }

  async abandonIdempotent(userId: string, key: string): Promise<void> {
    const storageKey = `${userId}:${key}`;
    if (this.idempotency.get(storageKey)?.result === null) this.idempotency.delete(storageKey);
  }
}
