import type {
  Agent,
  AgentCallbackUpdate,
  AgentDispatch,
  AgentStatus,
  AdminAction,
  AdminUser,
  ArbitrationElector,
  ArbitrationMember,
  ArbitrationProposal,
  AuthIdentityInput,
  DeveloperLedger,
  Deliverable,
  Dispute,
  DisputeAction,
  DisputeFinalizeResult,
  DisputeGovernance,
  DisputeVote,
  DisputeVoteChoice,
  DisputeVoteMutationResult,
  DispatchOutboxItem,
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
  WorkflowDraftSaveResult,
  WorkflowEdge,
  WorkflowViewport,
} from './contracts';
import { arbitrationQuorum, arbitrationVotingEndsAt, evaluateArbitrationProposal } from './arbitration';
import { paymentConfig, TEST_TOPUP_AMOUNT } from './payments';

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<Array<{ meta?: { changes?: number } }>>;
}

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function boolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function mapProfile(row: Row): UserContext {
  return {
    id: text(row.id),
    email: text(row.email) || undefined,
    displayName: text(row.display_name) || 'AgentMesh User',
    role: text(row.role) as UserContext['role'],
    walletAddress: text(row.wallet_address) || undefined,
  };
}

function mapAdminUser(row: Row): AdminUser {
  return {
    ...mapProfile(row),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    arbitration: text(row.arbitration_status) ? {
      status: text(row.arbitration_status) as ArbitrationMember['status'],
      power: Math.max(1, number(row.arbitration_power)),
    } : null,
  };
}

function mapArbitrationMember(row: Row): ArbitrationMember {
  return {
    userId: text(row.user_id),
    displayName: text(row.display_name) || 'AgentMesh User',
    email: text(row.email) || undefined,
    role: text(row.role) as ArbitrationMember['role'],
    status: text(row.status) as ArbitrationMember['status'],
    power: Math.max(1, number(row.power)),
    appointedBy: text(row.appointed_by),
    appointedAt: text(row.appointed_at),
    updatedAt: text(row.updated_at),
  };
}

function mapArbitrationProposal(row: Row): ArbitrationProposal {
  return {
    id: text(row.id),
    disputeId: text(row.dispute_id),
    proposerId: text(row.proposer_id),
    status: text(row.status) as ArbitrationProposal['status'],
    weightMode: text(row.weight_mode) as ArbitrationProposal['weightMode'],
    votingStartsAt: text(row.voting_starts_at),
    votingEndsAt: text(row.voting_ends_at),
    quorumRequired: number(row.quorum_required),
    eligibleWeight: number(row.eligible_weight),
    supportVotes: number(row.support_votes),
    opposeVotes: number(row.oppose_votes),
    abstainVotes: number(row.abstain_votes),
    outcome: (text(row.outcome) || null) as ArbitrationProposal['outcome'],
    finalizedAt: text(row.finalized_at) || null,
    finalizedBy: text(row.finalized_by) || null,
    executedAt: text(row.executed_at) || null,
    executedBy: text(row.executed_by) || null,
    createdAt: text(row.created_at),
  };
}

function mapArbitrationElector(row: Row): ArbitrationElector {
  return {
    userId: text(row.user_id),
    displayName: text(row.display_name) || 'AgentMesh User',
    powerSnapshot: number(row.power_snapshot),
    voteWeight: number(row.vote_weight),
  };
}

function mapDisputeVote(row: Row): DisputeVote {
  return {
    id: text(row.id),
    proposalId: text(row.proposal_id),
    voterId: text(row.voter_id),
    voterDisplayName: text(row.display_name) || 'AgentMesh User',
    choice: text(row.choice) as DisputeVote['choice'],
    reason: text(row.reason),
    voteWeight: number(row.vote_weight),
    createdAt: text(row.created_at),
  };
}

function mapAdminAction(row: Row): AdminAction {
  return {
    id: text(row.id),
    actorId: text(row.actor_id),
    targetUserId: text(row.target_user_id),
    action: 'role_changed',
    detail: parseJson<AdminAction['detail']>(row.detail_json, {
      previousRole: 'requester',
      nextRole: 'requester',
    }),
    createdAt: text(row.created_at),
  };
}

function mapAgent(row: Row): Agent {
  return {
    id: text(row.id),
    ownerId: text(row.owner_id),
    name: text(row.name),
    category: text(row.category),
    summary: text(row.summary),
    tags: parseJson<string[]>(row.tags_json, []),
    endpoint: text(row.endpoint_url),
    authType: (text(row.auth_type) || 'none') as Agent['authType'],
    inputSchema: parseJson<Record<string, unknown>>(row.input_schema_json, {}),
    outputSchema: parseJson<Record<string, unknown>>(row.output_schema_json, {}),
    price: number(row.price_usdc),
    wallet: text(row.wallet_address),
    status: text(row.status) as Agent['status'],
    version: text(row.version),
    trustScore: number(row.trust_score),
    successRate: number(row.success_rate),
    responseTime: number(row.response_time_ms) > 0 ? `${(number(row.response_time_ms) / 1000).toFixed(1)}s` : '待测试',
    jobs: number(row.jobs_count),
    volume: number(row.volume_usdc),
    author: text(row.author_name),
    official: boolean(row.official),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapMission(row: Row): Mission {
  return {
    id: text(row.id),
    requesterId: text(row.requester_id),
    title: text(row.title),
    description: text(row.description),
    category: text(row.category),
    tags: parseJson<string[]>(row.tags_json, []),
    budget: number(row.budget_usdc),
    paymentMethod: (text(row.payment_method) || 'web2_balance') as Mission['paymentMethod'],
    deadline: text(row.deadline),
    reviewDueAt: text(row.review_due_at) || null,
    priority: text(row.priority) as Mission['priority'],
    expertise: text(row.expertise) as Mission['expertise'],
    yieldEnabled: boolean(row.yield_enabled),
    status: (text(row.cancelled_at) ? 'cancelled' : text(row.status)) as Mission['status'],
    progress: number(row.progress),
    currentStage: text(row.current_stage),
    team: parseJson<string[]>(row.team_json, []),
    compiledSpec: parseJson<Record<string, unknown> | null>(row.compiled_spec_json, null),
    workflowVersion: Math.max(1, number(row.workflow_version) || 1),
    workflowViewport: parseJson<WorkflowViewport>(row.workflow_viewport_json, { x: 0, y: 0, zoom: 1 }),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapStage(row: Row): WorkflowStage {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    position: number(row.position),
    nodeType: (text(row.node_type) || 'task') as WorkflowStage['nodeType'],
    positionX: number(row.position_x),
    positionY: number(row.position_y),
    progress: number(row.progress),
    name: text(row.name),
    purpose: text(row.purpose),
    category: text(row.category),
    budget: number(row.budget_usdc),
    status: text(row.status) as WorkflowStage['status'],
    agentId: text(row.agent_id) || null,
    input: parseJson<Record<string, unknown>>(row.input_json, {}),
    output: parseJson<Record<string, unknown> | null>(row.output_json, null),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapEdge(row: Row): WorkflowEdge {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    sourceStageId: text(row.source_stage_id),
    targetStageId: text(row.target_stage_id),
    createdAt: text(row.created_at),
  };
}

function mapDispatchOutbox(row: Row): DispatchOutboxItem {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    stageId: text(row.stage_id),
    runId: text(row.run_id),
    expiresAt: text(row.expires_at),
    status: text(row.status) as DispatchOutboxItem['status'],
    attempts: number(row.attempts),
    nextAttemptAt: text(row.next_attempt_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapStageOffer(row: Row, now = new Date().toISOString()): StageOffer {
  const storedStatus = text(row.status) as Exclude<StageOffer['status'], 'expired'>;
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    stageId: text(row.stage_id),
    agentId: text(row.agent_id),
    status: storedStatus === 'pending' && Date.parse(text(row.expires_at)) <= Date.parse(now) ? 'expired' : storedStatus,
    expiresAt: text(row.expires_at),
    respondedAt: text(row.responded_at) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapEvent(row: Row): ExecutionEvent {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    stageId: text(row.stage_id) || null,
    type: text(row.event_type),
    message: text(row.message),
    actorType: text(row.actor_type) as ExecutionEvent['actorType'],
    actorId: text(row.actor_id) || null,
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    createdAt: text(row.created_at),
  };
}

function mapDeliverable(row: Row): Deliverable {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    stageId: text(row.stage_id) || null,
    agentId: text(row.agent_id) || null,
    name: text(row.name),
    uri: text(row.uri),
    contentHash: text(row.content_hash),
    mimeType: text(row.mime_type),
    status: text(row.status) as Deliverable['status'],
    createdAt: text(row.created_at),
  };
}

function mapEscrow(row: Row): Escrow {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    amount: number(row.amount),
    token: text(row.token),
    network: text(row.network),
    paymentMethod: (text(row.payment_method) || 'web2_balance') as Escrow['paymentMethod'],
    yieldEnabled: boolean(row.yield_enabled),
    platformFeeRate: number(row.platform_fee_rate),
    status: text(row.status) as Escrow['status'],
    depositTxHash: text(row.deposit_tx_hash) || null,
    releaseTxHash: text(row.release_tx_hash) || null,
    payoutHash: text(row.payout_hash) || null,
    requesterWalletAddress: text(row.requester_wallet_address) || null,
    freezeTxHash: text(row.freeze_tx_hash) || null,
    resolutionTxHash: text(row.resolution_tx_hash) || null,
    releasedAt: text(row.released_at) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapWalletTransaction(row: Row): WalletTransaction {
  return {
    id: text(row.id),
    type: text(row.transaction_type) as WalletTransaction['type'],
    amount: number(row.amount),
    token: 'CREDIT',
    missionId: text(row.mission_id) || null,
    createdAt: text(row.created_at),
  };
}

function mapDispute(row: Row): Dispute {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    openedBy: text(row.opened_by),
    reason: text(row.reason),
    evidence: parseJson<Array<{ label: string; uri: string }>>(row.evidence_json, []),
    status: text(row.status) as Dispute['status'],
    resolution: text(row.resolution) || null,
    freezeTxHash: text(row.freeze_tx_hash) || null,
    resolutionTxHash: text(row.resolution_tx_hash) || null,
    createdAt: text(row.created_at),
    resolvedAt: text(row.resolved_at) || null,
  };
}

function mapNotification(row: Row): Notification {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    title: text(row.title),
    detail: text(row.detail),
    tone: text(row.tone) as Notification['tone'],
    read: boolean(row.is_read),
    createdAt: text(row.created_at),
  };
}

function mapDisputeAction(row: Row): DisputeAction {
  return {
    id: text(row.id),
    disputeId: text(row.dispute_id),
    actorId: text(row.actor_id),
    action: text(row.action) as DisputeAction['action'],
    note: text(row.note) || null,
    createdAt: text(row.created_at),
  };
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

function mapPreferences(row: Row | null): UserPreferences {
  if (!row) return defaultPreferences();
  return {
    taskUpdates: boolean(row.task_updates),
    settlementUpdates: boolean(row.settlement_updates),
    productUpdates: boolean(row.product_updates),
    emailChannel: boolean(row.email_channel),
    locale: text(row.locale) === 'en-US' ? 'en-US' : 'zh-CN',
    timeZone: text(row.time_zone) || 'Asia/Shanghai',
    updatedAt: text(row.updated_at),
  };
}

function mapLedgerEntry(row: Row): LedgerEntry {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    missionTitle: text(row.mission_title),
    agentId: text(row.agent_id),
    agentName: text(row.agent_name),
    entryType: text(row.entry_type) as LedgerEntry['entryType'],
    amount: number(row.amount),
    token: text(row.token),
    status: text(row.status) as LedgerEntry['status'],
    txHash: text(row.tx_hash) || null,
    createdAt: text(row.created_at),
  };
}

function stageInsert(db: D1Database, stage: WorkflowStage): D1Statement {
  return db.prepare(`
    INSERT INTO workflow_stages
      (id, mission_id, position, node_type, position_x, position_y, progress, name, purpose, category, budget_usdc, status, agent_id, input_json, output_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    stage.id,
    stage.missionId,
    stage.position,
    stage.nodeType,
    stage.positionX,
    stage.positionY,
    stage.progress,
    stage.name,
    stage.purpose,
    stage.category,
    stage.budget,
    stage.status,
    stage.agentId,
    JSON.stringify(stage.input),
    stage.output ? JSON.stringify(stage.output) : null,
    stage.createdAt,
    stage.updatedAt,
  );
}

function edgeInsert(db: D1Database, edge: WorkflowEdge): D1Statement {
  return db.prepare(`
    INSERT INTO workflow_edges (id, mission_id, source_stage_id, target_stage_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(edge.id, edge.missionId, edge.sourceStageId, edge.targetStageId, edge.createdAt);
}

function guardedStageInsert(db: D1Database, stage: WorkflowStage, saveToken: string): D1Statement {
  return db.prepare(`
    INSERT INTO workflow_stages
      (id, mission_id, position, node_type, position_x, position_y, progress, name, purpose, category, budget_usdc, status, agent_id, input_json, output_json, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
  `).bind(
    stage.id,
    stage.missionId,
    stage.position,
    stage.nodeType,
    stage.positionX,
    stage.positionY,
    stage.progress,
    stage.name,
    stage.purpose,
    stage.category,
    stage.budget,
    stage.status,
    stage.agentId,
    JSON.stringify(stage.input),
    stage.output ? JSON.stringify(stage.output) : null,
    stage.createdAt,
    stage.updatedAt,
    stage.missionId,
    saveToken,
  );
}

function guardedEdgeInsert(db: D1Database, edge: WorkflowEdge, saveToken: string): D1Statement {
  return db.prepare(`
    INSERT INTO workflow_edges (id, mission_id, source_stage_id, target_stage_id, created_at)
    SELECT ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
  `).bind(
    edge.id,
    edge.missionId,
    edge.sourceStageId,
    edge.targetStageId,
    edge.createdAt,
    edge.missionId,
    saveToken,
  );
}

function stageOfferInsert(db: D1Database, offer: StageOffer): D1Statement {
  return db.prepare(`
    INSERT INTO stage_offers
      (id, mission_id, stage_id, agent_id, status, expires_at, responded_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    offer.id,
    offer.missionId,
    offer.stageId,
    offer.agentId,
    offer.status,
    offer.expiresAt,
    offer.respondedAt,
    offer.createdAt,
    offer.updatedAt,
  );
}

function refreshAgentPerformance(
  db: D1Database,
  agentId: string,
  updatedAt: string,
  guardStageId: string | null = null,
): D1Statement {
  return db.prepare(`
    UPDATE agents SET
      success_rate = ROUND(100.0 * (
        MAX(0.80, MIN(0.99, trust_score / 10.0)) * 5.0
        + (SELECT COUNT(*) FROM agent_performance_events p WHERE p.agent_id = agents.id AND p.outcome = 'done')
      ) / (
        5.0 + (SELECT COUNT(*) FROM agent_performance_events p WHERE p.agent_id = agents.id)
      ), 1),
      updated_at = ?
    WHERE id = ? AND (
      ? IS NULL OR EXISTS (
        SELECT 1 FROM agent_performance_events p
        WHERE p.stage_id = ? AND p.agent_id = agents.id AND p.created_at = ?
      )
    )
  `).bind(updatedAt, agentId, guardStageId, guardStageId, updatedAt);
}

export class D1PlatformStore implements PlatformStore {
  constructor(private readonly db: D1Database) {}

  async ensureIdentityProfile(identity: AuthIdentityInput): Promise<UserContext> {
    const normalizedEmail = identity.email?.trim().toLocaleLowerCase() || null;
    const normalizedWallet = identity.walletAddress?.trim().toLocaleLowerCase() || null;
    const linked = await this.db.prepare(
      'SELECT profile_id FROM auth_identities WHERE provider = ? AND subject = ?',
    ).bind(identity.provider, identity.subject).first<Row>();

    const [byEmail, byWallet] = await Promise.all([
      normalizedEmail
        ? this.db.prepare('SELECT id FROM profiles WHERE lower(email) = ? LIMIT 1').bind(normalizedEmail).first<Row>()
        : Promise.resolve(null),
      normalizedWallet
        ? this.db.prepare('SELECT id FROM profiles WHERE lower(wallet_address) = ? LIMIT 1').bind(normalizedWallet).first<Row>()
        : Promise.resolve(null),
    ]);
    const emailProfileId = text(byEmail?.id);
    const walletProfileId = text(byWallet?.id);
    if (emailProfileId && walletProfileId && emailProfileId !== walletProfileId) throw new Error('IDENTITY_CONFLICT');

    let profileId = text(linked?.profile_id) || emailProfileId || walletProfileId;
    if (profileId && linked && ((emailProfileId && emailProfileId !== profileId) || (walletProfileId && walletProfileId !== profileId))) {
      throw new Error('IDENTITY_CONFLICT');
    }
    profileId ||= identity.subject;

    try {
      await this.db.prepare(`
        INSERT INTO profiles (id, email, display_name, role, wallet_address)
        VALUES (?, ?, ?, 'requester', ?)
        ON CONFLICT(id) DO UPDATE SET
          email = COALESCE(profiles.email, excluded.email),
          display_name = CASE WHEN profiles.display_name = 'AgentMesh User' AND excluded.display_name <> '' THEN excluded.display_name ELSE profiles.display_name END,
          wallet_address = COALESCE(profiles.wallet_address, excluded.wallet_address),
          updated_at = datetime('now')
      `).bind(profileId, normalizedEmail, identity.displayName, normalizedWallet).run();
    } catch (error) {
      const raced = normalizedWallet
        ? await this.db.prepare('SELECT id FROM profiles WHERE lower(wallet_address) = ? LIMIT 1').bind(normalizedWallet).first<Row>()
        : normalizedEmail
          ? await this.db.prepare('SELECT id FROM profiles WHERE lower(email) = ? LIMIT 1').bind(normalizedEmail).first<Row>()
          : null;
      const racedId = text(raced?.id);
      if (!racedId || linked) throw error;
      profileId = racedId;
    }

    await this.db.prepare(`
      INSERT INTO auth_identities (provider, subject, profile_id, email, wallet_address)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, subject) DO UPDATE SET
        email = COALESCE(excluded.email, auth_identities.email),
        wallet_address = COALESCE(excluded.wallet_address, auth_identities.wallet_address),
        last_seen_at = datetime('now')
    `).bind(identity.provider, identity.subject, profileId, normalizedEmail, normalizedWallet).run();

    const profile = await this.getProfile(profileId);
    if (!profile) throw new Error('Profile could not be created');
    return profile;
  }

  async getProfile(id: string): Promise<UserContext | null> {
    const row = await this.db.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first<Row>();
    return row ? mapProfile(row) : null;
  }

  async updateRole(id: string, role: 'requester' | 'developer'): Promise<UserContext> {
    await this.db.prepare("UPDATE profiles SET role = ?, updated_at = datetime('now') WHERE id = ?").bind(role, id).run();
    const profile = await this.getProfile(id);
    if (!profile) throw new Error('Profile not found');
    return profile;
  }

  async consumeRateLimit(bucket: string, limit: number, windowSeconds: number, nowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const currentWindow = nowSeconds - (nowSeconds % windowSeconds);
    const row = await this.db.prepare(`
      INSERT INTO api_rate_limits (bucket, window_start, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT(bucket) DO UPDATE SET
        window_start = CASE WHEN api_rate_limits.window_start < ? THEN excluded.window_start ELSE api_rate_limits.window_start END,
        request_count = CASE WHEN api_rate_limits.window_start < ? THEN 1 ELSE api_rate_limits.request_count + 1 END
      RETURNING window_start, request_count
    `).bind(bucket, currentWindow, currentWindow, currentWindow).first<Row>();
    const count = number(row?.request_count);
    const windowStart = number(row?.window_start) || currentWindow;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: windowStart + windowSeconds,
    };
  }

  async listAgents(): Promise<Agent[]> {
    const { results } = await this.db.prepare('SELECT * FROM agents ORDER BY official DESC, trust_score DESC, created_at DESC LIMIT 200').all<Row>();
    return results.map(mapAgent);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const row = await this.db.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first<Row>();
    return row ? mapAgent(row) : null;
  }

  async createAgent(agent: Agent): Promise<Agent> {
    await this.db.prepare(`
      INSERT INTO agents
        (id, owner_id, name, category, summary, tags_json, endpoint_url, auth_type, input_schema_json,
         output_schema_json, price_usdc, wallet_address, status, version, trust_score, success_rate,
         response_time_ms, jobs_count, volume_usdc, author_name, official, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      agent.id, agent.ownerId, agent.name, agent.category, agent.summary, JSON.stringify(agent.tags),
      agent.endpoint, agent.authType, JSON.stringify(agent.inputSchema), JSON.stringify(agent.outputSchema),
      agent.price, agent.wallet, agent.status, agent.version, agent.trustScore, agent.successRate, 0,
      agent.jobs, agent.volume, agent.author, agent.official ? 1 : 0, agent.createdAt, agent.updatedAt,
    ).run();
    return agent;
  }

  async updateAgentTrial(id: string, score: number, status: AgentStatus, responseTimeMs = 1800): Promise<Agent | null> {
    const updatedAt = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`
        UPDATE agents SET trust_score = ?, status = ?, response_time_ms = ?, updated_at = ?
        WHERE id = ?
      `).bind(score, status, Math.max(1, Math.round(responseTimeMs)), updatedAt, id),
      refreshAgentPerformance(this.db, id, updatedAt),
    ]);
    return this.getAgent(id);
  }

  async updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null> {
    await this.db.prepare("UPDATE agents SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    return this.getAgent(id);
  }

  async listMissions(user: UserContext): Promise<Mission[]> {
    if (user.role === 'admin') {
      const { results } = await this.db.prepare('SELECT * FROM missions ORDER BY created_at DESC LIMIT 200').all<Row>();
      return results.map(mapMission);
    }
    if (user.role === 'developer') {
      const { results } = await this.db.prepare(`
        SELECT DISTINCT m.* FROM missions m
        JOIN workflow_stages s ON s.mission_id = m.id
        JOIN agents a ON a.id = s.agent_id
        WHERE a.owner_id = ?
        ORDER BY m.created_at DESC LIMIT 200
      `).bind(user.id).all<Row>();
      return results.map(mapMission);
    }
    const { results } = await this.db.prepare('SELECT * FROM missions WHERE requester_id = ? ORDER BY created_at DESC LIMIT 200').bind(user.id).all<Row>();
    return results.map(mapMission);
  }

  async getMission(id: string): Promise<Mission | null> {
    const row = await this.db.prepare('SELECT * FROM missions WHERE id = ?').bind(id).first<Row>();
    return row ? mapMission(row) : null;
  }

  async createMission(mission: Mission, stages: WorkflowStage[], edges: WorkflowEdge[] = []): Promise<Mission> {
    const payment = paymentConfig(mission.paymentMethod);
    const statements = [
      this.db.prepare(`
        INSERT INTO missions
          (id, requester_id, title, description, category, tags_json, budget_usdc, payment_method, deadline, priority,
           expertise, yield_enabled, status, progress, current_stage, team_json, compiled_spec_json,
           workflow_version, workflow_viewport_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        mission.id, mission.requesterId, mission.title, mission.description, mission.category,
        JSON.stringify(mission.tags), mission.budget, mission.paymentMethod, mission.deadline, mission.priority, mission.expertise,
        mission.yieldEnabled ? 1 : 0, mission.status, mission.progress, mission.currentStage,
        JSON.stringify(mission.team), mission.compiledSpec ? JSON.stringify(mission.compiledSpec) : null,
        mission.workflowVersion, JSON.stringify(mission.workflowViewport),
        mission.createdAt, mission.updatedAt,
      ),
      ...stages.map((stage) => stageInsert(this.db, stage)),
      ...edges.map((edge) => edgeInsert(this.db, edge)),
      this.db.prepare(`
        INSERT INTO escrows
          (id, mission_id, amount, token, network, payment_method, yield_enabled, platform_fee_rate, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0.004, 'pending', ?, ?)
      `).bind(
        `ESC-${mission.id}`, mission.id, mission.budget, payment.token, payment.network,
        mission.paymentMethod, mission.yieldEnabled ? 1 : 0, mission.createdAt, mission.updatedAt,
      ),
    ];
    await this.db.batch(statements);
    return mission;
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
    await this.db.prepare(`
      UPDATE missions SET compiled_spec_json = ?, current_stage = 'AI 已生成 DAG 工作流', updated_at = datetime('now')
      WHERE id = ? AND workflow_version = ?
    `).bind(JSON.stringify(spec), id, result.mission.workflowVersion).run();
    return { state: 'saved', mission: (await this.getMission(id))! };
  }

  async saveWorkflowDraft(
    id: string,
    stages: WorkflowStage[],
    edges: WorkflowEdge[],
    viewport: WorkflowViewport,
    expectedVersion: number,
  ): Promise<WorkflowDraftSaveResult> {
    const mission = await this.getMission(id);
    if (!mission) return { state: 'missing' };
    const escrow = await this.getEscrow(id);
    if (!['draft', 'matching'].includes(mission.status) || escrow?.status !== 'pending') return { state: 'locked' };
    const saveToken = crypto.randomUUID();
    const results = await this.db.batch([
      this.db.prepare(`
      UPDATE missions SET workflow_version = workflow_version + 1, workflow_viewport_json = ?,
        workflow_save_token = ?, team_json = '[]', compiled_spec_json = NULL, status = 'matching',
        current_stage = 'DAG 草稿已保存，等待校验与邀请', updated_at = datetime('now')
      WHERE id = ? AND workflow_version = ? AND status IN ('draft', 'matching')
        AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = missions.id AND status = 'pending')
    `).bind(JSON.stringify(viewport), saveToken, id, expectedVersion),
      this.db.prepare(`
        DELETE FROM stage_offers WHERE mission_id = ?
          AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      `).bind(id, id, saveToken),
      this.db.prepare(`
        UPDATE execution_events SET stage_id = NULL WHERE mission_id = ? AND stage_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      `).bind(id, id, saveToken),
      this.db.prepare(`
        DELETE FROM workflow_edges WHERE mission_id = ?
          AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      `).bind(id, id, saveToken),
      this.db.prepare(`
        DELETE FROM workflow_stages WHERE mission_id = ?
          AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      `).bind(id, id, saveToken),
      ...stages.map((stage) => guardedStageInsert(this.db, stage, saveToken)),
      ...edges.map((edge) => guardedEdgeInsert(this.db, edge, saveToken)),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) {
      const [currentMission, currentEscrow] = await Promise.all([this.getMission(id), this.getEscrow(id)]);
      if (!currentMission) return { state: 'missing' };
      if (!['draft', 'matching'].includes(currentMission.status) || currentEscrow?.status !== 'pending') return { state: 'locked' };
      return { state: 'version_conflict' };
    }
    return { state: 'saved', mission: (await this.getMission(id))! };
  }

  async confirmWorkflow(id: string, stages: WorkflowStage[], team: string[], offers: StageOffer[]): Promise<Mission | null> {
    await this.db.batch([
      this.db.prepare(`
        UPDATE missions SET team_json = ?, status = 'matching', current_stage = '接单邀请已发送，等待 Agent 确认', updated_at = datetime('now')
        WHERE id = ? AND status IN ('draft', 'matching')
          AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = missions.id AND status = 'pending')
      `).bind(JSON.stringify(team), id),
      this.db.prepare('DELETE FROM stage_offers WHERE mission_id = ?').bind(id),
      ...stages.map((stage) => this.db.prepare(`
        UPDATE workflow_stages SET agent_id = ?, updated_at = ?
        WHERE id = ? AND mission_id = ?
          AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = workflow_stages.mission_id AND status = 'pending')
      `).bind(stage.agentId, stage.updatedAt, stage.id, id)),
      ...offers.map((offer) => stageOfferInsert(this.db, offer)),
    ]);
    return this.getMission(id);
  }

  async startMission(
    id: string,
    requesterId: string,
    depositTxHash: string | null,
    payoutHash: string | null = null,
    startedAt = new Date().toISOString(),
    requesterWalletAddress: string | null = null,
  ) {
    const mission = await this.getMission(id);
    if (!mission) return null;
    const statements: D1Statement[] = [
      this.db.prepare(`
        UPDATE missions SET status = 'running', progress = CASE WHEN progress < 1 THEN 1 ELSE progress END,
          current_stage = '执行网络已启动', updated_at = ?
        WHERE id = ? AND status = 'matching'
          AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = missions.id AND status = 'pending')
          AND EXISTS (SELECT 1 FROM workflow_stages WHERE mission_id = missions.id)
          AND NOT EXISTS (
            SELECT 1 FROM workflow_stages s
            LEFT JOIN stage_offers o ON o.stage_id = s.id AND o.mission_id = s.mission_id AND o.agent_id = s.agent_id
            WHERE s.mission_id = missions.id AND s.node_type = 'task' AND (
              s.agent_id IS NULL OR o.id IS NULL OR o.status <> 'accepted'
            )
          )
      `).bind(startedAt, id),
    ];
    if (mission.paymentMethod === 'web2_balance') {
      statements.push(this.db.prepare(`
        INSERT INTO wallet_transactions
          (id, settlement_key, user_id, transaction_type, amount, token, mission_id, created_at)
        SELECT ?, ?, ?, 'mission_hold', ?, 'CREDIT', ?, ?
        WHERE EXISTS (SELECT 1 FROM missions WHERE id = ? AND status = 'running' AND updated_at = ?)
        ON CONFLICT(settlement_key) DO NOTHING
      `).bind(crypto.randomUUID(), `${id}:wallet:hold`, requesterId, -mission.budget, id, startedAt, id, startedAt));
    }
    statements.push(
      this.db.prepare(`
        UPDATE escrows SET status = 'held', deposit_tx_hash = COALESCE(?, deposit_tx_hash),
          payout_hash = COALESCE(?, payout_hash),
          requester_wallet_address = COALESCE(?, requester_wallet_address), updated_at = ?
        WHERE mission_id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM missions WHERE id = escrows.mission_id AND status = 'running' AND updated_at = ?)
      `).bind(depositTxHash, payoutHash, requesterWalletAddress?.toLocaleLowerCase() ?? null, startedAt, id, startedAt),
    );
    const results = await this.db.batch(statements);
    const saved = await this.getMission(id);
    return saved ? { mission: saved, applied: Number(results[0]?.meta?.changes ?? 0) > 0 } : null;
  }

  async submitMissionForReview(id: string, reviewDueAt: string): Promise<Mission | null> {
    await this.db.prepare(`
      UPDATE missions SET status = 'review', progress = 100, current_stage = '等待验收', review_due_at = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'running' AND cancelled_at IS NULL
    `).bind(reviewDueAt, id).run();
    return this.getMission(id);
  }

  async acceptMission(id: string, actorId: string, releaseTxHash: string | null) {
    const mission = await this.getMission(id);
    const escrow = await this.getEscrow(id);
    if (!mission || !escrow) return null;
    const stages = await this.listStages(id);
    const fee = Number((escrow.amount * escrow.platformFeeRate).toFixed(6));
    const stageTotal = stages.reduce((sum, stage) => sum + stage.budget, 0) || escrow.amount;
    const now = new Date().toISOString();
    const statements: D1Statement[] = [
      this.db.prepare(`
        UPDATE missions SET status = 'completed', progress = 100, current_stage = '已结算', updated_at = ?
        WHERE id = ? AND status = 'review' AND cancelled_at IS NULL
          AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = missions.id AND status = 'held')
      `).bind(now, id),
      this.db.prepare(`
        UPDATE escrows SET status = 'released', release_tx_hash = ?, released_at = ?, updated_at = ?
        WHERE mission_id = ? AND status = 'held'
          AND EXISTS (SELECT 1 FROM missions WHERE id = escrows.mission_id AND status = 'completed' AND updated_at = ?)
      `).bind(releaseTxHash, now, now, id, now),
      this.db.prepare(`
        INSERT OR IGNORE INTO ledger_entries (id, settlement_key, mission_id, agent_id, entry_type, amount, token, status, tx_hash, created_at)
        SELECT ?, ?, ?, NULL, 'platform_fee', ?, ?, 'settled', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = ? AND m.status = 'completed' AND m.updated_at = ?
            AND e.status = 'released' AND e.released_at = ?
        )
      `).bind(crypto.randomUUID(), `${id}:platform`, id, fee, escrow.token, releaseTxHash, now, id, now, now),
      this.db.prepare(`
        INSERT OR IGNORE INTO execution_events (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
        SELECT ?, ?, NULL, 'mission.accepted', '任务已验收，资金释放完成', 'requester', ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = ? AND m.status = 'completed' AND m.updated_at = ?
            AND e.status = 'released' AND e.released_at = ?
        )
      `).bind(`${id}:mission.accepted`, id, actorId, JSON.stringify({ amount: escrow.amount, token: escrow.token, releaseTxHash }), now, id, now, now),
    ];
    const payouts = new Map<string, number>();
    for (const stage of stages) {
      if (!stage.agentId) continue;
      const gross = escrow.amount * (stage.budget / stageTotal);
      payouts.set(stage.agentId, (payouts.get(stage.agentId) ?? 0) + gross);
    }
    const walletPayouts = new Map<string, number>();
    for (const [agentId, gross] of payouts) {
      const amount = Number((gross * (1 - escrow.platformFeeRate)).toFixed(6));
      statements.push(this.db.prepare(`
        INSERT OR IGNORE INTO ledger_entries (id, settlement_key, mission_id, agent_id, entry_type, amount, token, status, tx_hash, created_at)
        SELECT ?, ?, ?, ?, 'agent_payout', ?, ?, 'settled', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = ? AND m.status = 'completed' AND m.updated_at = ?
            AND e.status = 'released' AND e.released_at = ?
        )
      `).bind(crypto.randomUUID(), `${id}:agent:${agentId}`, id, agentId, amount, escrow.token, releaseTxHash, now, id, now, now));
      if (escrow.paymentMethod === 'web2_balance') {
        const agent = await this.getAgent(agentId);
        if (agent) walletPayouts.set(agent.ownerId, (walletPayouts.get(agent.ownerId) ?? 0) + amount);
      }
    }
    for (const [ownerId, amount] of walletPayouts) {
      statements.push(this.db.prepare(`
        INSERT INTO wallet_transactions
          (id, settlement_key, user_id, transaction_type, amount, token, mission_id, created_at)
        SELECT ?, ?, ?, 'agent_payout', ?, 'CREDIT', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = ? AND m.status = 'completed' AND m.updated_at = ?
            AND e.status = 'released' AND e.released_at = ?
        )
        ON CONFLICT(settlement_key) DO NOTHING
      `).bind(crypto.randomUUID(), `${id}:wallet:payout:${ownerId}`, ownerId, amount, id, now, id, now, now));
    }
    const results = await this.db.batch(statements);
    const saved = await this.getMission(id);
    return saved ? { mission: saved, applied: Number(results[0]?.meta?.changes ?? 0) > 0 } : null;
  }

  async listStages(missionId: string): Promise<WorkflowStage[]> {
    const { results } = await this.db.prepare('SELECT * FROM workflow_stages WHERE mission_id = ? ORDER BY position ASC').bind(missionId).all<Row>();
    return results.map(mapStage);
  }

  async listEdges(missionId: string): Promise<WorkflowEdge[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM workflow_edges WHERE mission_id = ? ORDER BY created_at ASC, id ASC',
    ).bind(missionId).all<Row>();
    return results.map(mapEdge);
  }

  async listStageOffers(missionId: string, now = new Date().toISOString()): Promise<StageOffer[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM stage_offers WHERE mission_id = ? ORDER BY created_at ASC, id ASC',
    ).bind(missionId).all<Row>();
    return results.map((row) => mapStageOffer(row, now));
  }

  async getStageOffer(id: string, now = new Date().toISOString()): Promise<StageOffer | null> {
    const row = await this.db.prepare('SELECT * FROM stage_offers WHERE id = ?').bind(id).first<Row>();
    return row ? mapStageOffer(row, now) : null;
  }

  async respondStageOffer(id: string, ownerId: string, decision: 'accepted' | 'declined', respondedAt: string): Promise<StageOffer | null> {
    const row = await this.db.prepare(`
      UPDATE stage_offers SET status = ?, responded_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND julianday(expires_at) > julianday(?)
        AND EXISTS (SELECT 1 FROM agents WHERE agents.id = stage_offers.agent_id AND agents.owner_id = ?)
        AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = stage_offers.mission_id AND status = 'pending')
      RETURNING *
    `).bind(decision, respondedAt, respondedAt, id, respondedAt, ownerId).first<Row>();
    if (!row) return null;
    const offer = mapStageOffer(row, respondedAt);
    if (decision === 'declined') {
      await this.db.prepare(`
        UPDATE missions SET current_stage = 'Agent 已拒绝接单，等待重新选择', updated_at = ?
        WHERE id = ? AND status = 'matching'
      `).bind(respondedAt, offer.missionId).run();
    } else {
      await this.db.prepare(`
        UPDATE missions SET current_stage = 'Agent 已全部接单，等待托管支付', updated_at = ?
        WHERE id = ? AND status = 'matching'
          AND EXISTS (SELECT 1 FROM workflow_stages WHERE mission_id = missions.id)
          AND NOT EXISTS (
            SELECT 1 FROM workflow_stages s
            WHERE s.mission_id = missions.id AND s.node_type = 'task' AND (
              s.agent_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM stage_offers o
                WHERE o.mission_id = s.mission_id AND o.stage_id = s.id
                  AND o.agent_id = s.agent_id AND o.status = 'accepted'
              )
            )
          )
      `).bind(respondedAt, offer.missionId).run();
    }
    return offer;
  }

  async claimStageForDispatch(missionId: string, stageId: string): Promise<WorkflowStage | null> {
    const row = await this.db.prepare(`
      UPDATE workflow_stages SET status = 'running', progress = MAX(progress, 1), updated_at = datetime('now')
      WHERE id = ? AND mission_id = ? AND status IN ('queued', 'failed') AND node_type = 'task' AND agent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = workflow_stages.mission_id AND m.status = 'running'
            AND m.cancelled_at IS NULL AND e.status = 'held'
        )
        AND NOT EXISTS (
          SELECT 1 FROM workflow_edges edge
          JOIN workflow_stages source ON source.id = edge.source_stage_id
          WHERE edge.mission_id = workflow_stages.mission_id
            AND edge.target_stage_id = workflow_stages.id
            AND source.status <> 'done'
        )
      RETURNING *
    `).bind(stageId, missionId).first<Row>();
    return row ? mapStage(row) : null;
  }

  async resetStageDispatch(missionId: string, stageId: string): Promise<void> {
    await this.db.prepare(`
      UPDATE workflow_stages SET status = 'queued', updated_at = datetime('now')
      WHERE id = ? AND mission_id = ? AND status = 'running'
    `).bind(stageId, missionId).run();
  }

  async setStageProgress(missionId: string, stageId: string, progress: number): Promise<WorkflowStage | null> {
    const row = await this.db.prepare(`
      UPDATE workflow_stages SET progress = MAX(progress, MIN(100, ?)), updated_at = datetime('now')
      WHERE id = ? AND mission_id = ? AND status = 'running'
      RETURNING *
    `).bind(progress, stageId, missionId).first<Row>();
    return row ? mapStage(row) : null;
  }

  async resetWorkflowNodes(missionId: string, stageIds: string[], gateId?: string): Promise<void> {
    const ids = [...new Set([...stageIds, ...(gateId ? [gateId] : [])])];
    if (!ids.length) return;
    await this.db.batch(ids.map((id) => this.db.prepare(`
      UPDATE workflow_stages SET status = 'queued', progress = 0, output_json = NULL, updated_at = datetime('now')
      WHERE id = ? AND mission_id = ?
    `).bind(id, missionId)));
  }

  async updateMissionWorkflowState(missionId: string, progress: number, currentStage: string): Promise<Mission | null> {
    await this.db.prepare(`
      UPDATE missions SET progress = MIN(100, MAX(0, ?)), current_stage = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(progress, currentStage, missionId).run();
    return this.getMission(missionId);
  }

  async enqueueDispatches(missionId: string, stageIds: string[], now: string): Promise<DispatchOutboxItem[]> {
    if (!stageIds.length) return [];
    const expiresAt = new Date(Date.parse(now) + 2 * 60 * 60 * 1_000).toISOString();
    await this.db.batch(stageIds.map((stageId) => this.db.prepare(`
      INSERT INTO workflow_dispatch_outbox
        (id, mission_id, stage_id, run_id, expires_at, status, attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
      ON CONFLICT(mission_id, stage_id) DO UPDATE SET
        status = CASE WHEN workflow_dispatch_outbox.status = 'done' THEN 'pending' ELSE workflow_dispatch_outbox.status END,
        run_id = CASE WHEN workflow_dispatch_outbox.status = 'done' THEN excluded.run_id ELSE workflow_dispatch_outbox.run_id END,
        expires_at = CASE WHEN workflow_dispatch_outbox.status = 'done' THEN excluded.expires_at ELSE workflow_dispatch_outbox.expires_at END,
        next_attempt_at = excluded.next_attempt_at,
        updated_at = excluded.updated_at
    `).bind(`OUTBOX-${crypto.randomUUID()}`, missionId, stageId, crypto.randomUUID(), expiresAt, now, now, now)));
    const { results } = await this.db.prepare(`
      SELECT * FROM workflow_dispatch_outbox
      WHERE mission_id = ? AND stage_id IN (${stageIds.map(() => '?').join(',')})
      ORDER BY created_at ASC
    `).bind(missionId, ...stageIds).all<Row>();
    return results.map(mapDispatchOutbox);
  }

  async listPendingDispatches(limit: number, now: string): Promise<DispatchOutboxItem[]> {
    await this.db.prepare(`
      UPDATE workflow_dispatch_outbox SET status = 'pending', next_attempt_at = ?, updated_at = ?
      WHERE status = 'processing' AND julianday(updated_at) <= julianday(?, '-2 minutes')
    `).bind(now, now, now).run();
    const { results } = await this.db.prepare(`
      SELECT * FROM workflow_dispatch_outbox
      WHERE status = 'pending' AND julianday(next_attempt_at) <= julianday(?)
      ORDER BY next_attempt_at ASC, created_at ASC LIMIT ?
    `).bind(now, limit).all<Row>();
    return results.map(mapDispatchOutbox);
  }

  async claimDispatch(id: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE workflow_dispatch_outbox SET status = 'processing', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status = 'pending' AND julianday(next_attempt_at) <= julianday(?)
    `).bind(now, id, now).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async completeDispatch(id: string, status: 'done' | 'pending', now: string, nextAttemptAt = now): Promise<void> {
    await this.db.prepare(`
      UPDATE workflow_dispatch_outbox SET status = ?, next_attempt_at = ?, updated_at = ?
      WHERE id = ? AND status = 'processing'
    `).bind(status, nextAttemptAt, now, id).run();
  }

  async updateStage(
    missionId: string,
    stageId: string,
    status: WorkflowStage['status'],
    output?: Record<string, unknown> | null,
  ): Promise<WorkflowStage | null> {
    await this.db.prepare(`
      UPDATE workflow_stages
      SET status = ?, progress = CASE WHEN ? = 'done' THEN 100 WHEN ? = 'queued' THEN 0 ELSE progress END,
        output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END, updated_at = datetime('now')
      WHERE id = ? AND mission_id = ?
    `).bind(status, status, status, output === undefined ? 0 : 1, output === undefined ? null : JSON.stringify(output), stageId, missionId).run();
    const row = await this.db.prepare('SELECT * FROM workflow_stages WHERE id = ? AND mission_id = ?').bind(stageId, missionId).first<Row>();
    return row ? mapStage(row) : null;
  }

  async transitionRunningStage(
    missionId: string,
    stageId: string,
    status: Exclude<WorkflowStage['status'], 'queued'>,
    output?: Record<string, unknown> | null,
  ): Promise<WorkflowStage | null> {
    const current = await this.db.prepare('SELECT agent_id FROM workflow_stages WHERE id = ? AND mission_id = ?')
      .bind(stageId, missionId).first<Row>();
    const agentId = text(current?.agent_id);
    const transitionedAt = new Date().toISOString();
    const statements = [this.db.prepare(`
        UPDATE workflow_stages
        SET status = ?, progress = CASE WHEN ? = 'done' THEN 100 ELSE progress END,
          output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END, updated_at = ?
        WHERE id = ? AND mission_id = ? AND status = 'running'
          AND EXISTS (
            SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
            WHERE m.id = workflow_stages.mission_id AND m.status = 'running'
              AND m.cancelled_at IS NULL AND e.status = 'held'
          )
      `).bind(status, status, output === undefined ? 0 : 1, output === undefined ? null : JSON.stringify(output), transitionedAt, stageId, missionId)];
    if (agentId && (status === 'done' || status === 'failed')) {
      statements.push(
        this.db.prepare(`
          INSERT OR IGNORE INTO agent_performance_events (stage_id, mission_id, agent_id, outcome, created_at)
          SELECT id, mission_id, agent_id, ?, ? FROM workflow_stages
          WHERE id = ? AND mission_id = ? AND status = ? AND updated_at = ? AND agent_id = ?
        `).bind(status, transitionedAt, stageId, missionId, status, transitionedAt, agentId),
        refreshAgentPerformance(this.db, agentId, transitionedAt, stageId),
      );
    }
    const results = await this.db.batch(statements);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
    const row = await this.db.prepare('SELECT * FROM workflow_stages WHERE id = ? AND mission_id = ?')
      .bind(stageId, missionId).first<Row>();
    return row ? mapStage(row) : null;
  }

  async addEvent(event: ExecutionEvent, progress?: number, currentStage?: string, stageGuard?: WorkflowStage['status']): Promise<ExecutionEvent> {
    const statements = [this.db.prepare(`
      INSERT INTO execution_events
        (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event.id, event.missionId, event.stageId, event.type, event.message, event.actorType,
      event.actorId, JSON.stringify(event.payload), event.createdAt,
    )];
    if (progress !== undefined || currentStage !== undefined) {
      statements.push(this.db.prepare(`
        UPDATE missions SET
          progress = CASE WHEN ? IS NULL THEN progress ELSE MAX(progress, ?) END,
          current_stage = COALESCE(?, current_stage),
          updated_at = datetime('now')
        WHERE id = ?
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM workflow_stages
            WHERE id = ? AND mission_id = ? AND status = ?
          ))
      `).bind(
        progress ?? null,
        progress ?? null,
        currentStage ?? null,
        event.missionId,
        stageGuard ?? null,
        event.stageId,
        event.missionId,
        stageGuard ?? null,
      ));
    }
    await this.db.batch(statements);
    return event;
  }

  async listEvents(missionId: string): Promise<ExecutionEvent[]> {
    const { results } = await this.db.prepare('SELECT * FROM execution_events WHERE mission_id = ? ORDER BY created_at ASC LIMIT 500').bind(missionId).all<Row>();
    return results.map(mapEvent);
  }

  async addDeliverable(deliverable: Deliverable): Promise<Deliverable> {
    await this.db.prepare(`
      INSERT INTO deliverables (id, mission_id, stage_id, agent_id, name, uri, content_hash, mime_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      deliverable.id, deliverable.missionId, deliverable.stageId, deliverable.agentId,
      deliverable.name, deliverable.uri, deliverable.contentHash, deliverable.mimeType,
      deliverable.status, deliverable.createdAt,
    ).run();
    return deliverable;
  }

  async listDeliverables(missionId: string): Promise<Deliverable[]> {
    const { results } = await this.db.prepare('SELECT * FROM deliverables WHERE mission_id = ? ORDER BY created_at ASC').bind(missionId).all<Row>();
    return results.map(mapDeliverable);
  }

  async getEscrow(missionId: string): Promise<Escrow | null> {
    const row = await this.db.prepare('SELECT * FROM escrows WHERE mission_id = ?').bind(missionId).first<Row>();
    return row ? mapEscrow(row) : null;
  }

  async getWalletAccount(userId: string, limit = 30): Promise<WalletAccount> {
    const [balanceRow, claimRow, transactionRows] = await Promise.all([
      this.db.prepare('SELECT balance FROM wallet_balances WHERE user_id = ?').bind(userId).first<Row>(),
      this.db.prepare('SELECT last_claim_at FROM test_topup_claims WHERE user_id = ?').bind(userId).first<Row>(),
      this.db.prepare(`
        SELECT id, transaction_type, amount, token, mission_id, created_at
        FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
      `).bind(userId, Math.max(1, Math.min(100, limit))).all<Row>(),
    ]);
    const lastClaimAt = text(claimRow?.last_claim_at);
    return {
      balance: Number(number(balanceRow?.balance).toFixed(6)),
      token: 'CREDIT',
      testTopupAmount: TEST_TOPUP_AMOUNT,
      nextTestTopupAt: lastClaimAt ? new Date(Date.parse(lastClaimAt) + 24 * 60 * 60 * 1000).toISOString() : null,
      transactions: transactionRows.results.map(mapWalletTransaction),
    };
  }

  async claimTestCredit(userId: string, now: string): Promise<{ account: WalletAccount; credited: boolean }> {
    const result = await this.db.prepare(`
      INSERT INTO test_topup_claims (user_id, last_claim_at) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_claim_at = excluded.last_claim_at
      WHERE julianday(test_topup_claims.last_claim_at) <= julianday(excluded.last_claim_at) - 1
    `).bind(userId, now).run();
    return { account: await this.getWalletAccount(userId), credited: result.meta.changes > 0 };
  }

  async listDisputes(user: UserContext): Promise<Dispute[]> {
    const arbitrationMember = await this.db.prepare(
      "SELECT user_id FROM arbitration_members WHERE user_id = ? AND status = 'active'",
    ).bind(user.id).first<Row>();
    if (user.role === 'admin' || arbitrationMember) {
      const { results } = await this.db.prepare('SELECT * FROM disputes ORDER BY created_at DESC LIMIT 200').all<Row>();
      return results.map(mapDispute);
    }
    const { results } = await this.db.prepare(`
      SELECT DISTINCT d.* FROM disputes d
      JOIN missions m ON m.id = d.mission_id
      LEFT JOIN workflow_stages s ON s.mission_id = m.id
      LEFT JOIN agents a ON a.id = s.agent_id
      WHERE m.requester_id = ? OR a.owner_id = ?
        OR EXISTS (
          SELECT 1 FROM dispute_proposals dp
          JOIN dispute_electorate de ON de.proposal_id = dp.id
          WHERE dp.dispute_id = d.id AND de.user_id = ?
        )
      ORDER BY d.created_at DESC LIMIT 200
    `).bind(user.id, user.id, user.id).all<Row>();
    return results.map(mapDispute);
  }

  async getDisputes(missionId: string): Promise<Dispute[]> {
    const { results } = await this.db.prepare('SELECT * FROM disputes WHERE mission_id = ? ORDER BY created_at DESC').bind(missionId).all<Row>();
    return results.map(mapDispute);
  }

  async createDispute(dispute: Dispute): Promise<Dispute> {
    await this.db.batch([
      this.db.prepare(`
        INSERT INTO disputes
          (id, mission_id, opened_by, reason, evidence_json, status, resolution, freeze_tx_hash, resolution_tx_hash, created_at, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL)
      `).bind(dispute.id, dispute.missionId, dispute.openedBy, dispute.reason, JSON.stringify(dispute.evidence), dispute.status, dispute.freezeTxHash, dispute.createdAt),
      this.db.prepare("UPDATE escrows SET status = 'frozen', freeze_tx_hash = ?, updated_at = datetime('now') WHERE mission_id = ? AND status = 'held'").bind(dispute.freezeTxHash, dispute.missionId),
    ]);
    return dispute;
  }

  async startDisputeReview(id: string, actorId: string, startedAt = new Date().toISOString()): Promise<Dispute | null> {
    const existingRow = await this.db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first<Row>();
    if (!existingRow) return null;
    const existing = mapDispute(existingRow);
    if (!['open', 'reviewing'].includes(existing.status)) return existing;

    const proposalRow = await this.db.prepare('SELECT * FROM dispute_proposals WHERE dispute_id = ?').bind(id).first<Row>();
    if (proposalRow) {
      if (existing.status === 'open') {
        await this.db.prepare("UPDATE disputes SET status = 'reviewing' WHERE id = ? AND status = 'open'").bind(id).run();
      }
      const row = await this.db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first<Row>();
      return row ? mapDispute(row) : null;
    }

    const { results: electorateRows } = await this.db.prepare(`
      SELECT am.user_id, am.power
      FROM arbitration_members am
      JOIN disputes d ON d.id = ?
      JOIN missions m ON m.id = d.mission_id
      WHERE am.status = 'active'
        AND am.user_id <> d.opened_by
        AND am.user_id <> m.requester_id
        AND NOT EXISTS (
          SELECT 1
          FROM workflow_stages s
          JOIN agents a ON a.id = s.agent_id
          WHERE s.mission_id = m.id AND a.owner_id = am.user_id
        )
      ORDER BY am.user_id ASC
    `).bind(id).all<Row>();
    if (electorateRows.length === 0) throw new Error('ARBITRATION_NO_ELIGIBLE_MEMBERS');

    const proposalId = `PROP-${crypto.randomUUID()}`;
    const eligibleWeight = electorateRows.length;
    const votingEndsAt = arbitrationVotingEndsAt(startedAt);
    const actionId = `${id}:review_started`;
    const statements = [
      this.db.prepare(`
        INSERT INTO dispute_proposals
          (id, dispute_id, proposer_id, status, weight_mode, voting_starts_at, voting_ends_at,
           quorum_required, eligible_weight, support_votes, oppose_votes, abstain_votes, created_at)
        VALUES (?, ?, ?, 'active', 'one_person_one_vote', ?, ?, ?, ?, 0, 0, 0, ?)
      `).bind(proposalId, id, actorId, startedAt, votingEndsAt, arbitrationQuorum(eligibleWeight), eligibleWeight, startedAt),
      ...electorateRows.map((row) => this.db.prepare(`
        INSERT INTO dispute_electorate (proposal_id, user_id, power_snapshot, vote_weight, created_at)
        VALUES (?, ?, ?, 1, ?)
      `).bind(proposalId, text(row.user_id), Math.max(1, number(row.power)), startedAt)),
      this.db.prepare("UPDATE disputes SET status = 'reviewing' WHERE id = ? AND status IN ('open', 'reviewing')").bind(id),
      this.db.prepare(`
        INSERT OR IGNORE INTO dispute_actions (id, dispute_id, actor_id, action, note, created_at)
        VALUES (?, ?, ?, 'review_started', ?, ?)
      `).bind(actionId, id, actorId, `DAO proposal ${proposalId} created with ${eligibleWeight} eligible voters`, startedAt),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      const concurrent = await this.db.prepare('SELECT id FROM dispute_proposals WHERE dispute_id = ?').bind(id).first<Row>();
      if (!concurrent) throw error;
    }
    const row = await this.db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first<Row>();
    return row ? mapDispute(row) : null;
  }

  async getDisputeGovernance(id: string, userId: string, now = new Date().toISOString()): Promise<DisputeGovernance | null> {
    const dispute = await this.db.prepare('SELECT id FROM disputes WHERE id = ?').bind(id).first<Row>();
    if (!dispute) return null;
    const proposalRow = await this.db.prepare('SELECT * FROM dispute_proposals WHERE dispute_id = ?').bind(id).first<Row>();
    if (!proposalRow) {
      return { proposal: null, electorate: [], votes: [], currentUser: { eligible: false, canVote: false, hasVoted: false, choice: null } };
    }
    const proposal = mapArbitrationProposal(proposalRow);
    const [{ results: electorateRows }, { results: voteRows }] = await Promise.all([
      this.db.prepare(`
        SELECT e.*, p.display_name
        FROM dispute_electorate e JOIN profiles p ON p.id = e.user_id
        WHERE e.proposal_id = ? ORDER BY p.display_name ASC, e.user_id ASC
      `).bind(proposal.id).all<Row>(),
      this.db.prepare(`
        SELECT v.*, p.display_name
        FROM dispute_votes v JOIN profiles p ON p.id = v.voter_id
        WHERE v.proposal_id = ? ORDER BY v.created_at ASC, v.id ASC
      `).bind(proposal.id).all<Row>(),
    ]);
    const electorate = electorateRows.map(mapArbitrationElector);
    const votes = voteRows.map(mapDisputeVote);
    const eligible = electorate.some((item) => item.userId === userId);
    const currentVote = votes.find((item) => item.voterId === userId);
    return {
      proposal,
      electorate,
      votes,
      currentUser: {
        eligible,
        canVote: eligible && !currentVote && proposal.status === 'active'
          && Date.parse(now) >= Date.parse(proposal.votingStartsAt)
          && Date.parse(now) < Date.parse(proposal.votingEndsAt),
        hasVoted: Boolean(currentVote),
        choice: currentVote?.choice ?? null,
      },
    };
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
    const voteId = `VOTE-${crypto.randomUUID()}`;
    const support = choice === 'support_refund' ? elector.voteWeight : 0;
    const oppose = choice === 'oppose_refund' ? elector.voteWeight : 0;
    const abstain = choice === 'abstain' ? elector.voteWeight : 0;
    const results = await this.db.batch([
        this.db.prepare(`
          INSERT INTO dispute_votes (id, proposal_id, voter_id, choice, reason, vote_weight, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM dispute_proposals
            WHERE id = ? AND status = 'active'
              AND julianday(voting_starts_at) <= julianday(?)
              AND julianday(voting_ends_at) > julianday(?)
          ) AND EXISTS (
            SELECT 1 FROM dispute_electorate WHERE proposal_id = ? AND user_id = ?
          ) AND NOT EXISTS (
            SELECT 1 FROM dispute_votes WHERE proposal_id = ? AND voter_id = ?
          )
        `).bind(
          voteId, governance.proposal.id, voterId, choice, reason, elector.voteWeight, votedAt,
          governance.proposal.id, votedAt, votedAt,
          governance.proposal.id, voterId,
          governance.proposal.id, voterId,
        ),
        this.db.prepare(`
          UPDATE dispute_proposals
          SET support_votes = support_votes + ?, oppose_votes = oppose_votes + ?, abstain_votes = abstain_votes + ?
          WHERE id = ? AND status = 'active'
            AND EXISTS (SELECT 1 FROM dispute_votes WHERE id = ?)
        `).bind(support, oppose, abstain, governance.proposal.id, voteId),
      ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) {
      const latest = await this.getDisputeGovernance(id, voterId, votedAt);
      if (latest?.currentUser.hasVoted) return { state: 'already_voted' };
      if (latest?.proposal && Date.parse(votedAt) >= Date.parse(latest.proposal.votingEndsAt)) return { state: 'expired' };
      return latest?.proposal?.status === 'active' ? { state: 'not_eligible' } : { state: 'closed' };
    }
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
    await this.db.prepare(`
      UPDATE dispute_proposals SET status = ?, outcome = ?, finalized_at = ?, finalized_by = ?
      WHERE id = ? AND status = 'active'
    `).bind(evaluation.status, evaluation.outcome, finalizedAt, actorId, governance.proposal.id).run();
    const updated = await this.getDisputeGovernance(id, actorId, finalizedAt);
    return updated ? { state: 'finalized', governance: updated } : { state: 'missing' };
  }

  async resolveDispute(id: string, resolution: string, status: 'resolved' | 'rejected', actorId: string, resolutionTxHash: string | null) {
    const existing = await this.db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first<Row>();
    if (!existing) return null;
    const expectedProposalStatus = status === 'resolved' ? 'succeeded' : 'defeated';
    const expectedOutcome = status === 'resolved' ? 'refund_requester' : 'reject_dispute';
    const resolvedAt = new Date().toISOString();
    const missionId = text(existing.mission_id);
    const mission = await this.getMission(missionId);
    const escrow = await this.getEscrow(missionId);
    const statements = [
      this.db.prepare(`
        UPDATE disputes SET status = ?, resolution = ?, resolution_tx_hash = ?, resolved_at = ?
        WHERE id = ? AND status = 'reviewing'
          AND EXISTS (
            SELECT 1 FROM dispute_proposals
            WHERE dispute_id = ? AND status = ? AND outcome = ?
          )
      `).bind(status, resolution, resolutionTxHash, resolvedAt, id, id, expectedProposalStatus, expectedOutcome),
      this.db.prepare(`
        UPDATE escrows SET status = ?, resolution_tx_hash = ?, updated_at = ?
        WHERE mission_id = ? AND status = 'frozen'
          AND EXISTS (
            SELECT 1 FROM disputes
            WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
          )
      `).bind(status === 'resolved' ? 'refunded' : 'held', resolutionTxHash, resolvedAt, missionId, id, status, resolution, resolutionTxHash, resolvedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO dispute_actions (id, dispute_id, actor_id, action, note, created_at)
        SELECT ?, id, ?, ?, ?, ? FROM disputes
        WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
      `).bind(`${id}:${status}`, actorId, status, resolution, resolvedAt, id, status, resolution, resolutionTxHash, resolvedAt),
      this.db.prepare(`
        UPDATE dispute_proposals SET status = 'executed', executed_at = ?, executed_by = ?
        WHERE dispute_id = ? AND status = ? AND outcome = ?
          AND EXISTS (
            SELECT 1 FROM disputes
            WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
          )
      `).bind(resolvedAt, actorId, id, expectedProposalStatus, expectedOutcome, id, status, resolution, resolutionTxHash, resolvedAt),
    ];
    if (status === 'resolved' && mission && escrow?.paymentMethod === 'web2_balance') {
      statements.push(this.db.prepare(`
        INSERT INTO wallet_transactions
          (id, settlement_key, user_id, transaction_type, amount, token, mission_id, created_at)
        SELECT ?, ?, ?, 'refund', ?, 'CREDIT', ?, ?
        WHERE EXISTS (
          SELECT 1 FROM disputes
          WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
        )
        ON CONFLICT(settlement_key) DO NOTHING
      `).bind(crypto.randomUUID(), `${missionId}:wallet:refund`, mission.requesterId, escrow.amount, missionId, resolvedAt, id, status, resolution, resolutionTxHash, resolvedAt));
      statements.push(this.db.prepare(`
        INSERT OR IGNORE INTO ledger_entries
          (id, settlement_key, mission_id, agent_id, entry_type, amount, token, status, tx_hash, created_at)
        SELECT ?, ?, ?, NULL, 'refund', ?, 'CREDIT', 'settled', NULL, ?
        WHERE EXISTS (
          SELECT 1 FROM disputes
          WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
        )
      `).bind(crypto.randomUUID(), `${missionId}:refund`, missionId, escrow.amount, resolvedAt, id, status, resolution, resolutionTxHash, resolvedAt));
    }
    if (status === 'resolved') {
      statements.push(this.db.prepare(`
        UPDATE missions SET cancelled_at = ?, progress = 100, current_stage = '争议退款，任务已终止', updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM disputes
          WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
        )
      `).bind(resolvedAt, resolvedAt, missionId, id, status, resolution, resolutionTxHash, resolvedAt));
    }
    const results = await this.db.batch(statements);
    const row = await this.db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first<Row>();
    return row ? { dispute: mapDispute(row), applied: Number(results[0]?.meta?.changes ?? 0) > 0 } : null;
  }

  async listDisputeActions(disputeId: string): Promise<DisputeAction[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM dispute_actions WHERE dispute_id = ? ORDER BY created_at ASC, id ASC',
    ).bind(disputeId).all<Row>();
    return results.map(mapDisputeAction);
  }

  async createAgentDispatch(dispatch: AgentDispatch): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO agent_dispatches (run_id, mission_id, stage_id, agent_id, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(dispatch.runId, dispatch.missionId, dispatch.stageId, dispatch.agentId, dispatch.expiresAt).run();
  }

  async applyAgentCallback(update: AgentCallbackUpdate) {
    const dispatch = await this.db.prepare(`
      SELECT expires_at, completed_at FROM agent_dispatches
      WHERE run_id = ? AND mission_id = ? AND stage_id = ? AND agent_id = ? AND expires_at = ?
    `).bind(update.runId, update.missionId, update.stageId, update.agentId, update.expiresAt).first<Row>();
    if (!dispatch) return { state: 'missing' as const };

    const existing = await this.db.prepare(`
      SELECT applied_at FROM agent_callback_events WHERE run_id = ? AND callback_id = ?
    `).bind(update.runId, update.callbackId).first<Row>();
    if (text(existing?.applied_at)) return { state: 'duplicate' as const };
    if (text(dispatch.completed_at) || Date.parse(text(dispatch.expires_at)) <= Date.parse(update.now)) return { state: 'expired' as const };

    const processingToken = crypto.randomUUID();
    const outputJson = update.output === undefined ? null : JSON.stringify(update.output);
    const validDispatch = `
      SELECT 1
      FROM agent_dispatches d
      JOIN workflow_stages s ON s.id = d.stage_id AND s.mission_id = d.mission_id
      JOIN missions m ON m.id = d.mission_id
      JOIN escrows e ON e.mission_id = d.mission_id
      WHERE d.run_id = ? AND d.mission_id = ? AND d.stage_id = ? AND d.agent_id = ? AND d.expires_at = ?
        AND d.completed_at IS NULL AND julianday(d.expires_at) > julianday(?)
        AND s.status = 'running' AND m.status = 'running' AND m.cancelled_at IS NULL AND e.status = 'held'
    `;
    const artifactStatements = (update.artifacts ?? []).map((artifact) => this.db.prepare(`
      INSERT INTO deliverables
        (id, mission_id, stage_id, agent_id, name, uri, content_hash, mime_type, status, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM agent_callback_events
        WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
      ) AND EXISTS (
        SELECT 1 FROM workflow_stages WHERE id = ? AND mission_id = ? AND agent_id = ? AND status = 'done'
      )
    `).bind(
      artifact.id, artifact.missionId, artifact.stageId, artifact.agentId, artifact.name,
      artifact.uri, artifact.contentHash, artifact.mimeType, artifact.status, artifact.createdAt,
      update.runId, update.callbackId, processingToken,
      update.stageId, update.missionId, update.agentId,
    ));
    const appliedIndex = 9 + artifactStatements.length;
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO agent_callback_events (run_id, callback_id, created_at)
        SELECT ?, ?, ? WHERE EXISTS (${validDispatch})
      `).bind(
        update.runId, update.callbackId, update.now,
        update.runId, update.missionId, update.stageId, update.agentId, update.expiresAt, update.now,
      ),
      this.db.prepare(`
        UPDATE agent_callback_events SET processing_token = ?
        WHERE run_id = ? AND callback_id = ? AND processing_token IS NULL AND applied_at IS NULL
          AND EXISTS (${validDispatch})
      `).bind(
        processingToken, update.runId, update.callbackId,
        update.runId, update.missionId, update.stageId, update.agentId, update.expiresAt, update.now,
      ),
      this.db.prepare(`
        UPDATE workflow_stages
        SET status = ?,
          progress = CASE WHEN ? = 'done' THEN 100 WHEN ? IS NULL THEN progress ELSE MAX(progress, ?) END,
          output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END, updated_at = ?
        WHERE id = ? AND mission_id = ? AND status = 'running'
          AND EXISTS (
            SELECT 1 FROM agent_callback_events
            WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
          )
      `).bind(
        update.status, update.status, update.progress ?? null, update.progress ?? null,
        update.output === undefined ? 0 : 1, outputJson, update.now,
        update.stageId, update.missionId, update.runId, update.callbackId, processingToken,
      ),
      this.db.prepare(`
        INSERT INTO execution_events
          (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM agent_callback_events
          WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
        ) AND EXISTS (
          SELECT 1 FROM workflow_stages WHERE id = ? AND mission_id = ? AND status = ?
        )
      `).bind(
        update.event.id, update.event.missionId, update.event.stageId, update.event.type, update.event.message,
        update.event.actorType, update.event.actorId, JSON.stringify(update.event.payload), update.event.createdAt,
        update.runId, update.callbackId, processingToken, update.stageId, update.missionId, update.status,
      ),
      this.db.prepare(`
        UPDATE missions SET
          progress = CASE WHEN ? IS NULL THEN progress ELSE MAX(progress, ?) END,
          current_stage = ?,
          updated_at = ?
        WHERE id = ? AND EXISTS (
          SELECT 1 FROM agent_callback_events
          WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
        ) AND EXISTS (
          SELECT 1 FROM workflow_stages WHERE id = ? AND mission_id = ? AND status = ?
        )
      `).bind(
        update.progress ?? null, update.progress ?? null, update.currentStage, update.now, update.missionId,
        update.runId, update.callbackId, processingToken, update.stageId, update.missionId, update.status,
      ),
      this.db.prepare(`
        UPDATE agent_dispatches SET completed_at = ?
        WHERE run_id = ? AND ? IN ('done', 'failed') AND completed_at IS NULL
          AND EXISTS (
            SELECT 1 FROM agent_callback_events
            WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
          )
      `).bind(update.now, update.runId, update.status, update.runId, update.callbackId, processingToken),
      this.db.prepare(`
        INSERT OR IGNORE INTO agent_performance_events (stage_id, mission_id, agent_id, outcome, created_at)
        SELECT ?, ?, ?, ?, ?
        WHERE ? IN ('done', 'failed') AND EXISTS (
          SELECT 1 FROM agent_callback_events
          WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
        ) AND EXISTS (
          SELECT 1 FROM workflow_stages WHERE id = ? AND mission_id = ? AND agent_id = ? AND status = ?
        )
      `).bind(
        update.stageId, update.missionId, update.agentId, update.status, update.now, update.status,
        update.runId, update.callbackId, processingToken,
        update.stageId, update.missionId, update.agentId, update.status,
      ),
      refreshAgentPerformance(this.db, update.agentId, update.now, update.stageId),
      this.db.prepare(`
        UPDATE workflow_dispatch_outbox SET status = 'done', updated_at = ?
        WHERE mission_id = ? AND stage_id = ? AND run_id = ? AND ? IN ('done', 'failed')
          AND EXISTS (
            SELECT 1 FROM agent_callback_events
            WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
          )
      `).bind(
        update.now, update.missionId, update.stageId, update.runId, update.status,
        update.runId, update.callbackId, processingToken,
      ),
      ...artifactStatements,
      this.db.prepare(`
        UPDATE agent_callback_events SET applied_at = ?
        WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
          AND EXISTS (SELECT 1 FROM execution_events WHERE id = ?)
      `).bind(update.now, update.runId, update.callbackId, processingToken, update.event.id),
    ]);

    if (Number(results[1]?.meta?.changes ?? 0) === 0) {
      const callback = await this.db.prepare('SELECT applied_at FROM agent_callback_events WHERE run_id = ? AND callback_id = ?')
        .bind(update.runId, update.callbackId).first<Row>();
      return text(callback?.applied_at) ? { state: 'duplicate' as const } : { state: 'invalid' as const };
    }
    const artifactInsertFailed = artifactStatements.some((_, index) => Number(results[9 + index]?.meta?.changes ?? 0) === 0);
    if (Number(results[2]?.meta?.changes ?? 0) === 0
      || Number(results[3]?.meta?.changes ?? 0) === 0
      || artifactInsertFailed
      || Number(results[appliedIndex]?.meta?.changes ?? 0) === 0) {
      throw new Error('AGENT_CALLBACK_ATOMICITY_FAILED');
    }
    const row = await this.db.prepare('SELECT * FROM workflow_stages WHERE id = ? AND mission_id = ?')
      .bind(update.stageId, update.missionId).first<Row>();
    return row ? { state: 'applied' as const, stage: mapStage(row) } : { state: 'invalid' as const };
  }

  async claimAgentCallback(runId: string, callbackId: string, now: string): Promise<'accepted' | 'duplicate' | 'expired' | 'missing'> {
    const dispatch = await this.db.prepare('SELECT expires_at, completed_at FROM agent_dispatches WHERE run_id = ?').bind(runId).first<Row>();
    if (!dispatch) return 'missing';
    if (text(dispatch.completed_at) || Date.parse(text(dispatch.expires_at)) <= Date.parse(now)) return 'expired';
    const result = await this.db.prepare(`
      INSERT OR IGNORE INTO agent_callback_events (run_id, callback_id, created_at) VALUES (?, ?, ?)
    `).bind(runId, callbackId, now).run();
    return result.meta.changes > 0 ? 'accepted' : 'duplicate';
  }

  async completeAgentDispatch(runId: string, now: string): Promise<void> {
    await this.db.prepare('UPDATE agent_dispatches SET completed_at = ? WHERE run_id = ? AND completed_at IS NULL').bind(now, runId).run();
  }

  async listNotifications(userId: string): Promise<Notification[]> {
    const { results } = await this.db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(userId).all<Row>();
    return results.map(mapNotification);
  }

  async createNotification(notification: Notification): Promise<Notification> {
    await this.db.prepare(`
      INSERT INTO notifications (id, user_id, title, detail, tone, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      notification.id,
      notification.userId,
      notification.title,
      notification.detail,
      notification.tone,
      notification.read ? 1 : 0,
      notification.createdAt,
    ).run();
    return notification;
  }

  async markNotificationsRead(userId: string): Promise<void> {
    await this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(userId).run();
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const row = await this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').bind(userId).first<Row>();
    return mapPreferences(row);
  }

  async updateUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences> {
    await this.db.prepare(`
      INSERT INTO user_preferences
        (user_id, task_updates, settlement_updates, product_updates, email_channel, locale, time_zone, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        task_updates = excluded.task_updates,
        settlement_updates = excluded.settlement_updates,
        product_updates = excluded.product_updates,
        email_channel = excluded.email_channel,
        locale = excluded.locale,
        time_zone = excluded.time_zone,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      preferences.taskUpdates ? 1 : 0,
      preferences.settlementUpdates ? 1 : 0,
      preferences.productUpdates ? 1 : 0,
      preferences.emailChannel ? 1 : 0,
      preferences.locale,
      preferences.timeZone,
      preferences.updatedAt,
    ).run();
    return this.getUserPreferences(userId);
  }

  async listAdminUsers(limit: number): Promise<AdminUser[]> {
    const { results } = await this.db.prepare(`
      SELECT p.*, am.status AS arbitration_status, am.power AS arbitration_power
      FROM profiles p LEFT JOIN arbitration_members am ON am.user_id = p.id
      ORDER BY CASE p.role WHEN 'admin' THEN 0 WHEN 'developer' THEN 1 ELSE 2 END, p.created_at DESC
      LIMIT ?
    `).bind(limit).all<Row>();
    return results.map(mapAdminUser);
  }

  async listArbitrationMembers(): Promise<ArbitrationMember[]> {
    const { results } = await this.db.prepare(`
      SELECT am.*, p.display_name, p.email, p.role
      FROM arbitration_members am JOIN profiles p ON p.id = am.user_id
      ORDER BY CASE am.status WHEN 'active' THEN 0 ELSE 1 END, p.display_name ASC, am.user_id ASC
    `).all<Row>();
    return results.map(mapArbitrationMember);
  }

  async setArbitrationMember(userId: string, active: boolean, actorId: string, updatedAt: string): Promise<ArbitrationMember | null> {
    const profile = await this.db.prepare('SELECT id FROM profiles WHERE id = ?').bind(userId).first<Row>();
    if (!profile) return null;
    const existing = await this.db.prepare('SELECT status FROM arbitration_members WHERE user_id = ?').bind(userId).first<Row>();
    const status: ArbitrationMember['status'] = active ? 'active' : 'inactive';
    const action = !existing ? 'appointed' : active ? 'activated' : 'deactivated';
    await this.db.batch([
      this.db.prepare(`
        INSERT INTO arbitration_members (user_id, status, power, appointed_by, appointed_at, updated_at)
        VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
      `).bind(userId, status, actorId, updatedAt, updatedAt),
      this.db.prepare(`
        INSERT INTO arbitration_member_actions (id, user_id, actor_id, action, power, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).bind(`ARB-${crypto.randomUUID()}`, userId, actorId, action, updatedAt),
    ]);
    const row = await this.db.prepare(`
      SELECT am.*, p.display_name, p.email, p.role
      FROM arbitration_members am JOIN profiles p ON p.id = am.user_id
      WHERE am.user_id = ?
    `).bind(userId).first<Row>();
    return row ? mapArbitrationMember(row) : null;
  }

  async countProfilesByRole(role: UserContext['role']): Promise<number> {
    const row = await this.db.prepare('SELECT COUNT(*) AS count FROM profiles WHERE role = ?').bind(role).first<Row>();
    return number(row?.count);
  }

  async updateAdminUserRole(targetId: string, role: UserContext['role'], actorId: string, createdAt: string): Promise<{ profile: AdminUser; action: AdminAction | null } | null> {
    const existingRow = await this.db.prepare(`
      SELECT p.*, am.status AS arbitration_status, am.power AS arbitration_power
      FROM profiles p LEFT JOIN arbitration_members am ON am.user_id = p.id WHERE p.id = ?
    `).bind(targetId).first<Row>();
    if (!existingRow) return null;
    const existing = mapAdminUser(existingRow);
    if (existing.role === role) return { profile: existing, action: null };
    const action: AdminAction = {
      id: `ADM-${crypto.randomUUID()}`,
      actorId,
      targetUserId: targetId,
      action: 'role_changed',
      detail: { previousRole: existing.role, nextRole: role },
      createdAt,
    };
    await this.db.batch([
      this.db.prepare('UPDATE profiles SET role = ?, updated_at = ? WHERE id = ?').bind(role, createdAt, targetId),
      this.db.prepare(`
        INSERT INTO admin_actions (id, actor_id, target_user_id, action, detail_json, created_at)
        VALUES (?, ?, ?, 'role_changed', ?, ?)
      `).bind(action.id, actorId, targetId, JSON.stringify(action.detail), createdAt),
    ]);
    const updatedRow = await this.db.prepare(`
      SELECT p.*, am.status AS arbitration_status, am.power AS arbitration_power
      FROM profiles p LEFT JOIN arbitration_members am ON am.user_id = p.id WHERE p.id = ?
    `).bind(targetId).first<Row>();
    return updatedRow ? { profile: mapAdminUser(updatedRow), action } : null;
  }

  async listAdminActions(limit: number): Promise<AdminAction[]> {
    const { results } = await this.db.prepare('SELECT * FROM admin_actions ORDER BY created_at DESC, id DESC LIMIT ?').bind(limit).all<Row>();
    return results.map(mapAdminAction);
  }

  async getDeveloperSummary(ownerId: string): Promise<{ jobs: number; activeAgents: number; volume: number; pending: number }> {
    const row = await this.db.prepare(`
      SELECT
        COALESCE(SUM(jobs_count), 0) AS jobs,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_agents,
        COALESCE(SUM(volume_usdc), 0) AS volume
      FROM agents WHERE owner_id = ?
    `).bind(ownerId).first<Row>();
    const pendingRow = await this.db.prepare(`
      SELECT COALESCE(SUM(le.amount), 0) AS pending
      FROM ledger_entries le JOIN agents a ON a.id = le.agent_id
      WHERE a.owner_id = ? AND le.status = 'pending'
    `).bind(ownerId).first<Row>();
    return {
      jobs: number(row?.jobs),
      activeAgents: number(row?.active_agents),
      volume: number(row?.volume),
      pending: number(pendingRow?.pending),
    };
  }

  async getDeveloperLedger(ownerId: string, limit: number, cursor: LedgerCursor | null, token: string): Promise<DeveloperLedger> {
    const cursorCondition = cursor
      ? 'AND (le.created_at < ? OR (le.created_at = ? AND le.id < ?))'
      : '';
    const statement = this.db.prepare(`
      SELECT
        le.id,
        le.mission_id,
        m.title AS mission_title,
        le.agent_id,
        a.name AS agent_name,
        le.entry_type,
        le.amount,
        le.token,
        le.status,
        le.tx_hash,
        le.created_at
      FROM ledger_entries le
      JOIN agents a ON a.id = le.agent_id
      JOIN missions m ON m.id = le.mission_id
      WHERE a.owner_id = ? AND le.token = ?
      ${cursorCondition}
      ORDER BY le.created_at DESC, le.id DESC
      LIMIT ?
    `);
    const { results } = cursor
      ? await statement.bind(ownerId, token, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1).all<Row>()
      : await statement.bind(ownerId, token, limit + 1).all<Row>();
    const [totals, weeklyResult] = await Promise.all([
      this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN le.status = 'settled' THEN CASE WHEN le.entry_type = 'refund' THEN -le.amount ELSE le.amount END ELSE 0 END), 0) AS settled,
        COALESCE(SUM(CASE WHEN le.status = 'pending' THEN CASE WHEN le.entry_type = 'refund' THEN -le.amount ELSE le.amount END ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN le.status = 'failed' THEN CASE WHEN le.entry_type = 'refund' THEN -le.amount ELSE le.amount END ELSE 0 END), 0) AS failed
      FROM ledger_entries le
      JOIN agents a ON a.id = le.agent_id
      WHERE a.owner_id = ? AND le.token = ?
      `).bind(ownerId, token).first<Row>(),
      this.db.prepare(`
        SELECT
          date(le.created_at, '-' || ((CAST(strftime('%w', le.created_at) AS INTEGER) + 6) % 7) || ' days') AS week_start,
          COALESCE(SUM(CASE WHEN le.entry_type = 'refund' THEN -le.amount ELSE le.amount END), 0) AS amount
        FROM ledger_entries le
        JOIN agents a ON a.id = le.agent_id
        WHERE a.owner_id = ? AND le.token = ?
          AND le.status = 'settled'
          AND le.created_at >= datetime('now', '-84 days')
        GROUP BY week_start
        ORDER BY week_start ASC
      `).bind(ownerId, token).all<Row>(),
    ]);
    const hasMore = results.length > limit;
    const entries = results.slice(0, limit).map(mapLedgerEntry);
    const lastEntry = entries.at(-1);
    return {
      token,
      entries,
      totals: {
        settled: number(totals?.settled),
        pending: number(totals?.pending),
        failed: number(totals?.failed),
      },
      weekly: weeklyResult.results.map((row) => ({ weekStart: text(row.week_start), amount: number(row.amount) })),
      pageInfo: {
        hasMore,
        nextCursor: hasMore && lastEntry ? { createdAt: lastEntry.createdAt, id: lastEntry.id } : null,
      },
    };
  }

  async claimIdempotent(userId: string, key: string, method: string, path: string, requestHash: string): Promise<IdempotencyClaim> {
    await this.db.prepare(`
      DELETE FROM idempotency_keys
      WHERE user_id = ? AND key = ? AND status_code = 0 AND created_at < datetime('now', '-5 minutes')
    `).bind(userId, key).run();
    const claimed = await this.db.prepare(`
      INSERT OR IGNORE INTO idempotency_keys (user_id, key, method, path, request_hash, status_code, response_json)
      VALUES (?, ?, ?, ?, ?, 0, '{}')
    `).bind(userId, key, method, path, requestHash).run();
    if (claimed.meta.changes > 0) return { state: 'acquired' };
    const row = await this.db.prepare('SELECT method, path, request_hash, status_code, response_json FROM idempotency_keys WHERE user_id = ? AND key = ?')
      .bind(userId, key).first<Row>();
    if (!row) return { state: 'pending' };
    if (text(row.method) !== method || text(row.path) !== path || text(row.request_hash) !== requestHash) return { state: 'conflict' };
    if (number(row.status_code) === 0) return { state: 'pending' };
    return { state: 'completed', result: { status: number(row.status_code), body: parseJson(row.response_json, {}) } };
  }

  async completeIdempotent(userId: string, key: string, result: IdempotentResult): Promise<void> {
    await this.db.prepare(`
      UPDATE idempotency_keys SET status_code = ?, response_json = ?
      WHERE user_id = ? AND key = ? AND status_code = 0
    `).bind(result.status, JSON.stringify(result.body), userId, key).run();
  }

  async abandonIdempotent(userId: string, key: string): Promise<void> {
    await this.db.prepare('DELETE FROM idempotency_keys WHERE user_id = ? AND key = ? AND status_code = 0').bind(userId, key).run();
  }
}
