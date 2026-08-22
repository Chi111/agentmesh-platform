import type {
  Agent,
  AgentCallbackUpdate,
  AgentDispatch,
  AgentStatus,
  AdminAction,
  AdminUser,
  AuthIdentityInput,
  Deliverable,
  DeveloperLedger,
  Dispute,
  DisputeAction,
  Escrow,
  ExecutionEvent,
  IdempotencyClaim,
  IdempotentResult,
  LedgerCursor,
  LedgerEntry,
  Mission,
  Notification,
  PlatformStore,
  StageOffer,
  UserContext,
  UserPreferences,
  WalletAccount,
  WalletTransaction,
  WorkflowStage,
} from './contracts';
import { paymentConfig, TEST_TOPUP_AMOUNT } from './payments';

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
  readonly stageOffers = new Map<string, StageOffer[]>();
  readonly agentPerformance = new Map<string, { agentId: string; outcome: 'done' | 'failed' }>();
  readonly events = new Map<string, ExecutionEvent[]>();
  readonly deliverables = new Map<string, Deliverable[]>();
  readonly escrows = new Map<string, Escrow>();
  readonly disputes = new Map<string, Dispute[]>();
  readonly disputeActions = new Map<string, DisputeAction[]>();
  readonly notifications = new Map<string, Notification[]>();
  readonly preferences = new Map<string, UserPreferences>();
  readonly adminActions: AdminAction[] = [];
  readonly ledgerEntries: LedgerEntry[] = [];
  readonly walletBalances = new Map<string, number>();
  readonly walletTransactions = new Map<string, WalletTransaction[]>();
  readonly testTopupClaims = new Map<string, string>();
  readonly idempotency = new Map<string, { method: string; path: string; requestHash: string; result: IdempotentResult | null }>();
  readonly identities = new Map<string, string>();
  readonly rateLimits = new Map<string, { windowStart: number; count: number }>();
  readonly agentDispatches = new Map<string, AgentDispatch & { completedAt: string | null; callbackIds: Set<string> }>();

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
        displayName: existing.displayName === 'AgentMesh User' ? identity.displayName : existing.displayName,
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

  async listMissions(user: UserContext): Promise<Mission[]> {
    const missions = [...this.missions.values()];
    if (user.role === 'admin') return copy(missions);
    if (user.role === 'requester') return copy(missions.filter((mission) => mission.requesterId === user.id));
    const owned = new Set([...this.agents.values()].filter((agent) => agent.ownerId === user.id).map((agent) => agent.id));
    return copy(missions.filter((mission) => (this.stages.get(mission.id) ?? []).some((stage) => stage.agentId && owned.has(stage.agentId))));
  }

  async getMission(id: string): Promise<Mission | null> {
    return copy(this.missions.get(id) ?? null);
  }

  async createMission(mission: Mission, stages: WorkflowStage[]): Promise<Mission> {
    this.missions.set(mission.id, copy(mission));
    this.stages.set(mission.id, copy(stages));
    const now = mission.createdAt;
    const payment = paymentConfig(mission.paymentMethod);
    this.escrows.set(mission.id, {
      id: `ESC-${mission.id}`, missionId: mission.id, amount: mission.budget, token: payment.token, network: payment.network,
      paymentMethod: mission.paymentMethod,
      yieldEnabled: mission.yieldEnabled, platformFeeRate: 0.004, status: 'pending', depositTxHash: null,
      releaseTxHash: null, payoutHash: null, freezeTxHash: null, resolutionTxHash: null,
      releasedAt: null, createdAt: now, updatedAt: now,
    });
    return copy(mission);
  }

  async saveCompilation(id: string, spec: Record<string, unknown>, stages: WorkflowStage[]): Promise<Mission | null> {
    const mission = this.missions.get(id);
    if (!mission) return null;
    if (!['draft', 'matching'].includes(mission.status) || this.escrows.get(id)?.status !== 'pending') return copy(mission);
    const updated: Mission = { ...mission, compiledSpec: copy(spec), status: 'matching', currentStage: 'AI 已生成执行工作流' };
    this.missions.set(id, updated);
    this.stages.set(id, copy(stages));
    this.stageOffers.delete(id);
    return copy(updated);
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

  async startMission(id: string, requesterId: string, depositTxHash: string | null, payoutHash: string | null = null, startedAt = new Date().toISOString()) {
    const mission = this.missions.get(id);
    if (!mission) return null;
    const currentEscrow = this.escrows.get(id);
    const stages = this.stages.get(id) ?? [];
    const offers = this.stageOffers.get(id) ?? [];
    const accepted = stages.length > 0 && stages.every((stage) => stage.agentId && offers.some((offer) => (
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
    });
    return { mission: copy(updated), applied: true };
  }

  async submitMissionForReview(id: string, reviewDueAt: string): Promise<Mission | null> {
    const mission = this.missions.get(id);
    if (!mission) return null;
    if (mission.status !== 'running') return copy(mission);
    const updated: Mission = { ...mission, status: 'review', progress: 100, currentStage: '等待验收', reviewDueAt };
    this.missions.set(id, updated);
    return copy(updated);
  }

  async acceptMission(id: string, actorId: string, releaseTxHash: string | null) {
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
    const stages = this.stages.get(id) ?? [];
    const stageTotal = stages.reduce((sum, stage) => sum + stage.budget, 0) || escrow.amount;
    const payouts = new Map<string, number>();
    for (const stage of stages) {
      if (!stage.agentId) continue;
      const gross = escrow.amount * (stage.budget / stageTotal);
      payouts.set(stage.agentId, (payouts.get(stage.agentId) ?? 0) + gross);
    }
    const walletPayouts = new Map<string, number>();
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
    }
    for (const [ownerId, amount] of walletPayouts) {
      const ownerTransactions = this.walletTransactions.get(ownerId) ?? [];
      if (ownerTransactions.some((transaction) => transaction.type === 'agent_payout' && transaction.missionId === id)) continue;
      this.walletBalances.set(ownerId, Number(((this.walletBalances.get(ownerId) ?? 0) + amount).toFixed(6)));
      this.walletTransactions.set(ownerId, [{
        id: crypto.randomUUID(), type: 'agent_payout', amount, token: 'CREDIT', missionId: id, createdAt: now,
      }, ...ownerTransactions]);
    }
    return { mission: copy(updated), applied: true };
  }

  async listStages(missionId: string): Promise<WorkflowStage[]> {
    return copy(this.stages.get(missionId) ?? []);
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
      return copy(updated);
    }
    return null;
  }

  async claimStageForDispatch(missionId: string, stageId: string): Promise<WorkflowStage | null> {
    const stages = this.stages.get(missionId) ?? [];
    const mission = this.missions.get(missionId);
    const escrow = this.escrows.get(missionId);
    if (mission?.status !== 'running' || escrow?.status !== 'held') return null;
    const index = stages.findIndex((stage) => stage.id === stageId && stage.status === 'queued');
    if (index < 0) return null;
    const updated = { ...stages[index], status: 'running' as const };
    const next = [...stages];
    next[index] = updated;
    this.stages.set(missionId, next);
    return copy(updated);
  }

  async resetStageDispatch(missionId: string, stageId: string): Promise<void> {
    const stages = this.stages.get(missionId) ?? [];
    this.stages.set(missionId, stages.map((stage) => stage.id === stageId && stage.status === 'running' ? { ...stage, status: 'queued' } : stage));
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
      ...(output === undefined ? {} : { output: copy(output) }),
    };
    const next = [...stages];
    next[index] = updated;
    this.stages.set(missionId, next);
    if (updated.agentId && (status === 'done' || status === 'failed')) this.recordAgentPerformance(stageId, updated.agentId, status);
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
    this.deliverables.set(deliverable.missionId, [...(this.deliverables.get(deliverable.missionId) ?? []), copy(deliverable)]);
    return copy(deliverable);
  }

  async listDeliverables(missionId: string): Promise<Deliverable[]> {
    return copy(this.deliverables.get(missionId) ?? []);
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

  async listDisputes(user: UserContext): Promise<Dispute[]> {
    const all = [...this.disputes.values()].flat();
    if (user.role === 'admin') return copy(all);
    return copy(all.filter((dispute) => this.missions.get(dispute.missionId)?.requesterId === user.id || dispute.openedBy === user.id));
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

  async startDisputeReview(id: string, actorId: string): Promise<Dispute | null> {
    for (const [missionId, disputes] of this.disputes) {
      const index = disputes.findIndex((dispute) => dispute.id === id);
      if (index < 0) continue;
      const existing = disputes[index];
      if (existing.status !== 'open') return copy(existing);
      const createdAt = new Date().toISOString();
      const updated = { ...existing, status: 'reviewing' as const };
      const next = [...disputes];
      next[index] = updated;
      this.disputes.set(missionId, next);
      this.disputeActions.set(id, [...(this.disputeActions.get(id) ?? []), {
        id: `${id}:review_started`, disputeId: id, actorId, action: 'review_started', note: null, createdAt,
      }]);
      return copy(updated);
    }
    return null;
  }

  async resolveDispute(id: string, resolution: string, status: 'resolved' | 'rejected', actorId: string, resolutionTxHash: string | null) {
    for (const [missionId, disputes] of this.disputes) {
      const index = disputes.findIndex((dispute) => dispute.id === id);
      if (index < 0) continue;
      if (disputes[index].status !== 'reviewing') return { dispute: copy(disputes[index]), applied: false };
      const resolvedAt = new Date().toISOString();
      const updated = { ...disputes[index], status, resolution, resolutionTxHash, resolvedAt };
      const next = [...disputes];
      next[index] = updated;
      this.disputes.set(missionId, next);
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
      }]);
      return { dispute: copy(updated), applied: true };
    }
    return null;
  }

  async listDisputeActions(disputeId: string): Promise<DisputeAction[]> {
    return copy(this.disputeActions.get(disputeId) ?? []);
  }

  async createAgentDispatch(dispatch: AgentDispatch): Promise<void> {
    this.agentDispatches.set(dispatch.runId, { ...copy(dispatch), completedAt: null, callbackIds: new Set() });
  }

  async applyAgentCallback(update: AgentCallbackUpdate) {
    const dispatch = this.agentDispatches.get(update.runId);
    if (!dispatch
      || dispatch.missionId !== update.missionId
      || dispatch.stageId !== update.stageId
      || dispatch.agentId !== update.agentId
      || dispatch.expiresAt !== update.expiresAt) return { state: 'missing' as const };
    if (dispatch.callbackIds.has(update.callbackId)) return { state: 'duplicate' as const };
    if (dispatch.completedAt || Date.parse(dispatch.expiresAt) <= Date.parse(update.now)) return { state: 'expired' as const };

    const mission = this.missions.get(update.missionId);
    const escrow = this.escrows.get(update.missionId);
    const stages = this.stages.get(update.missionId) ?? [];
    const index = stages.findIndex((stage) => stage.id === update.stageId && stage.agentId === update.agentId);
    if (mission?.status !== 'running' || escrow?.status !== 'held' || index < 0 || stages[index].status !== 'running') {
      return { state: 'invalid' as const };
    }

    const stage: WorkflowStage = {
      ...stages[index],
      status: update.status,
      ...(update.output === undefined ? {} : { output: copy(update.output) }),
      updatedAt: update.now,
    };
    const nextStages = [...stages];
    nextStages[index] = stage;
    this.stages.set(update.missionId, nextStages);
    if (update.status === 'done' || update.status === 'failed') this.recordAgentPerformance(update.stageId, update.agentId, update.status);
    this.events.set(update.missionId, [...(this.events.get(update.missionId) ?? []), copy(update.event)]);
    this.missions.set(update.missionId, {
      ...mission,
      progress: update.progress === undefined ? mission.progress : Math.max(mission.progress, update.progress),
      currentStage: update.currentStage,
      updatedAt: update.now,
    });
    dispatch.callbackIds.add(update.callbackId);
    if (update.status === 'done' || update.status === 'failed') dispatch.completedAt = update.now;
    return { state: 'applied' as const, stage: copy(stage) };
  }

  async claimAgentCallback(runId: string, callbackId: string, now: string): Promise<'accepted' | 'duplicate' | 'expired' | 'missing'> {
    const dispatch = this.agentDispatches.get(runId);
    if (!dispatch) return 'missing';
    if (dispatch.completedAt || Date.parse(dispatch.expiresAt) <= Date.parse(now)) return 'expired';
    if (dispatch.callbackIds.has(callbackId)) return 'duplicate';
    dispatch.callbackIds.add(callbackId);
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
      .map((profile) => ({ ...profile, createdAt: '', updatedAt: '' }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .slice(0, limit));
  }

  async countProfilesByRole(role: UserContext['role']): Promise<number> {
    return [...this.profiles.values()].filter((profile) => profile.role === role).length;
  }

  async updateAdminUserRole(targetId: string, role: UserContext['role'], actorId: string, createdAt: string): Promise<{ profile: AdminUser; action: AdminAction | null } | null> {
    const existing = this.profiles.get(targetId);
    if (!existing) return null;
    const profile: AdminUser = { ...existing, role, createdAt: '', updatedAt: createdAt };
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
