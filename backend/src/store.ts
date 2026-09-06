import { D1CollaborationStore } from './collaborationStore';
import { D1MatchingStore } from './matchingStore';
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
  DeveloperLedger,
  Deliverable,
  DeliverableIpfsEvidence,
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
  AgentCidPortfolioItem,
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
  StageQuote,
  UserContext,
  UserPinmeCredentialRecord,
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
  WorkflowTemplate,
  WorkflowTemplateDetail,
  WorkflowTemplateSaveResult,
  WorkflowTemplateVersion,
  WorkflowViewport,
} from './contracts';
import { BRAND, normalizePlatformUserName } from '../../shared/brand';
import { AGENT_QUALITY_FORMULA_VERSION, calculateAgentQuality, feedbackWeightForPriorCount } from './agentQuality';
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
import { loadMultiplierForActiveAssignments } from './pricing';
import {
  exportArtifactExpiresAt,
  exportJobExpiresAt,
  exportLeaseExpiresAt,
  exportProgress,
  MAX_DIRECT_LEDGER_EXPORT_ROWS,
} from './exportJobs';
import { allocateRewardEpoch, evaluateEcosystemProposal, REWARD_FORMULA_VERSION, rewardScoreMicros } from './ydFinance';
import type { Address, Hex } from 'viem';

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

const defaultUserNamePlaceholders = BRAND.platform.defaultUserNames.map(() => '?').join(', ');

function mapProfile(row: Row): UserContext {
  return {
    id: text(row.id),
    email: text(row.email) || undefined,
    displayName: normalizePlatformUserName(text(row.display_name)),
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
    displayName: normalizePlatformUserName(text(row.display_name)),
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
    weightVersion: (text(row.weight_version) || (text(row.weight_mode) === 'power' ? 'member_power.v1' : 'one_person_one_vote.v1')) as ArbitrationProposal['weightVersion'],
    round: Math.min(1, Math.max(0, number(row.round))) as 0 | 1,
    parentProposalId: text(row.parent_proposal_id) || null,
    appealReason: text(row.appeal_reason) || null,
    appealDeadlineAt: text(row.appeal_deadline_at) || null,
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

function mapGovernanceExecution(row: Row): GovernanceExecutionItem {
  return {
    id: text(row.id),
    scope: text(row.scope) as GovernanceExecutionItem['scope'],
    sourceId: text(row.source_id),
    proposalId: text(row.proposal_id),
    action: text(row.action_type) as GovernanceExecutionItem['action'],
    payloadHash: text(row.payload_hash),
    status: text(row.status) as GovernanceExecutionItem['status'],
    requestedBy: text(row.requested_by),
    requestedAt: text(row.requested_at),
    txHash: text(row.tx_hash) || null,
    executedBy: text(row.executed_by) || null,
    executedAt: text(row.executed_at) || null,
  };
}

function mapArbitrationElector(row: Row): ArbitrationElector {
  return {
    userId: text(row.user_id),
    displayName: normalizePlatformUserName(text(row.display_name)),
    powerSnapshot: number(row.power_snapshot),
    voteWeight: number(row.vote_weight),
  };
}

function mapDisputeVote(row: Row): DisputeVote {
  return {
    id: text(row.id),
    proposalId: text(row.proposal_id),
    voterId: text(row.voter_id),
    voterDisplayName: normalizePlatformUserName(text(row.display_name)),
    choice: text(row.choice) as DisputeVote['choice'],
    reason: text(row.reason),
    voteWeight: number(row.vote_weight),
    createdAt: text(row.created_at),
  };
}

function mapRewardEpoch(row: Row): RewardEpoch {
  return {
    id: text(row.id),
    epochNumber: number(row.epoch_number),
    status: text(row.status) as RewardEpoch['status'],
    startsAt: text(row.starts_at),
    endsAt: text(row.ends_at),
    claimEndsAt: text(row.claim_ends_at),
    totalRewardUnits: text(row.total_reward_units),
    accountScoreCap: number(row.account_score_cap),
    formulaVersion: text(row.formula_version),
    rules: parseJson<Record<string, unknown>>(row.rules_json, {}),
    chainId: number(row.chain_id),
    distributorAddress: text(row.distributor_address),
    merkleRoot: text(row.merkle_root) || null,
    manifestHash: text(row.manifest_hash) || null,
    publishTxHash: text(row.publish_tx_hash) || null,
    computedAt: text(row.computed_at) || null,
    publishedAt: text(row.published_at) || null,
    createdBy: text(row.created_by),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapRewardActivity(row: Row): RewardActivity {
  return {
    id: text(row.id),
    sourceKey: text(row.source_key),
    userId: text(row.user_id),
    missionId: text(row.mission_id) || null,
    disputeId: text(row.dispute_id) || null,
    role: text(row.role) as RewardActivity['role'],
    formulaVersion: text(row.formula_version),
    asset: text(row.asset),
    settledAmount: number(row.settled_amount),
    qualityBps: number(row.quality_bps),
    penaltyBps: number(row.penalty_bps),
    scoreMicros: number(row.score_micros),
    eligible: boolean(row.eligible),
    detail: parseJson<Record<string, unknown>>(row.detail_json, {}),
    occurredAt: text(row.occurred_at),
    createdAt: text(row.created_at),
  };
}

function mapRewardAllocation(row: Row): RewardAllocation {
  return {
    id: text(row.id),
    epochId: text(row.epoch_id),
    userId: text(row.user_id),
    walletAddress: text(row.wallet_address),
    effectiveScore: number(row.effective_score),
    amountUnits: text(row.amount_units),
    leafHash: text(row.leaf_hash),
    proof: parseJson<string[]>(row.proof_json, []),
    status: text(row.status) as RewardAllocation['status'],
    claimTxHash: text(row.claim_tx_hash) || null,
    claimedAt: text(row.claimed_at) || null,
    createdAt: text(row.created_at),
  };
}

function mapStakingPosition(row: Row): YdStakingPosition {
  return {
    userId: text(row.user_id),
    walletAddress: text(row.wallet_address),
    amountUnits: text(row.amount_units) || '0',
    unlockTime: text(row.unlock_time) || null,
    durationSeconds: number(row.duration_seconds),
    reputationBps: number(row.reputation_bps) || 10_000,
    rawPower: text(row.raw_power) || '0',
    delegatedTo: text(row.delegated_to) || null,
    votingPower: text(row.voting_power) || '0',
    verified: boolean(row.verified),
    lastTxHash: text(row.last_tx_hash) || null,
    lastBlockNumber: text(row.last_block_number) || null,
    lastLogIndex: row.last_log_index === null || row.last_log_index === undefined ? null : number(row.last_log_index),
    updatedAt: text(row.updated_at),
  };
}

function mapEcosystemProposal(row: Row): EcosystemProposal {
  return {
    id: text(row.id),
    proposalNumber: number(row.proposal_number),
    proposerId: text(row.proposer_id),
    proposalType: text(row.proposal_type) as EcosystemProposal['proposalType'],
    title: text(row.title),
    description: text(row.description),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    status: text(row.status) as EcosystemProposal['status'],
    snapshotBlock: text(row.snapshot_block),
    startsAt: text(row.starts_at),
    endsAt: text(row.ends_at),
    quorumBps: number(row.quorum_bps),
    approvalBps: number(row.approval_bps),
    eligiblePower: text(row.eligible_power),
    forPower: text(row.for_power) || '0',
    againstPower: text(row.against_power) || '0',
    abstainPower: text(row.abstain_power) || '0',
    finalizedAt: text(row.finalized_at) || null,
    finalizedBy: text(row.finalized_by) || null,
    createdAt: text(row.created_at),
  };
}

function mapGovernanceSnapshot(row: Row): GovernancePowerSnapshot {
  return {
    proposalId: text(row.proposal_id),
    userId: text(row.user_id),
    walletAddress: text(row.wallet_address),
    power: text(row.power),
    delegateSources: parseJson<string[]>(row.delegate_sources_json, []),
    createdAt: text(row.created_at),
  };
}

function mapEcosystemVote(row: Row): EcosystemVote {
  return {
    id: text(row.id),
    proposalId: text(row.proposal_id),
    voterId: text(row.voter_id),
    walletAddress: text(row.wallet_address),
    choice: text(row.choice) as EcosystemVote['choice'],
    power: text(row.power),
    reason: text(row.reason),
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
    priceVersion: Math.max(1, number(row.price_version) || 1),
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

function mapAgentQualityStats(row: Row): AgentQualityStats {
  return {
    agentId: text(row.agent_id),
    marketplaceStatus: text(row.marketplace_status) as AgentQualityStats['marketplaceStatus'],
    reputation: number(row.reputation),
    breakdown: {
      reliability: number(row.reliability_score),
      quality: number(row.quality_score),
      delivery: number(row.delivery_score),
      response: number(row.response_score),
      history: number(row.history_score),
      riskPenalty: number(row.risk_penalty),
    },
    confidence: text(row.confidence) as AgentQualityStats['confidence'],
    settledJobs: number(row.settled_jobs),
    successfulJobs: number(row.successful_jobs),
    failedJobs: number(row.failed_jobs),
    refundedJobs: number(row.refunded_jobs),
    trialPassed: boolean(row.trial_passed),
    endpointHealthy: boolean(row.endpoint_healthy),
    payoutValid: boolean(row.payout_valid),
    unresolvedSevereRisks: number(row.unresolved_severe_risks),
    premium: boolean(row.premium),
    newAgent: boolean(row.new_agent),
    eligibilityReasons: parseJson<string[]>(row.eligibility_reasons_json, []),
    formulaVersion: text(row.formula_version) || AGENT_QUALITY_FORMULA_VERSION,
    lastTrialAt: text(row.last_trial_at) || null,
    lastHealthCheckAt: text(row.last_health_check_at) || null,
    updatedAt: text(row.updated_at),
  };
}

function mapAgentTrial(row: Row): AgentTrial {
  return {
    id: text(row.id), agentId: text(row.agent_id), agentVersionId: text(row.agent_version_id) || null,
    suiteVersion: text(row.suite_version), status: text(row.status) as AgentTrial['status'], score: number(row.score),
    responseTimeMs: number(row.response_time_ms), checks: parseJson<AgentTrial['checks']>(row.checks_json, []),
    summary: text(row.summary), evidence: parseJson<Record<string, unknown>>(row.evidence_json, {}),
    startedAt: text(row.started_at), completedAt: text(row.completed_at) || null, createdBy: text(row.created_by),
  };
}

function mapAgentHealthCheck(row: Row): AgentHealthCheck {
  return {
    id: text(row.id), agentId: text(row.agent_id), status: text(row.status) as AgentHealthCheck['status'],
    responseTimeMs: row.response_time_ms === null || row.response_time_ms === undefined ? null : number(row.response_time_ms),
    httpStatus: row.http_status === null || row.http_status === undefined ? null : number(row.http_status),
    errorCode: text(row.error_code) || null, checkedAt: text(row.checked_at),
  };
}

function mapAgentMetricEvent(row: Row): AgentMetricEvent {
  return {
    id: text(row.id), idempotencyKey: text(row.idempotency_key), agentId: text(row.agent_id),
    type: text(row.event_type) as AgentMetricEvent['type'], value: number(row.value), weight: number(row.weight),
    severity: text(row.severity) as AgentMetricEvent['severity'], sourceType: text(row.source_type) as AgentMetricEvent['sourceType'],
    sourceId: text(row.source_id), detail: parseJson<Record<string, unknown>>(row.detail_json, {}),
    occurredAt: text(row.occurred_at), createdAt: text(row.created_at),
  };
}

function mapAgentFeedback(row: Row): AgentFeedback {
  return {
    id: text(row.id), agentId: text(row.agent_id), missionId: text(row.mission_id), stageId: text(row.stage_id),
    requesterId: text(row.requester_id), version: number(row.version), deliveryQuality: number(row.delivery_quality),
    requirementsFit: number(row.requirements_fit), communication: number(row.communication), onTime: boolean(row.on_time),
    reuse: boolean(row.reuse_agent), comment: text(row.comment), effective: boolean(row.effective), createdAt: text(row.created_at),
  };
}

function mapAgentReputationSnapshot(row: Row): AgentReputationSnapshot {
  return {
    id: text(row.id), agentId: text(row.agent_id), evaluatedAt: text(row.evaluated_at), formulaVersion: text(row.formula_version),
    eventCount: number(row.event_count), reputation: number(row.reputation),
    breakdown: parseJson<AgentReputationSnapshot['breakdown']>(row.breakdown_json, {
      reliability: 0, quality: 0, delivery: 0, response: 0, history: 0, riskPenalty: 0,
    }),
    confidence: text(row.confidence) as AgentReputationSnapshot['confidence'],
    marketplaceStatus: text(row.marketplace_status) as AgentReputationSnapshot['marketplaceStatus'],
    eligibilityReasons: parseJson<string[]>(row.reasons_json, []), createdAt: text(row.created_at),
  };
}

function mapMission(row: Row): Mission {
  const storedStatus = text(row.cancelled_at) ? 'cancelled' : text(row.status);
  const pausedAt = text(row.runtime_paused_at) || null;
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
    deliveryPolicy: text(row.delivery_policy) === 'outcome_v1' ? 'outcome_v1' : 'legacy',
    reviewDueAt: text(row.review_due_at) || null,
    priority: text(row.priority) as Mission['priority'],
    expertise: text(row.expertise) as Mission['expertise'],
    yieldEnabled: boolean(row.yield_enabled),
    status: (pausedAt && storedStatus === 'running' ? 'paused' : storedStatus) as Mission['status'],
    progress: number(row.progress),
    currentStage: text(row.current_stage),
    team: parseJson<string[]>(row.team_json, []),
    compiledSpec: parseJson<Record<string, unknown> | null>(row.compiled_spec_json, null),
    workflowVersion: Math.max(1, number(row.workflow_version) || 1),
    workflowViewport: parseJson<WorkflowViewport>(row.workflow_viewport_json, { x: 0, y: 0, zoom: 1 }),
    pausedAt,
    pausedBy: text(row.runtime_paused_by) || null,
    pauseReason: text(row.runtime_pause_reason) || null,
    pauseMode: (text(row.runtime_pause_mode) || null) as Mission['pauseMode'],
    schedulerRevision: number(row.runtime_scheduler_revision),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

const missionRuntimeColumns = `
  (SELECT policy FROM mission_delivery_policies WHERE mission_id = m.id) AS delivery_policy,
  c.paused_at AS runtime_paused_at,
  c.paused_by AS runtime_paused_by,
  c.pause_reason AS runtime_pause_reason,
  c.pause_mode AS runtime_pause_mode,
  c.scheduler_revision AS runtime_scheduler_revision
`;

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
    input: parseJson<Record<string, unknown>>(row.current_attempt_input_json ?? row.input_json, {}),
    output: parseJson<Record<string, unknown> | null>(row.output_json, null),
    attemptNo: Math.max(1, number(row.current_attempt_no) || 1),
    attemptCreatedAt: text(row.current_attempt_created_at) || text(row.created_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapMissionChangeRequest(row: Row): MissionChangeRequest {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    version: number(row.version),
    targetStageIds: parseJson<string[]>(row.target_stage_ids_json, []),
    resetStageIds: parseJson<string[]>(row.reset_stage_ids_json, []),
    reason: text(row.reason),
    acceptanceCriteria: text(row.acceptance_criteria),
    requestedBy: text(row.requested_by),
    priorStageState: parseJson<MissionChangeRequest['priorStageState']>(row.prior_stage_state_json, []),
    status: 'applied',
    createdAt: text(row.created_at),
  };
}

function mapWorkflowCheckpoint(row: Row): WorkflowCheckpoint {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    sequence: number(row.sequence),
    kind: text(row.kind) as WorkflowCheckpoint['kind'],
    workflowVersion: number(row.workflow_version),
    schedulerRevision: number(row.scheduler_revision),
    changeVersion: number(row.change_version),
    schedulerState: text(row.scheduler_state) as WorkflowCheckpoint['schedulerState'],
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    createdBy: text(row.created_by) || null,
    createdAt: text(row.created_at),
  };
}

function mapEdge(row: Row): WorkflowEdge {
  const condition = parseJson<WorkflowEdge['condition']>(row.condition_json, null);
  const mappings = parseJson<NonNullable<WorkflowEdge['mappings']>>(row.mappings_json, []);
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    sourceStageId: text(row.source_stage_id),
    targetStageId: text(row.target_stage_id),
    ...(condition ? { condition } : {}),
    ...(mappings.length ? { mappings } : {}),
    createdAt: text(row.created_at),
  };
}

function mapWorkflowTransition(row: Row): WorkflowTransitionCheckpoint {
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    edgeId: text(row.edge_id),
    sourceStageId: text(row.source_stage_id),
    targetStageId: text(row.target_stage_id),
    sourceAttemptNo: number(row.source_attempt_no),
    workflowVersion: number(row.workflow_version),
    matched: boolean(row.matched),
    mappedInput: parseJson<Record<string, unknown>>(row.mapped_input_json, {}),
    missingRequired: parseJson<string[]>(row.missing_required_json, []),
    errorCode: text(row.error_code) || null,
    createdAt: text(row.created_at),
  };
}

function mapWorkflowTemplate(row: Row): WorkflowTemplate {
  return {
    id: text(row.template_id ?? row.id), ownerId: text(row.owner_id), name: text(row.name),
    description: text(row.description), currentVersion: number(row.current_version),
    createdAt: text(row.template_created_at ?? row.created_at), updatedAt: text(row.updated_at),
  };
}

function mapWorkflowTemplateVersion(row: Row): WorkflowTemplateVersion {
  return {
    templateId: text(row.template_id), version: number(row.version),
    nodes: parseJson<WorkflowStage[]>(row.nodes_json, []), edges: parseJson<WorkflowEdge[]>(row.edges_json, []),
    entryIds: parseJson<string[]>(row.entry_ids_json, []), exitIds: parseJson<string[]>(row.exit_ids_json, []),
    contentHash: text(row.content_hash), createdAt: text(row.version_created_at ?? row.created_at),
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
  const storedQuote = parseJson<StageQuote | null>(row.pricing_snapshot_json, null);
  const hasPersistedQuoteAmount = row.quote_amount !== null && row.quote_amount !== undefined;
  const quoteAmount = number(row.quote_amount);
  const validStoredQuote = storedQuote
    && Number.isFinite(storedQuote.amount)
    && typeof storedQuote.token === 'string'
    && typeof storedQuote.formulaVersion === 'string';
  const quote: StageQuote = validStoredQuote
    ? { ...storedQuote, amount: hasPersistedQuoteAmount ? quoteAmount : storedQuote.amount }
    : {
        amount: number(row.stage_budget),
        token: (['CREDIT', 'mUSDC', 'sETH'].includes(text(row.escrow_token)) ? text(row.escrow_token) : 'CREDIT') as StageQuote['token'],
        basePriceUsdc: 0,
        agentPriceVersion: 1,
        formulaVersion: 'legacy.stage-budget',
        comparableToBasePrice: false,
        multipliers: { complexity: 1, urgency: 1, expertise: 1, load: 1 },
      };
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    stageId: text(row.stage_id),
    agentId: text(row.agent_id),
    status: storedStatus === 'pending' && Date.parse(text(row.expires_at)) <= Date.parse(now) ? 'expired' : storedStatus,
    quote,
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
  const ipfsEvidence: DeliverableIpfsEvidence | null = text(row.root_cid) ? {
    provider: 'pinme_ipfs',
    rootCid: text(row.root_cid),
    manifestPath: '/manifest.json',
    manifestSha256: text(row.manifest_sha256),
    manifest: parseJson(row.manifest_json, {} as DeliverableIpfsEvidence['manifest']),
    fileCount: number(row.file_count),
    totalBytes: number(row.total_bytes),
    visibility: text(row.visibility) as DeliverableIpfsEvidence['visibility'],
    versionNo: number(row.version_no),
    supersedesDeliverableId: text(row.supersedes_deliverable_id) || null,
    scopeKey: text(row.scope_key),
    verificationStatus: text(row.verification_status) as DeliverableIpfsEvidence['verificationStatus'],
    lastVerifiedAt: text(row.last_verified_at) || null,
    lastVerificationError: text(row.last_verification_error) || null,
  } : null;
  return {
    id: text(row.id),
    missionId: text(row.mission_id),
    stageId: text(row.stage_id) || null,
    attemptNo: row.attempt_no === null || row.attempt_no === undefined ? null : number(row.attempt_no),
    agentId: text(row.agent_id) || null,
    name: text(row.name),
    uri: text(row.uri),
    contentHash: text(row.content_hash),
    mimeType: text(row.mime_type),
    status: text(row.status) as Deliverable['status'],
    createdAt: text(row.created_at),
    ipfsEvidence,
  };
}

function mapEvidenceSnapshot(row: Row, prefix = ''): MissionEvidenceSnapshot | null {
  const missionId = text(row[`${prefix}mission_id`]);
  const deliverablesJson = row[`${prefix}deliverables_json`];
  if (!missionId || typeof deliverablesJson !== 'string') return null;
  return {
    missionId,
    deliverables: parseJson(deliverablesJson, []),
    acceptanceCriteriaSha256: text(row[`${prefix}acceptance_criteria_sha256`]),
    workflowVersion: number(row[`${prefix}workflow_version`]),
    schedulerRevision: number(row[`${prefix}scheduler_revision`]),
    eventWatermark: text(row[`${prefix}event_watermark`]) || null,
    frozenBy: text(row[`${prefix}frozen_by`]),
    frozenAt: text(row[`${prefix}snapshot_created_at`]),
  };
}

function mapEvidencePublication(row: Row): EvidencePublication {
  return {
    id: text(row.id), missionId: text(row.mission_id), kind: text(row.kind) as EvidencePublication['kind'],
    subjectId: text(row.subject_id), payloadSha256: text(row.payload_sha256), rootCid: text(row.root_cid),
    publishedBy: text(row.published_by), createdAt: text(row.created_at),
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
    evidenceSnapshot: mapEvidenceSnapshot(row, 'snapshot_'),
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

function mapLedgerExportJob(row: Row): LedgerExportJob {
  const artifactId = text(row.artifact_id);
  return {
    id: text(row.id),
    token: text(row.token),
    status: text(row.status) as LedgerExportJob['status'],
    totalRows: number(row.total_rows),
    processedRows: number(row.processed_rows),
    progress: number(row.progress),
    attempt: number(row.attempt),
    errorCode: text(row.error_code) || null,
    errorMessage: text(row.error_message) || null,
    startedAt: text(row.started_at) || null,
    completedAt: text(row.completed_at) || null,
    cancelledAt: text(row.cancelled_at) || null,
    expiresAt: artifactId ? text(row.artifact_expires_at) : text(row.expires_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    artifact: artifactId ? {
      id: artifactId,
      sha256: text(row.artifact_sha256),
      contentType: 'text/csv',
      rowCount: number(row.artifact_row_count),
      byteSize: number(row.artifact_byte_size),
      createdAt: text(row.artifact_created_at),
      expiresAt: text(row.artifact_expires_at),
    } : null,
  };
}

const ledgerExportSelect = `
  SELECT j.*,
    a.id AS artifact_id, a.sha256 AS artifact_sha256, a.row_count AS artifact_row_count,
    a.byte_size AS artifact_byte_size, a.created_at AS artifact_created_at,
    a.expires_at AS artifact_expires_at
  FROM export_jobs j LEFT JOIN export_artifacts a ON a.job_id = j.id AND a.deleted_at IS NULL
`;

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

function edgeRuleInsert(db: D1Database, edge: WorkflowEdge): D1Statement {
  return db.prepare(`
    INSERT INTO workflow_edge_rules
      (edge_id, mission_id, condition_json, mappings_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    edge.id,
    edge.missionId,
    edge.condition ? JSON.stringify(edge.condition) : null,
    JSON.stringify(edge.mappings ?? []),
    edge.createdAt,
    edge.createdAt,
  );
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

function guardedEdgeRuleInsert(db: D1Database, edge: WorkflowEdge, saveToken: string): D1Statement {
  return db.prepare(`
    INSERT INTO workflow_edge_rules
      (edge_id, mission_id, condition_json, mappings_json, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      AND EXISTS (SELECT 1 FROM workflow_edges WHERE id = ? AND mission_id = ?)
  `).bind(
    edge.id,
    edge.missionId,
    edge.condition ? JSON.stringify(edge.condition) : null,
    JSON.stringify(edge.mappings ?? []),
    edge.createdAt,
    edge.createdAt,
    edge.missionId,
    saveToken,
    edge.id,
    edge.missionId,
  );
}

function stageOfferInsert(db: D1Database, offer: StageOffer, confirmToken: string): D1Statement {
  return db.prepare(`
    INSERT INTO stage_offers
      (id, mission_id, stage_id, agent_id, status, expires_at, responded_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
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
    offer.missionId,
    confirmToken,
  );
}

function stageOfferQuoteInsert(db: D1Database, offer: StageOffer, confirmToken: string): D1Statement {
  return db.prepare(`
    INSERT INTO stage_offer_quotes (offer_id, amount, snapshot_json, created_at)
    SELECT ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM stage_offers WHERE id = ?)
      AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
  `).bind(offer.id, offer.quote.amount, JSON.stringify(offer.quote), offer.createdAt, offer.id, offer.missionId, confirmToken);
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
  readonly collaboration: D1CollaborationStore;
  readonly matching: D1MatchingStore;
  constructor(private readonly db: D1Database) { this.matching = new D1MatchingStore(db); this.collaboration = new D1CollaborationStore(db); }

  async ensureIdentityProfile(identity: AuthIdentityInput): Promise<UserContext> {
    const normalizedEmail = identity.email?.trim().toLocaleLowerCase() || null;
    const normalizedWallet = identity.walletAddress?.trim().toLocaleLowerCase() || null;
    const linked = await this.db.prepare(
      'SELECT profile_id, wallet_address FROM auth_identities WHERE provider = ? AND subject = ?',
    ).bind(identity.provider, identity.subject).first<Row>();
    const previousIdentityWallet = text(linked?.wallet_address).trim().toLocaleLowerCase() || null;
    const replaceWithVerifiedWallet = Boolean(identity.walletAddressAuthoritative && normalizedWallet);
    const clearPreviousIdentityWallet = Boolean(
      identity.walletAddressAuthoritative && !normalizedWallet && previousIdentityWallet,
    );

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
          display_name = CASE WHEN profiles.display_name IN (${defaultUserNamePlaceholders}) AND excluded.display_name <> '' THEN excluded.display_name ELSE profiles.display_name END,
          wallet_address = CASE
            WHEN ? = 1 THEN excluded.wallet_address
            WHEN ? = 1 AND lower(COALESCE(profiles.wallet_address, '')) = ? THEN NULL
            ELSE COALESCE(profiles.wallet_address, excluded.wallet_address)
          END,
          updated_at = datetime('now')
      `).bind(
        profileId,
        normalizedEmail,
        identity.displayName,
        normalizedWallet,
        ...BRAND.platform.defaultUserNames,
        replaceWithVerifiedWallet ? 1 : 0,
        clearPreviousIdentityWallet ? 1 : 0,
        previousIdentityWallet,
      ).run();
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
        wallet_address = CASE WHEN ? = 1 THEN excluded.wallet_address ELSE COALESCE(excluded.wallet_address, auth_identities.wallet_address) END,
        last_seen_at = datetime('now')
    `).bind(
      identity.provider,
      identity.subject,
      profileId,
      normalizedEmail,
      normalizedWallet,
      identity.walletAddressAuthoritative ? 1 : 0,
    ).run();

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
    const { results } = await this.db.prepare(`
      SELECT agents.*,
        COALESCE((SELECT MAX(version) FROM agent_price_versions WHERE agent_id = agents.id), 1) AS price_version
      FROM agents ORDER BY official DESC, trust_score DESC, created_at DESC LIMIT 200
    `).all<Row>();
    return results.map(mapAgent);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const row = await this.db.prepare(`
      SELECT agents.*,
        COALESCE((SELECT MAX(version) FROM agent_price_versions WHERE agent_id = agents.id), 1) AS price_version
      FROM agents WHERE id = ?
    `).bind(id).first<Row>();
    return row ? mapAgent(row) : null;
  }

  async getAgentLoadMultipliers(agentIds: string[]): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(agentIds)];
    if (uniqueIds.length === 0) return new Map();
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const { results } = await this.db.prepare(`
      SELECT agents.id,
        COUNT(DISTINCT CASE WHEN missions.id IS NOT NULL THEN stages.id END) AS active_assignments
      FROM agents
      LEFT JOIN workflow_stages stages
        ON stages.agent_id = agents.id
        AND stages.node_type = 'task'
        AND stages.status IN ('queued', 'running')
      LEFT JOIN mission_runtime_controls controls ON controls.mission_id = stages.mission_id
      LEFT JOIN missions
        ON missions.id = stages.mission_id
        AND missions.status = 'running'
        AND missions.cancelled_at IS NULL
        AND controls.paused_at IS NULL
      WHERE agents.id IN (${placeholders})
      GROUP BY agents.id
    `).bind(...uniqueIds).all<Row>();
    return new Map(results.map((row) => [text(row.id), loadMultiplierForActiveAssignments(number(row.active_assignments))]));
  }

  async createAgent(agent: Agent): Promise<Agent> {
    const created = { ...agent, priceVersion: agent.priceVersion ?? 1 };
    const versionId = `AGVER-${agent.id}-${agent.version.replaceAll('.', '-')}`;
    await this.db.batch([this.db.prepare(`
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
    ), this.db.prepare(`
      INSERT INTO agent_versions
        (id, agent_id, version, endpoint_url, auth_type, input_schema_json, output_schema_json, capabilities_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(versionId, agent.id, agent.version, agent.endpoint, agent.authType, JSON.stringify(agent.inputSchema), JSON.stringify(agent.outputSchema), JSON.stringify(agent.tags), agent.createdAt),
    this.db.prepare(`
      INSERT INTO agent_price_versions (id, agent_id, version, price_usdc, created_by, created_at)
      VALUES (?, ?, 1, ?, ?, ?)
    `).bind(`AGPRICE-${agent.id}-v1`, agent.id, agent.price, agent.ownerId, agent.createdAt),
    this.db.prepare(`
      INSERT INTO agent_stats
        (agent_id, marketplace_status, payout_valid, eligibility_reasons_json, formula_version, updated_at)
      VALUES (?, 'registered', ?, ?, ?, ?)
    `).bind(agent.id, /^0x[a-fA-F0-9]{40}$/.test(agent.wallet) ? 1 : 0, JSON.stringify(['正式 Trial 尚未通过', 'Endpoint 最近 24 小时无健康记录']), AGENT_QUALITY_FORMULA_VERSION, agent.createdAt)]);
    return created;
  }

  async updateAgentPrice(id: string, ownerId: string, price: number, updatedAt: string, changedBy = ownerId): Promise<Agent | null> {
    const current = await this.getAgent(id);
    if (!current || current.ownerId !== ownerId) return null;
    if (current.price === price) return current;
    const priceHistoryId = `AGPRICE-${id}-${crypto.randomUUID()}`;
    await this.db.batch([
      this.db.prepare(`
        INSERT INTO agent_price_versions (id, agent_id, version, price_usdc, created_by, created_at)
        SELECT ?, agents.id, COALESCE(MAX(history.version), 1) + 1, ?, ?, ?
        FROM agents LEFT JOIN agent_price_versions history ON history.agent_id = agents.id
        WHERE agents.id = ? AND agents.owner_id = ?
        GROUP BY agents.id
      `).bind(priceHistoryId, price, changedBy, updatedAt, id, ownerId),
      this.db.prepare(`
        UPDATE agents SET price_usdc = ?, updated_at = ?
        WHERE id = ? AND owner_id = ? AND price_usdc <> ?
      `).bind(price, updatedAt, id, ownerId, price),
    ]);
    return this.getAgent(id);
  }

  async updateAgentTrial(id: string, score: number, status: AgentStatus, responseTimeMs: number | null = 1800): Promise<Agent | null> {
    const updatedAt = new Date().toISOString();
    const normalizedResponseTimeMs = responseTimeMs === null ? null : Math.max(1, Math.round(responseTimeMs));
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE agents SET trust_score = ?, status = ?, response_time_ms = COALESCE(?, response_time_ms), updated_at = ?
        WHERE id = ?
      `).bind(score, status, normalizedResponseTimeMs, updatedAt, id),
      refreshAgentPerformance(this.db, id, updatedAt),
    ]);
    return this.getAgent(id);
  }

  async updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null> {
    await this.db.prepare("UPDATE agents SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    return this.getAgent(id);
  }

  async getAgentQualityStats(agentId: string): Promise<AgentQualityStats | null> {
    const row = await this.db.prepare('SELECT * FROM agent_stats WHERE agent_id = ?').bind(agentId).first<Row>();
    return row ? mapAgentQualityStats(row) : null;
  }

  async listAgentQualityStats(): Promise<AgentQualityStats[]> {
    const { results } = await this.db.prepare('SELECT * FROM agent_stats ORDER BY reputation DESC, agent_id ASC').all<Row>();
    return results.map(mapAgentQualityStats);
  }

  async recordAgentTrial(trial: AgentTrial): Promise<AgentTrial> {
    await this.db.prepare(`
      INSERT INTO agent_trials
        (id, agent_id, agent_version_id, suite_version, status, score, response_time_ms, checks_json, summary,
         evidence_json, started_at, completed_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      trial.id, trial.agentId, trial.agentVersionId, trial.suiteVersion, trial.status, trial.score, trial.responseTimeMs,
      JSON.stringify(trial.checks), trial.summary, JSON.stringify(trial.evidence), trial.startedAt, trial.completedAt, trial.createdBy,
    ).run();
    return trial;
  }

  async listAgentTrials(agentId: string, limit = 20): Promise<AgentTrial[]> {
    const { results } = await this.db.prepare('SELECT * FROM agent_trials WHERE agent_id = ? ORDER BY started_at DESC, id DESC LIMIT ?')
      .bind(agentId, Math.max(1, Math.min(100, limit))).all<Row>();
    return results.map(mapAgentTrial);
  }

  async recordAgentHealthCheck(check: AgentHealthCheck): Promise<AgentHealthCheck> {
    await this.db.prepare(`
      INSERT INTO agent_health_checks (id, agent_id, status, response_time_ms, http_status, error_code, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(check.id, check.agentId, check.status, check.responseTimeMs, check.httpStatus, check.errorCode, check.checkedAt).run();
    return check;
  }

  async listAgentHealthChecks(agentId: string, limit = 50): Promise<AgentHealthCheck[]> {
    const { results } = await this.db.prepare('SELECT * FROM agent_health_checks WHERE agent_id = ? ORDER BY checked_at DESC, id DESC LIMIT ?')
      .bind(agentId, Math.max(1, Math.min(200, limit))).all<Row>();
    return results.map(mapAgentHealthCheck);
  }

  async listAgentMetricEvents(agentId: string): Promise<AgentMetricEvent[]> {
    const { results } = await this.db.prepare('SELECT * FROM agent_metric_events WHERE agent_id = ? ORDER BY occurred_at ASC, id ASC').bind(agentId).all<Row>();
    return results.map(mapAgentMetricEvent);
  }

  async recomputeAgentQuality(agentId: string, evaluatedAt: string): Promise<AgentQualityStats | null> {
    const [agent, current, events] = await Promise.all([
      this.getAgent(agentId), this.getAgentQualityStats(agentId), this.listAgentMetricEvents(agentId),
    ]);
    if (!agent) return null;
    const stats = calculateAgentQuality(agent, events, evaluatedAt, current?.marketplaceStatus ?? 'registered');
    const snapshotId = `AGSNAP-${crypto.randomUUID()}`;
    await this.db.batch([
      this.db.prepare(`
        INSERT INTO agent_stats
          (agent_id, marketplace_status, reputation, reliability_score, quality_score, delivery_score, response_score,
           history_score, risk_penalty, confidence, settled_jobs, successful_jobs, failed_jobs, refunded_jobs,
           trial_passed, endpoint_healthy, payout_valid, unresolved_severe_risks, premium, new_agent,
           eligibility_reasons_json, formula_version, last_trial_at, last_health_check_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET
          marketplace_status=excluded.marketplace_status, reputation=excluded.reputation,
          reliability_score=excluded.reliability_score, quality_score=excluded.quality_score,
          delivery_score=excluded.delivery_score, response_score=excluded.response_score, history_score=excluded.history_score,
          risk_penalty=excluded.risk_penalty, confidence=excluded.confidence, settled_jobs=excluded.settled_jobs,
          successful_jobs=excluded.successful_jobs, failed_jobs=excluded.failed_jobs, refunded_jobs=excluded.refunded_jobs,
          trial_passed=excluded.trial_passed, endpoint_healthy=excluded.endpoint_healthy, payout_valid=excluded.payout_valid,
          unresolved_severe_risks=excluded.unresolved_severe_risks, premium=excluded.premium, new_agent=excluded.new_agent,
          eligibility_reasons_json=excluded.eligibility_reasons_json, formula_version=excluded.formula_version,
          last_trial_at=excluded.last_trial_at, last_health_check_at=excluded.last_health_check_at, updated_at=excluded.updated_at
      `).bind(
        stats.agentId, stats.marketplaceStatus, stats.reputation, stats.breakdown.reliability, stats.breakdown.quality,
        stats.breakdown.delivery, stats.breakdown.response, stats.breakdown.history, stats.breakdown.riskPenalty,
        stats.confidence, stats.settledJobs, stats.successfulJobs, stats.failedJobs, stats.refundedJobs,
        stats.trialPassed ? 1 : 0, stats.endpointHealthy ? 1 : 0, stats.payoutValid ? 1 : 0,
        stats.unresolvedSevereRisks, stats.premium ? 1 : 0, stats.newAgent ? 1 : 0,
        JSON.stringify(stats.eligibilityReasons), stats.formulaVersion, stats.lastTrialAt, stats.lastHealthCheckAt, stats.updatedAt,
      ),
      this.db.prepare(`
        INSERT INTO agent_reputation_snapshots
          (id, agent_id, evaluated_at, formula_version, event_count, reputation, breakdown_json, confidence,
           marketplace_status, reasons_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id, evaluated_at, formula_version) DO UPDATE SET
          event_count=excluded.event_count, reputation=excluded.reputation,
          breakdown_json=excluded.breakdown_json, confidence=excluded.confidence,
          marketplace_status=excluded.marketplace_status, reasons_json=excluded.reasons_json,
          created_at=excluded.created_at
      `).bind(snapshotId, agentId, evaluatedAt, stats.formulaVersion, events.length, stats.reputation,
        JSON.stringify(stats.breakdown), stats.confidence, stats.marketplaceStatus, JSON.stringify(stats.eligibilityReasons), evaluatedAt),
    ]);
    return stats;
  }

  async recordAgentMetricEvent(event: AgentMetricEvent, evaluatedAt: string): Promise<AgentMetricRecordResult> {
    const result = await this.db.prepare(`
      INSERT OR IGNORE INTO agent_metric_events
        (id, idempotency_key, agent_id, event_type, value, weight, severity, source_type, source_id, detail_json, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(event.id, event.idempotencyKey, event.agentId, event.type, event.value, event.weight, event.severity,
      event.sourceType, event.sourceId, JSON.stringify(event.detail), event.occurredAt, event.createdAt).run();
    const applied = result.meta.changes > 0;
    return { applied, stats: await this.recomputeAgentQuality(event.agentId, evaluatedAt) };
  }

  async listAgentReputationSnapshots(agentId: string, limit = 20): Promise<AgentReputationSnapshot[]> {
    const { results } = await this.db.prepare('SELECT * FROM agent_reputation_snapshots WHERE agent_id = ? ORDER BY evaluated_at DESC, id DESC LIMIT ?')
      .bind(agentId, Math.max(1, Math.min(100, limit))).all<Row>();
    return results.map(mapAgentReputationSnapshot);
  }

  async saveAgentFeedback(feedback: AgentFeedback, evaluatedAt: string): Promise<{ feedback: AgentFeedback; stats: AgentQualityStats | null }> {
    const current = await this.getAgentFeedback(feedback.missionId, feedback.stageId, feedback.agentId);
    const version = (current?.version ?? 0) + 1;
    const saved = { ...feedback, version };
    const score = ((saved.deliveryQuality + saved.requirementsFit + saved.communication + (saved.onTime ? 5 : 1) + (saved.reuse ? 5 : 1)) / 25) * 100;
    const priorFeedback = await this.db.prepare(`
      SELECT COUNT(*) AS count FROM agent_feedback
      WHERE agent_id = ? AND requester_id = ? AND effective = 1
        AND NOT (mission_id = ? AND stage_id = ?)
    `).bind(saved.agentId, saved.requesterId, saved.missionId, saved.stageId).first<{ count: number }>();
    const feedbackWeight = feedbackWeightForPriorCount(number(priorFeedback?.count));
    const metric: AgentMetricEvent = {
      id: `AGMETRIC-${crypto.randomUUID()}`, idempotencyKey: `feedback:${saved.id}`, agentId: saved.agentId,
      type: 'feedback_received', value: score, weight: feedbackWeight, severity: 'info', sourceType: 'feedback',
      sourceId: `${saved.missionId}:${saved.stageId}:${saved.agentId}`, detail: { feedbackId: saved.id, version, feedbackWeight },
      occurredAt: saved.createdAt, createdAt: saved.createdAt,
    };
    await this.db.batch([
      this.db.prepare('UPDATE agent_feedback SET effective = 0 WHERE mission_id = ? AND stage_id = ? AND agent_id = ? AND effective = 1')
        .bind(saved.missionId, saved.stageId, saved.agentId),
      this.db.prepare(`
        INSERT INTO agent_feedback
          (id, agent_id, mission_id, stage_id, requester_id, version, delivery_quality, requirements_fit,
           communication, on_time, reuse_agent, comment, effective, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(saved.id, saved.agentId, saved.missionId, saved.stageId, saved.requesterId, saved.version,
        saved.deliveryQuality, saved.requirementsFit, saved.communication, saved.onTime ? 1 : 0, saved.reuse ? 1 : 0,
        saved.comment, saved.effective ? 1 : 0, saved.createdAt),
      this.db.prepare(`
        INSERT INTO agent_metric_events
          (id, idempotency_key, agent_id, event_type, value, weight, severity, source_type, source_id, detail_json, occurred_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(metric.id, metric.idempotencyKey, metric.agentId, metric.type, metric.value, metric.weight, metric.severity,
        metric.sourceType, metric.sourceId, JSON.stringify(metric.detail), metric.occurredAt, metric.createdAt),
    ]);
    return { feedback: saved, stats: await this.recomputeAgentQuality(saved.agentId, evaluatedAt) };
  }

  async getAgentFeedback(missionId: string, stageId: string, agentId: string): Promise<AgentFeedback | null> {
    const row = await this.db.prepare(`
      SELECT * FROM agent_feedback WHERE mission_id = ? AND stage_id = ? AND agent_id = ? AND effective = 1
      ORDER BY version DESC LIMIT 1
    `).bind(missionId, stageId, agentId).first<Row>();
    return row ? mapAgentFeedback(row) : null;
  }

  async listAgentFeedback(agentId: string, limit = 50): Promise<AgentFeedback[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM agent_feedback WHERE agent_id = ? AND effective = 1 ORDER BY created_at DESC, id DESC LIMIT ?
    `).bind(agentId, Math.max(1, Math.min(100, limit))).all<Row>();
    return results.map(mapAgentFeedback);
  }

  async listMissions(user: UserContext): Promise<Mission[]> {
    if (user.role === 'admin') {
      const { results } = await this.db.prepare(`SELECT m.*, ${missionRuntimeColumns} FROM missions m LEFT JOIN mission_runtime_controls c ON c.mission_id = m.id ORDER BY m.created_at DESC LIMIT 200`).all<Row>();
      return results.map(mapMission);
    }
    if (user.role === 'developer') {
      const { results } = await this.db.prepare(`
        SELECT DISTINCT m.*, ${missionRuntimeColumns} FROM missions m
        LEFT JOIN mission_runtime_controls c ON c.mission_id = m.id
        JOIN workflow_stages s ON s.mission_id = m.id
        JOIN agents a ON a.id = s.agent_id
        WHERE a.owner_id = ?
        ORDER BY m.created_at DESC LIMIT 200
      `).bind(user.id).all<Row>();
      return results.map(mapMission);
    }
    const { results } = await this.db.prepare(`SELECT m.*, ${missionRuntimeColumns} FROM missions m LEFT JOIN mission_runtime_controls c ON c.mission_id = m.id WHERE m.requester_id = ? ORDER BY m.created_at DESC LIMIT 200`).bind(user.id).all<Row>();
    return results.map(mapMission);
  }

  async listMissionsAwaitingOutcome(limit:number):Promise<Mission[]> {
    const {results}=await this.db.prepare(`SELECT m.*, ${missionRuntimeColumns} FROM missions m
      LEFT JOIN mission_runtime_controls c ON c.mission_id=m.id
      WHERE m.status='running' AND m.cancelled_at IS NULL AND c.paused_at IS NULL
      AND EXISTS (SELECT 1 FROM mission_delivery_policies p WHERE p.mission_id=m.id AND p.policy='outcome_v1')
      AND EXISTS (SELECT 1 FROM workflow_stages s WHERE s.mission_id=m.id AND s.node_type='task')
      AND NOT EXISTS (SELECT 1 FROM workflow_stages s WHERE s.mission_id=m.id AND s.status<>'done')
      AND NOT EXISTS (SELECT 1 FROM workflow_stages s LEFT JOIN agents a ON a.id=s.agent_id WHERE s.mission_id=m.id AND s.node_type='task'
        AND (a.id IS NULL OR a.official<>1 OR a.endpoint_url NOT LIKE 'agentmesh://builtin/%'))
      ORDER BY m.updated_at,m.id LIMIT ?`).bind(limit).all<Row>();return results.map(mapMission);
  }

  async getMission(id: string): Promise<Mission | null> {
    const row = await this.db.prepare(`SELECT m.*, ${missionRuntimeColumns} FROM missions m LEFT JOIN mission_runtime_controls c ON c.mission_id = m.id WHERE m.id = ?`).bind(id).first<Row>();
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
      this.db.prepare('INSERT INTO mission_delivery_policies (mission_id, policy) VALUES (?, ?)').bind(mission.id, mission.deliveryPolicy ?? 'legacy'),
      ...stages.map((stage) => stageInsert(this.db, stage)),
      ...edges.map((edge) => edgeInsert(this.db, edge)),
      ...edges.map((edge) => edgeRuleInsert(this.db, edge)),
      this.db.prepare(`
        INSERT INTO escrows
          (id, mission_id, amount, token, network, payment_method, yield_enabled, platform_fee_rate, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0.004, 'pending', ?, ?)
      `).bind(
        `ESC-${mission.id}`, mission.id, mission.budget, payment.token, payment.network,
        mission.paymentMethod, mission.yieldEnabled ? 1 : 0, mission.createdAt, mission.updatedAt,
      ),
      this.db.prepare(`
        INSERT OR IGNORE INTO mission_runtime_controls (mission_id, updated_at) VALUES (?, ?)
      `).bind(mission.id, mission.createdAt),
    ];
    await this.db.batch(statements);
    return mission;
  }

  async rescheduleMission(id: string, requesterId: string, deadline: string, expectedVersion: number, now: string): Promise<WorkflowDraftSaveResult> {
    const token = crypto.randomUUID();
    const results = await this.db.batch([
      this.db.prepare(`UPDATE missions SET deadline=?, workflow_version=workflow_version+1, workflow_save_token=?,
        team_json='[]', compiled_spec_json=NULL, status='matching', current_stage='截止时间已更新，请重新确认团队', updated_at=?
        WHERE id=? AND requester_id=? AND workflow_version=? AND status IN ('draft','matching')
        AND EXISTS (SELECT 1 FROM escrows WHERE mission_id=missions.id AND status='pending')`)
        .bind(deadline,token,now,id,requesterId,expectedVersion),
      this.db.prepare(`INSERT OR IGNORE INTO stage_offer_quote_history
        (id,mission_id,stage_id,agent_id,status,amount,snapshot_json,expires_at,responded_at,created_at,archived_at)
        SELECT o.id,o.mission_id,o.stage_id,o.agent_id,o.status,COALESCE(q.amount,s.budget_usdc),COALESCE(q.snapshot_json,'{}'),o.expires_at,o.responded_at,o.created_at,?
        FROM stage_offers o LEFT JOIN stage_offer_quotes q ON q.offer_id=o.id LEFT JOIN workflow_stages s ON s.id=o.stage_id
        WHERE o.mission_id=? AND EXISTS (SELECT 1 FROM missions WHERE id=? AND workflow_save_token=?)`).bind(now,id,id,token),
      this.db.prepare(`DELETE FROM stage_offers WHERE mission_id=? AND EXISTS (SELECT 1 FROM missions WHERE id=? AND workflow_save_token=?)`).bind(id,id,token),
      this.db.prepare(`UPDATE escrows SET amount=(SELECT budget_usdc FROM missions WHERE id=?),updated_at=?
        WHERE mission_id=? AND status='pending' AND EXISTS (SELECT 1 FROM missions WHERE id=? AND workflow_save_token=?)`).bind(id,now,id,id,token),
      this.db.prepare(`INSERT INTO execution_events (id,mission_id,stage_id,event_type,message,actor_type,actor_id,payload_json,created_at)
        SELECT ?,?,NULL,'mission.rescheduled','截止时间已更新，旧邀请失效','requester',?,?,?
        WHERE EXISTS (SELECT 1 FROM missions WHERE id=? AND workflow_save_token=?)`)
        .bind(`EVT-${token}`,id,requesterId,JSON.stringify({deadline,previousWorkflowVersion:expectedVersion}),now,id,token),
    ]);
    const mission = await this.getMission(id);
    if (!mission) return {state:'missing'};
    if (Number(results[0]?.meta?.changes ?? 0)) return {state:'saved',mission};
    if (!['draft','matching'].includes(mission.status) || (await this.getEscrow(id))?.status!=='pending') return {state:'locked'};
    return {state:'version_conflict'};
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
        INSERT OR IGNORE INTO stage_offer_quote_history
          (id, mission_id, stage_id, agent_id, status, amount, snapshot_json,
           expires_at, responded_at, created_at, archived_at)
        SELECT offers.id, offers.mission_id, offers.stage_id, offers.agent_id, offers.status,
          COALESCE(quotes.amount, stages.budget_usdc), COALESCE(quotes.snapshot_json, '{}'),
          offers.expires_at, offers.responded_at, offers.created_at, datetime('now')
        FROM stage_offers offers
        LEFT JOIN stage_offer_quotes quotes ON quotes.offer_id = offers.id
        LEFT JOIN workflow_stages stages ON stages.id = offers.stage_id
        WHERE offers.mission_id = ?
          AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      `).bind(id, id, saveToken),
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
      ...edges.map((edge) => guardedEdgeRuleInsert(this.db, edge, saveToken)),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) {
      const [currentMission, currentEscrow] = await Promise.all([this.getMission(id), this.getEscrow(id)]);
      if (!currentMission) return { state: 'missing' };
      if (!['draft', 'matching'].includes(currentMission.status) || currentEscrow?.status !== 'pending') return { state: 'locked' };
      return { state: 'version_conflict' };
    }
    return { state: 'saved', mission: (await this.getMission(id))! };
  }

  async confirmWorkflow(id: string, stages: WorkflowStage[], team: string[], offers: StageOffer[], expectedVersion?: number): Promise<Mission | null> {
    const mission = await this.getMission(id);
    const confirmationVersion = expectedVersion ?? mission?.workflowVersion ?? 0;
    const token = paymentConfig(mission?.paymentMethod ?? 'web2_balance').token;
    const normalizedOffers = offers.map((offer) => {
      if (offer.quote) return offer;
      const stageBudget = stages.find((stage) => stage.id === offer.stageId)?.budget ?? 0;
      return {
        ...offer,
        quote: {
          amount: stageBudget,
          token,
          basePriceUsdc: 0,
          agentPriceVersion: 1,
          formulaVersion: 'legacy.stage-budget',
          comparableToBasePrice: false,
          multipliers: { complexity: 1, urgency: 1, expertise: 1, load: 1 },
        },
      } satisfies StageOffer;
    });
    const quotedAmount = Number(normalizedOffers.reduce((sum, offer) => sum + offer.quote.amount, 0).toFixed(6));
    const pricingUpdatedAt = normalizedOffers[0]?.createdAt ?? new Date().toISOString();
    const confirmToken = crypto.randomUUID();
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE missions SET team_json = ?, workflow_save_token = ?, workflow_version = workflow_version + 1,
          status = 'matching', current_stage = '接单邀请已发送，等待 Agent 确认', updated_at = datetime('now')
        WHERE id = ? AND workflow_version = ? AND status IN ('draft', 'matching')
          AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = missions.id AND status = 'pending')
          AND (
            NOT EXISTS (SELECT 1 FROM stage_offers WHERE mission_id = missions.id)
            OR EXISTS (
              SELECT 1 FROM stage_offers
              WHERE mission_id = missions.id
                AND (status = 'declined' OR (status = 'pending' AND julianday(expires_at) <= julianday(?)))
            )
          )
      `).bind(JSON.stringify(team), confirmToken, id, confirmationVersion, pricingUpdatedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO stage_offer_quote_history
          (id, mission_id, stage_id, agent_id, status, amount, snapshot_json,
           expires_at, responded_at, created_at, archived_at)
        SELECT offers.id, offers.mission_id, offers.stage_id, offers.agent_id, offers.status,
          COALESCE(quotes.amount, stages.budget_usdc), COALESCE(quotes.snapshot_json, '{}'),
          offers.expires_at, offers.responded_at, offers.created_at, ?
        FROM stage_offers offers
        LEFT JOIN stage_offer_quotes quotes ON quotes.offer_id = offers.id
        LEFT JOIN workflow_stages stages ON stages.id = offers.stage_id
        WHERE offers.mission_id = ?
          AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      `).bind(pricingUpdatedAt, id, id, confirmToken),
      this.db.prepare(`
        DELETE FROM stage_offers WHERE mission_id = ?
          AND EXISTS (SELECT 1 FROM missions WHERE id = ? AND workflow_save_token = ?)
      `).bind(id, id, confirmToken),
      ...stages.map((stage) => this.db.prepare(`
        UPDATE workflow_stages SET agent_id = ?, updated_at = ?
        WHERE id = ? AND mission_id = ?
          AND EXISTS (SELECT 1 FROM escrows WHERE mission_id = workflow_stages.mission_id AND status = 'pending')
          AND EXISTS (SELECT 1 FROM missions WHERE id = workflow_stages.mission_id AND workflow_save_token = ?)
      `).bind(stage.agentId, stage.updatedAt, stage.id, id, confirmToken)),
      ...normalizedOffers.flatMap((offer) => [stageOfferInsert(this.db, offer, confirmToken), stageOfferQuoteInsert(this.db, offer, confirmToken)]),
      this.db.prepare(`
        UPDATE escrows SET amount = CASE WHEN ? > 0 THEN ? ELSE amount END, updated_at = ?
        WHERE mission_id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM missions WHERE id = escrows.mission_id AND workflow_save_token = ?)
      `).bind(quotedAmount, quotedAmount, pricingUpdatedAt, id, confirmToken),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
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
    const escrow = await this.getEscrow(id);
    if (!escrow) return null;
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
      `).bind(crypto.randomUUID(), `${id}:wallet:hold`, requesterId, -escrow.amount, id, startedAt, id, startedAt));
    }
    statements.push(
      this.db.prepare(`
        UPDATE escrows SET status = 'held', deposit_tx_hash = COALESCE(?, deposit_tx_hash),
          payout_hash = COALESCE(?, payout_hash),
          requester_wallet_address = COALESCE(?, requester_wallet_address), updated_at = ?
        WHERE mission_id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM missions WHERE id = escrows.mission_id AND status = 'running' AND updated_at = ?)
      `).bind(depositTxHash, payoutHash, requesterWalletAddress?.toLocaleLowerCase() ?? null, startedAt, id, startedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO mission_runtime_controls (mission_id, updated_at)
        SELECT id, ? FROM missions WHERE id = ? AND status = 'running'
      `).bind(startedAt, id),
      this.db.prepare(`
        INSERT OR IGNORE INTO workflow_stage_attempts
          (id, mission_id, stage_id, attempt_no, status, input_json, output_json, is_current,
           started_at, completed_at, created_at, updated_at)
        SELECT 'ATTEMPT-' || s.id || '-1', s.mission_id, s.id, 1, s.status, s.input_json, s.output_json, 1,
          CASE WHEN s.status IN ('running', 'done', 'failed') THEN ? ELSE NULL END,
          CASE WHEN s.status IN ('done', 'failed') THEN ? ELSE NULL END,
          ?, ?
        FROM workflow_stages s JOIN missions m ON m.id = s.mission_id
        WHERE s.mission_id = ? AND m.status = 'running'
      `).bind(startedAt, startedAt, startedAt, startedAt, id),
    );
    const results = await this.db.batch(statements);
    const saved = await this.getMission(id);
    return saved ? { mission: saved, applied: Number(results[0]?.meta?.changes ?? 0) > 0 } : null;
  }

  async submitMissionForReview(id: string, reviewDueAt: string): Promise<Mission | null> {
    await this.db.prepare(`
      UPDATE missions SET status = 'review', progress = 100, current_stage = '等待验收', review_due_at = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'running' AND cancelled_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM mission_runtime_controls c WHERE c.mission_id = missions.id AND c.paused_at IS NOT NULL)
    `).bind(reviewDueAt, id).run();
    return this.getMission(id);
  }

  async pauseMission(id: string, actorId: string, mode: MissionPauseMode, reason: string, pausedAt: string) {
    await this.db.prepare(`
      INSERT OR IGNORE INTO mission_runtime_controls (mission_id, updated_at)
      SELECT id, ? FROM missions WHERE id = ?
    `).bind(pausedAt, id).run();
    const token = crypto.randomUUID();
    const eventId = `EVT-${crypto.randomUUID()}`;
    const checkpointId = `CHECKPOINT-${crypto.randomUUID()}`;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE mission_runtime_controls SET
          paused_at = ?, paused_by = ?, pause_reason = ?, pause_mode = ?,
          scheduler_revision = scheduler_revision + 1, scheduler_state = 'clean',
          checkpoint_sequence = checkpoint_sequence + 1, mutation_token = ?, updated_at = ?
        WHERE mission_id = ?
          AND (paused_at IS NULL OR (? = 'emergency' AND pause_mode = 'requester'))
          AND EXISTS (
            SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
            WHERE m.id = mission_runtime_controls.mission_id AND m.status = 'running'
              AND m.cancelled_at IS NULL AND e.status = 'held'
          )
      `).bind(pausedAt, actorId, reason, mode, token, pausedAt, id, mode),
      this.db.prepare(`
        INSERT INTO execution_events
          (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
        SELECT ?, ?, NULL, 'mission.paused', ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(
        eventId, id, mode === 'emergency' ? '管理员已紧急暂停任务' : '任务方已暂停执行',
        mode === 'emergency' ? 'platform' : 'requester', actorId, JSON.stringify({ mode, reason }), pausedAt, id, token,
      ),
      this.db.prepare(`
        INSERT INTO workflow_checkpoints
          (id, mission_id, sequence, kind, workflow_version, scheduler_revision, change_version,
           scheduler_state, payload_json, created_by, created_at)
        SELECT ?, c.mission_id, c.checkpoint_sequence, 'pause', m.workflow_version, c.scheduler_revision,
          c.change_version, c.scheduler_state, ?, ?, ?
        FROM mission_runtime_controls c JOIN missions m ON m.id = c.mission_id
        WHERE c.mission_id = ? AND c.mutation_token = ?
      `).bind(checkpointId, JSON.stringify({ mode, reason }), actorId, pausedAt, id, token),
    ]);
    const mission = await this.getMission(id);
    if (Number(results[0]?.meta?.changes ?? 0) > 0 && mission) {
      return { state: 'applied' as const, mission, schedulerRevision: mission.schedulerRevision };
    }
    return mission?.status === 'paused'
      ? { state: 'unchanged' as const, mission }
      : { state: 'invalid' as const, mission };
  }

  async resumeMission(
    id: string,
    actorId: string,
    expectedMode: MissionPauseMode,
    expectedSchedulerRevision: number,
    resumedAt: string,
  ) {
    const before = await this.getMission(id);
    const token = crypto.randomUUID();
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE mission_runtime_controls SET
          paused_at = NULL, paused_by = NULL, pause_reason = NULL, pause_mode = NULL,
          scheduler_revision = scheduler_revision + 1, scheduler_state = 'dirty',
          checkpoint_sequence = checkpoint_sequence + 1, mutation_token = ?, updated_at = ?
        WHERE mission_id = ? AND paused_at IS NOT NULL AND pause_mode = ? AND scheduler_revision = ?
          AND EXISTS (
            SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
            WHERE m.id = mission_runtime_controls.mission_id AND m.status = 'running'
              AND m.cancelled_at IS NULL AND e.status = 'held'
          )
      `).bind(token, resumedAt, id, expectedMode, expectedSchedulerRevision),
      this.db.prepare(`
        INSERT INTO execution_events
          (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
        SELECT ?, ?, NULL, 'mission.resumed', '任务执行已恢复', ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(
        `EVT-${crypto.randomUUID()}`, id, expectedMode === 'emergency' ? 'platform' : 'requester', actorId,
        JSON.stringify({ mode: expectedMode, pausedAt: before?.pausedAt, reason: before?.pauseReason }), resumedAt, id, token,
      ),
      this.db.prepare(`
        INSERT INTO workflow_checkpoints
          (id, mission_id, sequence, kind, workflow_version, scheduler_revision, change_version,
           scheduler_state, payload_json, created_by, created_at)
        SELECT ?, c.mission_id, c.checkpoint_sequence, 'resume', m.workflow_version, c.scheduler_revision,
          c.change_version, c.scheduler_state, ?, ?, ?
        FROM mission_runtime_controls c JOIN missions m ON m.id = c.mission_id
        WHERE c.mission_id = ? AND c.mutation_token = ?
      `).bind(
        `CHECKPOINT-${crypto.randomUUID()}`,
        JSON.stringify({ mode: expectedMode, pausedAt: before?.pausedAt, reason: before?.pauseReason }),
        actorId, resumedAt, id, token,
      ),
    ]);
    const mission = await this.getMission(id);
    if (Number(results[0]?.meta?.changes ?? 0) > 0 && mission) {
      return { state: 'applied' as const, mission, schedulerRevision: mission.schedulerRevision };
    }
    return mission?.status !== 'paused' && mission
      ? { state: 'unchanged' as const, mission }
      : { state: 'invalid' as const, mission };
  }

  async applyMissionChangeRequest(input: {
    id: string; missionId: string; targetStageIds: string[]; resetStageIds: string[];
    reason: string; acceptanceCriteria: string; requestedBy: string; createdAt: string;
    expectedRunningStageIds?: string[];
  }) {
    const resetIds = [...new Set(input.resetStageIds)];
    const targetIds = [...new Set(input.targetStageIds)];
    const expectedRunningIds = [...new Set(input.expectedRunningStageIds ?? [])];
    const expectedRunningSqlIds = expectedRunningIds.length ? expectedRunningIds : [''];
    const stages = await this.listStages(input.missionId);
    const resetStages = stages.filter((stage) => resetIds.includes(stage.id));
    const priorStageState = resetStages.map((stage) => ({
      stageId: stage.id, attemptNo: stage.attemptNo, status: stage.status,
      progress: stage.progress, input: stage.input, output: stage.output,
    }));
    const nextInputByStageId = new Map(resetStages.map((stage) => [stage.id, {
      ...stage.input,
      rework: {
        changeRequestId: input.id,
        reason: input.reason,
        acceptanceCriteria: input.acceptanceCriteria,
        targetStageIds: input.targetStageIds,
        isTarget: targetIds.includes(stage.id),
        requestedAt: input.createdAt,
      },
    }]));
    const missionBefore = await this.getMission(input.missionId);
    if (!resetIds.length || !targetIds.length || priorStageState.length !== resetIds.length
      || expectedRunningIds.some((stageId) => !resetIds.includes(stageId))
      || expectedRunningIds.some((stageId) => {
        const stage = resetStages.find((candidate) => candidate.id === stageId);
        return stage?.status !== 'running' || stage.nodeType !== 'approval';
      })) {
      return { state: 'invalid' as const, mission: missionBefore };
    }
    if (priorStageState.some((stage) => stage.status === 'running' && !expectedRunningIds.includes(stage.stageId))) {
      return missionBefore ? { state: 'blocked_running_stage' as const, mission: missionBefore } : { state: 'invalid' as const, mission: null };
    }
    const token = crypto.randomUUID();
    const placeholders = resetIds.map(() => '?').join(',');
    const targetPlaceholders = targetIds.map(() => '?').join(',');
    const expectedRunningPlaceholders = expectedRunningSqlIds.map(() => '?').join(',');
    const statements: D1Statement[] = [
      this.db.prepare(`
        UPDATE mission_runtime_controls SET
          change_version = change_version + 1, scheduler_revision = scheduler_revision + 1,
          scheduler_state = 'dirty', checkpoint_sequence = checkpoint_sequence + 1,
          mutation_token = ?, updated_at = ?
        WHERE mission_id = ?
          AND EXISTS (
            SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
            WHERE m.id = mission_runtime_controls.mission_id
              AND (m.status = 'review' OR (m.status = 'running' AND mission_runtime_controls.paused_at IS NOT NULL))
              AND m.cancelled_at IS NULL AND e.status = 'held'
          )
          AND NOT EXISTS (
            SELECT 1 FROM workflow_stages s
            WHERE s.mission_id = mission_runtime_controls.mission_id
              AND s.id IN (${placeholders}) AND s.status = 'running'
              AND s.id NOT IN (${expectedRunningPlaceholders})
          )
          AND (
            SELECT COUNT(*) FROM workflow_stages s
            WHERE s.mission_id = mission_runtime_controls.mission_id
              AND s.id IN (${expectedRunningPlaceholders})
              AND s.status = 'running' AND s.node_type = 'approval'
          ) = ?
          AND NOT EXISTS (
            SELECT 1 FROM workflow_stages s
            WHERE s.mission_id = mission_runtime_controls.mission_id
              AND s.id IN (${expectedRunningPlaceholders})
              AND (s.status <> 'running' OR s.node_type <> 'approval')
          )
          AND NOT EXISTS (
            SELECT 1 FROM workflow_stages s
            WHERE s.mission_id = mission_runtime_controls.mission_id
              AND s.id IN (${targetPlaceholders}) AND s.status NOT IN ('done', 'failed')
          )
      `).bind(
        token, input.createdAt, input.missionId,
        ...resetIds, ...expectedRunningSqlIds,
        ...expectedRunningSqlIds, expectedRunningIds.length,
        ...expectedRunningSqlIds, ...targetIds,
      ),
      this.db.prepare(`
        INSERT INTO mission_change_requests
          (id, mission_id, version, target_stage_ids_json, reset_stage_ids_json, reason,
           acceptance_criteria, requested_by, prior_stage_state_json, created_at)
        SELECT ?, c.mission_id, c.change_version, ?, ?, ?, ?, ?, ?, ?
        FROM mission_runtime_controls c WHERE c.mission_id = ? AND c.mutation_token = ?
      `).bind(
        input.id, JSON.stringify(input.targetStageIds), JSON.stringify(resetIds), input.reason,
        input.acceptanceCriteria, input.requestedBy, JSON.stringify(priorStageState), input.createdAt,
        input.missionId, token,
      ),
      this.db.prepare(`
        INSERT OR IGNORE INTO workflow_stage_attempts
          (id, mission_id, stage_id, attempt_no, status, input_json, output_json, is_current,
           started_at, completed_at, created_at, updated_at)
        SELECT ? || s.id, s.mission_id, s.id, 1, s.status, s.input_json, s.output_json, 1,
          CASE WHEN s.status IN ('running', 'done', 'failed') THEN s.created_at ELSE NULL END,
          CASE WHEN s.status IN ('done', 'failed') THEN s.updated_at ELSE NULL END,
          s.created_at, s.updated_at
        FROM workflow_stages s
        WHERE s.mission_id = ? AND s.id IN (${placeholders})
          AND NOT EXISTS (SELECT 1 FROM workflow_stage_attempts a WHERE a.stage_id = s.id)
          AND EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(`ATTEMPT-legacy-${crypto.randomUUID()}-`, input.missionId, ...resetIds, input.missionId, token),
      this.db.prepare(`
        UPDATE workflow_stage_attempts SET is_current = 0, updated_at = ?
        WHERE mission_id = ? AND stage_id IN (${placeholders}) AND is_current = 1
          AND EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(input.createdAt, input.missionId, ...resetIds, input.missionId, token),
      this.db.prepare(`
        UPDATE workflow_dispatch_outbox SET status = 'done', updated_at = ?
        WHERE mission_id = ? AND stage_id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(input.createdAt, input.missionId, ...resetIds, input.missionId, token),
    ];
    for (const stageId of resetIds) {
      const nextInput = JSON.stringify(nextInputByStageId.get(stageId) ?? {});
      statements.push(this.db.prepare(`
        INSERT INTO workflow_stage_attempts
          (id, mission_id, stage_id, attempt_no, change_request_id, status, input_json,
           output_json, is_current, created_at, updated_at)
        SELECT ?, s.mission_id, s.id,
          COALESCE((SELECT MAX(a.attempt_no) + 1 FROM workflow_stage_attempts a WHERE a.stage_id = s.id), 1),
          ?, 'queued', ?, NULL, 1, ?, ?
        FROM workflow_stages s
        WHERE s.id = ? AND s.mission_id = ?
          AND EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(`ATTEMPT-${crypto.randomUUID()}`, input.id, nextInput, input.createdAt, input.createdAt, stageId, input.missionId, input.missionId, token));
    }
    statements.push(
      this.db.prepare(`
        UPDATE workflow_stages SET status = 'queued', progress = 0, output_json = NULL, updated_at = ?
        WHERE mission_id = ? AND id IN (${placeholders})
          AND EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(input.createdAt, input.missionId, ...resetIds, input.missionId, token),
      this.db.prepare(`
        UPDATE missions SET status = 'running', review_due_at = NULL,
          current_stage = '已创建返工版本，等待重新执行', updated_at = ?
        WHERE id = ? AND status = 'review'
          AND EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(input.createdAt, input.missionId, input.missionId, token),
      this.db.prepare(`
        INSERT INTO execution_events
          (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
        SELECT ?, ?, NULL, 'mission.change_requested', '任务方已创建版本化返工请求', 'requester', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM mission_runtime_controls WHERE mission_id = ? AND mutation_token = ?)
      `).bind(
        `EVT-${crypto.randomUUID()}`, input.missionId, input.requestedBy,
        JSON.stringify({ changeRequestId: input.id, targetStageIds: input.targetStageIds, resetStageIds: resetIds, reason: input.reason, acceptanceCriteria: input.acceptanceCriteria }),
        input.createdAt, input.missionId, token,
      ),
      this.db.prepare(`
        INSERT INTO workflow_checkpoints
          (id, mission_id, sequence, kind, workflow_version, scheduler_revision, change_version,
           scheduler_state, payload_json, created_by, created_at)
        SELECT ?, c.mission_id, c.checkpoint_sequence, 'change_request', m.workflow_version,
          c.scheduler_revision, c.change_version, c.scheduler_state, ?, ?, ?
        FROM mission_runtime_controls c JOIN missions m ON m.id = c.mission_id
        WHERE c.mission_id = ? AND c.mutation_token = ?
      `).bind(
        `CHECKPOINT-${crypto.randomUUID()}`,
        JSON.stringify({ changeRequestId: input.id, targetStageIds: input.targetStageIds, resetStageIds: resetIds }),
        input.requestedBy, input.createdAt, input.missionId, token,
      ),
    );
    const results = await this.db.batch(statements);
    const mission = await this.getMission(input.missionId);
    if (Number(results[0]?.meta?.changes ?? 0) === 0 || !mission) {
      return priorStageState.some((stage) => stage.status === 'running' && !expectedRunningIds.includes(stage.stageId)) && mission
        ? { state: 'blocked_running_stage' as const, mission }
        : { state: 'invalid' as const, mission };
    }
    const changeRequest = (await this.listMissionChangeRequests(input.missionId)).find((item) => item.id === input.id)!;
    return { state: 'applied' as const, mission, changeRequest, schedulerRevision: mission.schedulerRevision };
  }

  async listMissionChangeRequests(missionId: string): Promise<MissionChangeRequest[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM mission_change_requests WHERE mission_id = ? ORDER BY version DESC
    `).bind(missionId).all<Row>();
    return results.map(mapMissionChangeRequest);
  }

  async listWorkflowCheckpoints(missionId: string, limit = 50): Promise<WorkflowCheckpoint[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM workflow_checkpoints WHERE mission_id = ? ORDER BY sequence DESC LIMIT ?
    `).bind(missionId, Math.max(1, Math.min(200, limit))).all<Row>();
    return results.map(mapWorkflowCheckpoint);
  }

  async listDirtyMissionControls(limit = 50): Promise<Array<{ missionId: string; schedulerRevision: number }>> {
    const { results } = await this.db.prepare(`
      SELECT c.mission_id, c.scheduler_revision
      FROM mission_runtime_controls c JOIN missions m ON m.id = c.mission_id
      JOIN escrows e ON e.mission_id = c.mission_id
      WHERE c.scheduler_state = 'dirty' AND c.paused_at IS NULL
        AND m.status IN ('running', 'review') AND m.cancelled_at IS NULL AND e.status = 'held'
      ORDER BY c.updated_at ASC LIMIT ?
    `).bind(Math.max(1, Math.min(200, limit))).all<Row>();
    return results.map((row) => ({ missionId: text(row.mission_id), schedulerRevision: number(row.scheduler_revision) }));
  }

  async markMissionCheckpointClean(missionId: string, schedulerRevision: number, actorId: string | null, reconciledAt: string): Promise<boolean> {
    const token = crypto.randomUUID();
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE mission_runtime_controls SET scheduler_state = 'clean', checkpoint_sequence = checkpoint_sequence + 1,
          mutation_token = ?, updated_at = ?
        WHERE mission_id = ? AND scheduler_revision = ? AND scheduler_state = 'dirty' AND paused_at IS NULL
      `).bind(token, reconciledAt, missionId, schedulerRevision),
      this.db.prepare(`
        INSERT INTO workflow_checkpoints
          (id, mission_id, sequence, kind, workflow_version, scheduler_revision, change_version,
           scheduler_state, payload_json, created_by, created_at)
        SELECT ?, c.mission_id, c.checkpoint_sequence, 'reconciled', m.workflow_version,
          c.scheduler_revision, c.change_version, c.scheduler_state, '{}', ?, ?
        FROM mission_runtime_controls c JOIN missions m ON m.id = c.mission_id
        WHERE c.mission_id = ? AND c.mutation_token = ?
      `).bind(`CHECKPOINT-${crypto.randomUUID()}`, actorId, reconciledAt, missionId, token),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) > 0;
  }

  async acceptMission(id: string, actorId: string, releaseTxHash: string | null, evidenceSnapshot?: MissionEvidenceSnapshot) {
    const mission = await this.getMission(id);
    const escrow = await this.getEscrow(id);
    if (!mission || !escrow) return null;
    const stages = await this.listStages(id);
    const offers = await this.listStageOffers(id);
    const fee = Number((escrow.amount * escrow.platformFeeRate).toFixed(6));
    const stageWeights = new Map(stages.map((stage) => {
      const quoteAmount = offers.find((offer) => offer.stageId === stage.id)?.quote?.amount;
      return [stage.id, Number.isFinite(quoteAmount) && Number(quoteAmount) > 0 ? Number(quoteAmount) : stage.budget];
    }));
    const stageTotal = stages.reduce((sum, stage) => sum + (stageWeights.get(stage.id) ?? 0), 0) || escrow.amount;
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
      this.db.prepare(`
        INSERT OR IGNORE INTO reward_activities
          (id, source_key, user_id, mission_id, dispute_id, role, formula_version, asset, settled_amount, quality_bps,
           penalty_bps, score_micros, eligible, detail_json, occurred_at, created_at)
        SELECT ?, ?, ?, ?, NULL, 'requester', ?, ?, ?, 10000, 0, ?, 1, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = ? AND m.status = 'completed' AND m.updated_at = ?
            AND e.status = 'released' AND e.released_at = ?
        )
      `).bind(
        `YDACT-${id}-requester`, `${id}:settlement:requester`, mission.requesterId, id, REWARD_FORMULA_VERSION, escrow.token,
        escrow.amount, rewardScoreMicros(escrow.amount, 'requester'),
        JSON.stringify({ source: 'mission_settlement', releaseTxHash }), now, now, id, now, now,
      ),
    ];
    if (evidenceSnapshot) {
      statements.push(this.db.prepare(`
        INSERT INTO mission_acceptance_snapshots
          (mission_id, deliverables_json, acceptance_criteria_sha256, workflow_version, scheduler_revision,
           event_watermark, accepted_by, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = ? AND m.status = 'completed' AND m.updated_at = ?
            AND e.status = 'released' AND e.released_at = ?
        )
        ON CONFLICT(mission_id) DO NOTHING
      `).bind(
        evidenceSnapshot.missionId, JSON.stringify(evidenceSnapshot.deliverables), evidenceSnapshot.acceptanceCriteriaSha256,
        evidenceSnapshot.workflowVersion, evidenceSnapshot.schedulerRevision, evidenceSnapshot.eventWatermark,
        evidenceSnapshot.frozenBy, evidenceSnapshot.frozenAt, id, now, now,
      ));
    }
    const payouts = new Map<string, number>();
    for (const stage of stages) {
      if (!stage.agentId) continue;
      const gross = escrow.amount * ((stageWeights.get(stage.id) ?? stage.budget) / stageTotal);
      payouts.set(stage.agentId, (payouts.get(stage.agentId) ?? 0) + gross);
    }
    const walletPayouts = new Map<string, number>();
    const ownerRewards = new Map<string, { amount: number; qualityBps: number; agentIds: string[] }>();
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
      const agent = await this.getAgent(agentId);
      if (agent) {
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
    for (const [ownerId, reward] of ownerRewards) {
      statements.push(this.db.prepare(`
        INSERT OR IGNORE INTO reward_activities
          (id, source_key, user_id, mission_id, dispute_id, role, formula_version, asset, settled_amount, quality_bps,
           penalty_bps, score_micros, eligible, detail_json, occurred_at, created_at)
        SELECT ?, ?, ?, ?, NULL, 'agent_owner', ?, ?, ?, ?, 0, ?, 1, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = ? AND m.status = 'completed' AND m.updated_at = ?
            AND e.status = 'released' AND e.released_at = ?
        )
      `).bind(
        `YDACT-${id}-agent-${ownerId}`, `${id}:settlement:agent_owner:${ownerId}`, ownerId, id,
        REWARD_FORMULA_VERSION, escrow.token, reward.amount, reward.qualityBps, rewardScoreMicros(reward.amount, 'agent_owner', reward.qualityBps),
        JSON.stringify({ source: 'mission_settlement', agentIds: reward.agentIds, releaseTxHash }),
        now, now, id, now, now,
      ));
    }
    const results = await this.db.batch(statements);
    const saved = await this.getMission(id);
    return saved ? { mission: saved, applied: Number(results[0]?.meta?.changes ?? 0) > 0 } : null;
  }

  async listStages(missionId: string): Promise<WorkflowStage[]> {
    const { results } = await this.db.prepare(`
      SELECT s.*, a.attempt_no AS current_attempt_no, a.input_json AS current_attempt_input_json,
        a.created_at AS current_attempt_created_at
      FROM workflow_stages s
      LEFT JOIN workflow_stage_attempts a ON a.stage_id = s.id AND a.is_current = 1
      WHERE s.mission_id = ? ORDER BY s.position ASC
    `).bind(missionId).all<Row>();
    return results.map(mapStage);
  }

  async listEdges(missionId: string): Promise<WorkflowEdge[]> {
    const { results } = await this.db.prepare(`
      SELECT e.*, r.condition_json, r.mappings_json
      FROM workflow_edges e LEFT JOIN workflow_edge_rules r ON r.edge_id = e.id
      WHERE e.mission_id = ? ORDER BY e.created_at ASC, e.id ASC
    `).bind(missionId).all<Row>();
    return results.map(mapEdge);
  }

  async recordWorkflowTransition(checkpoint: WorkflowTransitionCheckpoint): Promise<{ applied: boolean; checkpoint: WorkflowTransitionCheckpoint }> {
    const result = await this.db.prepare(`
      INSERT OR IGNORE INTO workflow_transition_checkpoints
        (id, mission_id, edge_id, source_stage_id, target_stage_id, source_attempt_no,
         workflow_version, matched, mapped_input_json, missing_required_json, error_code, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM workflow_edges e JOIN workflow_stages s ON s.id = e.source_stage_id
        JOIN missions m ON m.id = e.mission_id
        LEFT JOIN workflow_stage_attempts a ON a.stage_id = s.id AND a.is_current = 1
        WHERE e.id = ? AND e.mission_id = ? AND e.source_stage_id = ? AND e.target_stage_id = ?
          AND s.status = 'done' AND COALESCE(a.attempt_no, 1) = ? AND m.workflow_version = ?
      )
    `).bind(
      checkpoint.id, checkpoint.missionId, checkpoint.edgeId, checkpoint.sourceStageId, checkpoint.targetStageId,
      checkpoint.sourceAttemptNo, checkpoint.workflowVersion, checkpoint.matched ? 1 : 0,
      JSON.stringify(checkpoint.mappedInput), JSON.stringify(checkpoint.missingRequired), checkpoint.errorCode, checkpoint.createdAt,
      checkpoint.edgeId, checkpoint.missionId, checkpoint.sourceStageId, checkpoint.targetStageId,
      checkpoint.sourceAttemptNo, checkpoint.workflowVersion,
    ).run();
    const row = await this.db.prepare(`
      SELECT * FROM workflow_transition_checkpoints
      WHERE mission_id = ? AND edge_id = ? AND source_attempt_no = ?
    `).bind(checkpoint.missionId, checkpoint.edgeId, checkpoint.sourceAttemptNo).first<Row>();
    if (!row) throw new Error('WORKFLOW_TRANSITION_CONFLICT');
    return { applied: Number(result.meta.changes) > 0, checkpoint: mapWorkflowTransition(row) };
  }

  async listWorkflowTransitions(missionId: string, limit?: number): Promise<WorkflowTransitionCheckpoint[]> {
    const statement = limit === undefined
      ? this.db.prepare(`
          SELECT * FROM workflow_transition_checkpoints
          WHERE mission_id = ? ORDER BY created_at DESC, edge_id DESC
        `).bind(missionId)
      : this.db.prepare(`
          SELECT * FROM workflow_transition_checkpoints
          WHERE mission_id = ? ORDER BY created_at DESC, edge_id DESC LIMIT ?
        `).bind(missionId, Math.max(1, Math.min(5_000, limit)));
    const { results } = await statement.all<Row>();
    return results.map(mapWorkflowTransition).reverse();
  }

  async listCurrentWorkflowTransitions(missionId: string): Promise<WorkflowTransitionCheckpoint[]> {
    const { results } = await this.db.prepare(`
      SELECT c.* FROM workflow_transition_checkpoints c
      LEFT JOIN workflow_stage_attempts a
        ON a.mission_id = c.mission_id AND a.stage_id = c.source_stage_id AND a.is_current = 1
      WHERE c.mission_id = ? AND COALESCE(a.attempt_no, 1) = c.source_attempt_no
      ORDER BY c.created_at ASC, c.edge_id ASC
    `).bind(missionId).all<Row>();
    return results.map(mapWorkflowTransition);
  }

  private async workflowTemplateDetail(ownerId: string, templateId: string, version?: number): Promise<WorkflowTemplateDetail | null> {
    const row = await this.db.prepare(`
      SELECT t.id AS template_id, t.owner_id, t.name, t.description, t.current_version,
        t.created_at AS template_created_at, t.updated_at,
        v.version, v.nodes_json, v.edges_json, v.entry_ids_json, v.exit_ids_json,
        v.content_hash, v.created_at AS version_created_at
      FROM workflow_templates t JOIN workflow_template_versions v ON v.template_id = t.id
      WHERE t.id = ? AND t.owner_id = ? AND v.version = COALESCE(?, t.current_version)
    `).bind(templateId, ownerId, version ?? null).first<Row>();
    return row ? { template: mapWorkflowTemplate(row), version: mapWorkflowTemplateVersion(row) } : null;
  }

  async saveWorkflowTemplateVersion(input: {
    id: string; ownerId: string; name: string; description: string; nodes: WorkflowStage[]; edges: WorkflowEdge[];
    entryIds: string[]; exitIds: string[]; contentHash: string; createdAt: string;
  }): Promise<WorkflowTemplateSaveResult> {
    const existingTemplate = await this.db.prepare(`
      SELECT * FROM workflow_templates WHERE owner_id = ? AND name = ?
    `).bind(input.ownerId, input.name).first<Row>();
    if (!existingTemplate) {
      const results = await this.db.batch([
        this.db.prepare(`
          INSERT OR IGNORE INTO workflow_templates
            (id, owner_id, name, description, current_version, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `).bind(input.id, input.ownerId, input.name, input.description, input.createdAt, input.createdAt),
        this.db.prepare(`
          INSERT INTO workflow_template_versions
            (template_id, version, nodes_json, edges_json, entry_ids_json, exit_ids_json, content_hash, created_at)
          SELECT ?, 1, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM workflow_templates WHERE id = ? AND owner_id = ? AND current_version = 1)
        `).bind(
          input.id, JSON.stringify(input.nodes), JSON.stringify(input.edges), JSON.stringify(input.entryIds),
          JSON.stringify(input.exitIds), input.contentHash, input.createdAt, input.id, input.ownerId,
        ),
      ]);
      if (Number(results[0]?.meta?.changes ?? 0) === 0) {
        const raced = await this.db.prepare('SELECT id FROM workflow_templates WHERE owner_id = ? AND name = ?')
          .bind(input.ownerId, input.name).first<Row>();
        return { state: 'conflict', detail: raced ? await this.workflowTemplateDetail(input.ownerId, text(raced.id)) : null };
      }
      return { state: 'saved', detail: (await this.workflowTemplateDetail(input.ownerId, input.id))! };
    }

    const templateId = text(existingTemplate.id);
    const expectedVersion = number(existingTemplate.current_version);
    const current = await this.workflowTemplateDetail(input.ownerId, templateId, expectedVersion);
    if (current?.version.contentHash === input.contentHash && current.template.description === input.description) {
      return { state: 'unchanged', detail: current };
    }
    const nextVersion = expectedVersion + 1;
    try {
      const results = await this.db.batch([
        this.db.prepare(`
          UPDATE workflow_templates SET current_version = ?, description = ?, updated_at = ?
          WHERE id = ? AND owner_id = ? AND current_version = ?
        `).bind(nextVersion, input.description, input.createdAt, templateId, input.ownerId, expectedVersion),
        this.db.prepare(`
          INSERT INTO workflow_template_versions
            (template_id, version, nodes_json, edges_json, entry_ids_json, exit_ids_json, content_hash, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM workflow_templates WHERE id = ? AND owner_id = ? AND current_version = ?
          )
        `).bind(
          templateId, nextVersion, JSON.stringify(input.nodes), JSON.stringify(input.edges), JSON.stringify(input.entryIds),
          JSON.stringify(input.exitIds), input.contentHash, input.createdAt, templateId, input.ownerId, nextVersion,
        ),
      ]);
      if (Number(results[0]?.meta?.changes ?? 0) === 0) {
        return { state: 'conflict', detail: await this.workflowTemplateDetail(input.ownerId, templateId) };
      }
      return { state: 'saved', detail: (await this.workflowTemplateDetail(input.ownerId, templateId, nextVersion))! };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique|constraint/i.test(message)) {
        return { state: 'conflict', detail: await this.workflowTemplateDetail(input.ownerId, templateId) };
      }
      throw error;
    }
  }

  async listWorkflowTemplates(ownerId: string): Promise<WorkflowTemplateDetail[]> {
    const { results } = await this.db.prepare(`
      SELECT t.id AS template_id, t.owner_id, t.name, t.description, t.current_version,
        t.created_at AS template_created_at, t.updated_at,
        v.version, v.nodes_json, v.edges_json, v.entry_ids_json, v.exit_ids_json,
        v.content_hash, v.created_at AS version_created_at
      FROM workflow_templates t JOIN workflow_template_versions v
        ON v.template_id = t.id AND v.version = t.current_version
      WHERE t.owner_id = ? ORDER BY t.updated_at DESC, t.id ASC
    `).bind(ownerId).all<Row>();
    return results.map((row) => ({ template: mapWorkflowTemplate(row), version: mapWorkflowTemplateVersion(row) }));
  }

  async getWorkflowTemplate(ownerId: string, templateId: string, version?: number): Promise<WorkflowTemplateDetail | null> {
    return this.workflowTemplateDetail(ownerId, templateId, version);
  }

  async listStageOffers(missionId: string, now = new Date().toISOString()): Promise<StageOffer[]> {
    const { results } = await this.db.prepare(`
      SELECT offers.*, quotes.amount AS quote_amount, quotes.snapshot_json AS pricing_snapshot_json,
        stages.budget_usdc AS stage_budget, escrows.token AS escrow_token
      FROM stage_offers offers
      LEFT JOIN stage_offer_quotes quotes ON quotes.offer_id = offers.id
      LEFT JOIN workflow_stages stages ON stages.id = offers.stage_id
      LEFT JOIN escrows ON escrows.mission_id = offers.mission_id
      WHERE offers.mission_id = ? ORDER BY offers.created_at ASC, offers.id ASC
    `).bind(missionId).all<Row>();
    return results.map((row) => mapStageOffer(row, now));
  }

  async getStageOffer(id: string, now = new Date().toISOString()): Promise<StageOffer | null> {
    const row = await this.db.prepare(`
      SELECT offers.*, quotes.amount AS quote_amount, quotes.snapshot_json AS pricing_snapshot_json,
        stages.budget_usdc AS stage_budget, escrows.token AS escrow_token
      FROM stage_offers offers
      LEFT JOIN stage_offer_quotes quotes ON quotes.offer_id = offers.id
      LEFT JOIN workflow_stages stages ON stages.id = offers.stage_id
      LEFT JOIN escrows ON escrows.mission_id = offers.mission_id
      WHERE offers.id = ?
    `).bind(id).first<Row>();
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
    const offer = await this.getStageOffer(id, respondedAt);
    if (!offer) return null;
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
    const claimedAt = new Date().toISOString();
    const results = await this.db.batch([this.db.prepare(`
      UPDATE workflow_stages SET status = 'running', progress = MAX(progress, 1), updated_at = datetime('now')
      WHERE id = ? AND mission_id = ? AND status IN ('queued', 'failed') AND node_type = 'task' AND agent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = workflow_stages.mission_id AND m.status = 'running'
            AND m.cancelled_at IS NULL AND e.status = 'held'
        )
        AND NOT EXISTS (
          SELECT 1 FROM mission_runtime_controls c
          WHERE c.mission_id = workflow_stages.mission_id AND c.paused_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM workflow_edges edge
          JOIN workflow_stages source ON source.id = edge.source_stage_id
          WHERE edge.mission_id = workflow_stages.mission_id
            AND edge.target_stage_id = workflow_stages.id
            AND source.status <> 'done'
        )
        AND NOT EXISTS (
          SELECT 1 FROM workflow_transition_checkpoints checkpoint
          JOIN workflow_stages source ON source.id = checkpoint.source_stage_id
          LEFT JOIN workflow_stage_attempts attempt ON attempt.stage_id = source.id AND attempt.is_current = 1
          WHERE checkpoint.mission_id = workflow_stages.mission_id
            AND checkpoint.target_stage_id = workflow_stages.id
            AND checkpoint.error_code IS NOT NULL
            AND checkpoint.source_attempt_no = COALESCE(attempt.attempt_no, 1)
        )
        AND NOT EXISTS (
          SELECT 1 FROM workflow_edges edge
          JOIN workflow_edge_rules rule ON rule.edge_id = edge.id
          JOIN workflow_stages source ON source.id = edge.source_stage_id
          LEFT JOIN workflow_stage_attempts attempt ON attempt.stage_id = source.id AND attempt.is_current = 1
          LEFT JOIN workflow_transition_checkpoints checkpoint
            ON checkpoint.mission_id = edge.mission_id
           AND checkpoint.edge_id = edge.id
           AND checkpoint.source_attempt_no = COALESCE(attempt.attempt_no, 1)
          WHERE edge.mission_id = workflow_stages.mission_id
            AND edge.target_stage_id = workflow_stages.id
            AND (rule.condition_json IS NOT NULL OR rule.mappings_json <> '[]')
            AND checkpoint.id IS NULL
        )
    `).bind(stageId, missionId), this.db.prepare(`
      UPDATE workflow_stage_attempts SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE stage_id = ? AND mission_id = ? AND is_current = 1
        AND EXISTS (SELECT 1 FROM workflow_stages WHERE id = ? AND mission_id = ? AND status = 'running')
    `).bind(claimedAt, claimedAt, stageId, missionId, stageId, missionId)]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
    return (await this.listStages(missionId)).find((stage) => stage.id === stageId) ?? null;
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
    if (!row) return null;
    return (await this.listStages(missionId)).find((stage) => stage.id === stageId) ?? null;
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
      SELECT ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
        WHERE m.id = ? AND m.status = 'running' AND m.cancelled_at IS NULL AND e.status = 'held'
      ) AND NOT EXISTS (
        SELECT 1 FROM mission_runtime_controls c WHERE c.mission_id = ? AND c.paused_at IS NOT NULL
      )
      ON CONFLICT(mission_id, stage_id) DO UPDATE SET
        status = CASE
          WHEN workflow_dispatch_outbox.status = 'done'
            OR (workflow_dispatch_outbox.status = 'pending'
              AND julianday(workflow_dispatch_outbox.expires_at) <= julianday(excluded.next_attempt_at))
          THEN 'pending' ELSE workflow_dispatch_outbox.status END,
        run_id = CASE
          WHEN workflow_dispatch_outbox.status = 'done'
            OR (workflow_dispatch_outbox.status = 'pending'
              AND julianday(workflow_dispatch_outbox.expires_at) <= julianday(excluded.next_attempt_at))
          THEN excluded.run_id ELSE workflow_dispatch_outbox.run_id END,
        expires_at = CASE
          WHEN workflow_dispatch_outbox.status = 'done'
            OR (workflow_dispatch_outbox.status = 'pending'
              AND julianday(workflow_dispatch_outbox.expires_at) <= julianday(excluded.next_attempt_at))
          THEN excluded.expires_at ELSE workflow_dispatch_outbox.expires_at END,
        attempts = CASE
          WHEN workflow_dispatch_outbox.status = 'done'
            OR (workflow_dispatch_outbox.status = 'pending'
              AND julianday(workflow_dispatch_outbox.expires_at) <= julianday(excluded.next_attempt_at))
          THEN 0 ELSE workflow_dispatch_outbox.attempts END,
        next_attempt_at = excluded.next_attempt_at,
        updated_at = excluded.updated_at
    `).bind(`OUTBOX-${crypto.randomUUID()}`, missionId, stageId, crypto.randomUUID(), expiresAt, now, now, now, missionId, missionId)));
    const { results } = await this.db.prepare(`
      SELECT * FROM workflow_dispatch_outbox
      WHERE mission_id = ? AND stage_id IN (${stageIds.map(() => '?').join(',')})
      ORDER BY created_at ASC
    `).bind(missionId, ...stageIds).all<Row>();
    return results.map(mapDispatchOutbox);
  }

  async recoverExpiredStageDispatches(missionId: string, now: string): Promise<string[]> {
    const { results: candidates } = await this.db.prepare(`
      SELECT s.id AS stage_id, a.run_id
      FROM workflow_stages s
      JOIN workflow_stage_attempts a
        ON a.mission_id = s.mission_id AND a.stage_id = s.id AND a.is_current = 1
      JOIN agent_dispatches d ON d.run_id = a.run_id
      JOIN missions m ON m.id = s.mission_id
      JOIN escrows e ON e.mission_id = s.mission_id
      WHERE s.mission_id = ? AND s.status = 'running' AND a.status = 'running'
        AND d.completed_at IS NULL AND julianday(d.expires_at) <= julianday(?)
        AND m.status = 'running' AND m.cancelled_at IS NULL AND e.status = 'held'
        AND NOT EXISTS (
          SELECT 1 FROM mission_runtime_controls c
          WHERE c.mission_id = s.mission_id AND c.paused_at IS NOT NULL
        )
      ORDER BY s.position ASC
    `).bind(missionId, now).all<Row>();
    const recovered: string[] = [];
    for (const candidate of candidates) {
      const stageId = text(candidate.stage_id);
      const runId = text(candidate.run_id);
      const results = await this.db.batch([
        this.db.prepare(`
          UPDATE workflow_stages SET status = 'queued', progress = 0, output_json = NULL, updated_at = ?
          WHERE id = ? AND mission_id = ? AND status = 'running'
            AND EXISTS (
              SELECT 1 FROM workflow_stage_attempts a JOIN agent_dispatches d ON d.run_id = a.run_id
              WHERE a.mission_id = workflow_stages.mission_id AND a.stage_id = workflow_stages.id
                AND a.is_current = 1 AND a.status = 'running' AND a.run_id = ?
                AND d.completed_at IS NULL AND julianday(d.expires_at) <= julianday(?)
            )
        `).bind(now, stageId, missionId, runId, now),
        this.db.prepare(`
          UPDATE workflow_stage_attempts
          SET status = 'queued', run_id = NULL, output_json = NULL, started_at = NULL,
            completed_at = NULL, updated_at = ?
          WHERE mission_id = ? AND stage_id = ? AND is_current = 1 AND status = 'running' AND run_id = ?
            AND EXISTS (
              SELECT 1 FROM workflow_stages s
              WHERE s.mission_id = workflow_stage_attempts.mission_id
                AND s.id = workflow_stage_attempts.stage_id AND s.status = 'queued'
            )
        `).bind(now, missionId, stageId, runId),
        this.db.prepare(`
          UPDATE agent_dispatches SET completed_at = ?
          WHERE run_id = ? AND mission_id = ? AND stage_id = ? AND completed_at IS NULL
            AND EXISTS (
              SELECT 1 FROM workflow_stage_attempts a
              WHERE a.mission_id = ? AND a.stage_id = ? AND a.is_current = 1
                AND a.status = 'queued' AND a.run_id IS NULL
            )
        `).bind(now, runId, missionId, stageId, missionId, stageId),
        this.db.prepare(`
          UPDATE workflow_dispatch_outbox SET status = 'done', updated_at = ?
          WHERE mission_id = ? AND stage_id = ? AND run_id = ?
        `).bind(now, missionId, stageId, runId),
      ]);
      if (Number(results[0]?.meta?.changes ?? 0) > 0 && Number(results[1]?.meta?.changes ?? 0) > 0) {
        recovered.push(stageId);
      }
    }
    return recovered;
  }

  async listPendingDispatches(limit: number, now: string): Promise<DispatchOutboxItem[]> {
    await this.db.prepare(`
      UPDATE workflow_dispatch_outbox SET status = 'pending', next_attempt_at = ?, updated_at = ?
      WHERE status = 'processing' AND julianday(updated_at) <= julianday(?, '-5 minutes')
        AND NOT EXISTS (
          SELECT 1 FROM mission_runtime_controls c
          WHERE c.mission_id = workflow_dispatch_outbox.mission_id AND c.paused_at IS NOT NULL
        )
    `).bind(now, now, now).run();
    const { results } = await this.db.prepare(`
      SELECT * FROM workflow_dispatch_outbox
      WHERE status = 'pending' AND julianday(next_attempt_at) <= julianday(?)
        AND NOT EXISTS (
          SELECT 1 FROM mission_runtime_controls c
          WHERE c.mission_id = workflow_dispatch_outbox.mission_id AND c.paused_at IS NOT NULL
        )
      ORDER BY next_attempt_at ASC, created_at ASC LIMIT ?
    `).bind(now, limit).all<Row>();
    return results.map(mapDispatchOutbox);
  }

  async claimDispatch(id: string, now: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE workflow_dispatch_outbox SET status = 'processing', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status = 'pending' AND julianday(next_attempt_at) <= julianday(?)
        AND EXISTS (
          SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
          WHERE m.id = workflow_dispatch_outbox.mission_id AND m.status = 'running'
            AND m.cancelled_at IS NULL AND e.status = 'held'
        )
        AND NOT EXISTS (
          SELECT 1 FROM mission_runtime_controls c
          WHERE c.mission_id = workflow_dispatch_outbox.mission_id AND c.paused_at IS NOT NULL
        )
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
    const updatedAt = new Date().toISOString();
    await this.db.batch([this.db.prepare(`
      UPDATE workflow_stages
      SET status = ?, progress = CASE WHEN ? = 'done' THEN 100 WHEN ? = 'queued' THEN 0 ELSE progress END,
        output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END, updated_at = ?
      WHERE id = ? AND mission_id = ?
    `).bind(status, status, status, output === undefined ? 0 : 1, output === undefined ? null : JSON.stringify(output), updatedAt, stageId, missionId), this.db.prepare(`
      UPDATE workflow_stage_attempts SET status = ?,
        output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
        started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
        completed_at = CASE WHEN ? IN ('done', 'failed') THEN ? ELSE completed_at END,
        updated_at = ?
      WHERE stage_id = ? AND mission_id = ? AND is_current = 1
    `).bind(
      status, output === undefined ? 0 : 1, output === undefined ? null : JSON.stringify(output),
      status, updatedAt, status, updatedAt, updatedAt, stageId, missionId,
    )]);
    return (await this.listStages(missionId)).find((stage) => stage.id === stageId) ?? null;
  }

  async transitionStage(
    missionId: string,
    stageId: string,
    expectedStatus: WorkflowStage['status'],
    status: WorkflowStage['status'],
    output?: Record<string, unknown> | null,
  ): Promise<WorkflowStage | null> {
    const transitionedAt = new Date().toISOString();
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE workflow_stages
        SET status = ?, progress = CASE WHEN ? = 'done' THEN 100 WHEN ? = 'queued' THEN 0 ELSE progress END,
          output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END, updated_at = ?
        WHERE id = ? AND mission_id = ? AND status = ?
          AND EXISTS (
            SELECT 1 FROM missions m JOIN escrows e ON e.mission_id = m.id
            WHERE m.id = workflow_stages.mission_id AND m.status = 'running'
              AND m.cancelled_at IS NULL AND e.status = 'held'
          )
          AND NOT EXISTS (
            SELECT 1 FROM mission_runtime_controls c
            WHERE c.mission_id = workflow_stages.mission_id AND c.paused_at IS NOT NULL
          )
      `).bind(
        status, status, status, output === undefined ? 0 : 1,
        output === undefined ? null : JSON.stringify(output), transitionedAt,
        stageId, missionId, expectedStatus,
      ),
      this.db.prepare(`
        UPDATE workflow_stage_attempts SET status = ?,
          output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
          started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END,
          completed_at = CASE WHEN ? IN ('done', 'failed') THEN ? ELSE completed_at END,
          updated_at = ?
        WHERE stage_id = ? AND mission_id = ? AND is_current = 1
          AND EXISTS (
            SELECT 1 FROM workflow_stages
            WHERE id = ? AND mission_id = ? AND status = ? AND updated_at = ?
          )
      `).bind(
        status, output === undefined ? 0 : 1, output === undefined ? null : JSON.stringify(output),
        status, transitionedAt, status, transitionedAt, transitionedAt,
        stageId, missionId, stageId, missionId, status, transitionedAt,
      ),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
    return (await this.listStages(missionId)).find((stage) => stage.id === stageId) ?? null;
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
      `).bind(status, status, output === undefined ? 0 : 1, output === undefined ? null : JSON.stringify(output), transitionedAt, stageId, missionId),
      this.db.prepare(`
        UPDATE workflow_stage_attempts SET status = ?,
          output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
          completed_at = CASE WHEN ? IN ('done', 'failed') THEN ? ELSE completed_at END,
          updated_at = ?
        WHERE stage_id = ? AND mission_id = ? AND is_current = 1
          AND EXISTS (SELECT 1 FROM workflow_stages WHERE id = ? AND mission_id = ? AND status = ? AND updated_at = ?)
      `).bind(
        status, output === undefined ? 0 : 1, output === undefined ? null : JSON.stringify(output),
        status, transitionedAt, transitionedAt, stageId, missionId, stageId, missionId, status, transitionedAt,
      )];
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
    return (await this.listStages(missionId)).find((stage) => stage.id === stageId) ?? null;
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
    let attemptNo = deliverable.stageId ? deliverable.attemptNo ?? null : null;
    if (deliverable.stageId && attemptNo === null) {
      const row = await this.db.prepare(`
        SELECT attempt_no FROM workflow_stage_attempts
        WHERE mission_id = ? AND stage_id = ? AND is_current = 1
      `).bind(deliverable.missionId, deliverable.stageId).first<Row>();
      attemptNo = row ? number(row.attempt_no) : null;
    }
    if (deliverable.ipfsEvidence) {
      const latest = await this.db.prepare(`
        SELECT e.deliverable_id, e.version_no, e.root_cid
        FROM deliverable_ipfs_evidence e
        WHERE e.mission_id = ? AND e.scope_key = ?
        ORDER BY e.version_no DESC LIMIT 1
      `).bind(deliverable.missionId, deliverable.ipfsEvidence.scopeKey).first<Row>();
      const expectedVersion = latest ? number(latest.version_no) + 1 : 1;
      const expectedParent = latest ? text(latest.deliverable_id) : null;
      if (deliverable.ipfsEvidence.versionNo !== expectedVersion) throw new Error('IPFS_VERSION_CONFLICT');
      if (deliverable.ipfsEvidence.supersedesDeliverableId !== expectedParent) throw new Error('IPFS_PARENT_CONFLICT');
      if (deliverable.ipfsEvidence.manifest.supersedesRootCid !== (latest ? text(latest.root_cid) : null)) throw new Error('IPFS_PARENT_CID_CONFLICT');
    }
    const insertDeliverable = this.db.prepare(`
      INSERT INTO deliverables
        (id, mission_id, stage_id, attempt_no, agent_id, name, uri, content_hash, mime_type, status, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? IS NULL OR EXISTS (
        SELECT 1 FROM workflow_stage_attempts
        WHERE mission_id = ? AND stage_id = ? AND attempt_no = ? AND is_current = 1
      )
    `).bind(
      deliverable.id, deliverable.missionId, deliverable.stageId, attemptNo, deliverable.agentId,
      deliverable.name, deliverable.uri, deliverable.contentHash, deliverable.mimeType,
      deliverable.status, deliverable.createdAt,
      deliverable.stageId, deliverable.missionId, deliverable.stageId, attemptNo,
    );
    if (!deliverable.ipfsEvidence) {
      const result = await insertDeliverable.run();
      if (Number(result.meta.changes ?? 0) === 0) throw new Error('STALE_STAGE_ATTEMPT');
      return { ...deliverable, attemptNo };
    }
    const evidence = deliverable.ipfsEvidence;
    const results = await this.db.batch([
      insertDeliverable,
      this.db.prepare(`
        INSERT INTO deliverable_ipfs_evidence
          (deliverable_id, mission_id, scope_key, version_no, supersedes_deliverable_id, provider, root_cid,
           manifest_path, manifest_sha256, manifest_json, file_count, total_bytes, visibility, verification_status,
           last_verified_at, last_verification_error, submitted_by, created_at)
        SELECT ?, ?, ?, ?, ?, 'pinme_ipfs', ?, '/manifest.json', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?
        WHERE EXISTS (SELECT 1 FROM deliverables WHERE id = ? AND mission_id = ?)
      `).bind(
        deliverable.id, deliverable.missionId, evidence.scopeKey, evidence.versionNo, evidence.supersedesDeliverableId,
        evidence.rootCid, evidence.manifestSha256, JSON.stringify(evidence.manifest), evidence.fileCount,
        evidence.totalBytes, evidence.visibility, evidence.verificationStatus, deliverable.agentId ?? 'platform',
        deliverable.createdAt, deliverable.id, deliverable.missionId,
      ),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0 || Number(results[1]?.meta?.changes ?? 0) === 0) {
      throw new Error('STALE_STAGE_ATTEMPT');
    }
    return { ...deliverable, attemptNo };
  }

  async listDeliverables(missionId: string): Promise<Deliverable[]> {
    const { results } = await this.db.prepare(`
      SELECT d.*, e.scope_key, e.version_no, e.supersedes_deliverable_id, e.root_cid, e.manifest_sha256,
        e.manifest_json, e.file_count, e.total_bytes, e.visibility, e.verification_status,
        e.last_verified_at, e.last_verification_error
      FROM deliverables d LEFT JOIN deliverable_ipfs_evidence e ON e.deliverable_id = d.id
      WHERE d.mission_id = ? ORDER BY d.created_at ASC, d.id ASC
    `).bind(missionId).all<Row>();
    return results.map(mapDeliverable);
  }

  async updateDeliverableIpfsVerification(
    missionId: string,
    deliverableId: string,
    status: DeliverableIpfsEvidence['verificationStatus'],
    verifiedAt: string,
    error: string | null,
  ): Promise<Deliverable | null> {
    const result = await this.db.prepare(`
      UPDATE deliverable_ipfs_evidence
      SET verification_status = CASE WHEN verification_status = 'verified' AND ? = 'unavailable' THEN verification_status ELSE ? END,
        last_verified_at = ?, last_verification_error = ?
      WHERE deliverable_id = ? AND mission_id = ?
    `).bind(status, status, verifiedAt, error, deliverableId, missionId).run();
    if (Number(result.meta.changes ?? 0) === 0) return null;
    return (await this.listDeliverables(missionId)).find((item) => item.id === deliverableId) ?? null;
  }

  async getAcceptanceEvidenceSnapshot(missionId: string): Promise<MissionEvidenceSnapshot | null> {
    const row = await this.db.prepare(`
      SELECT mission_id, deliverables_json, acceptance_criteria_sha256, workflow_version, scheduler_revision,
        event_watermark, accepted_by AS frozen_by, created_at AS snapshot_created_at
      FROM mission_acceptance_snapshots WHERE mission_id = ?
    `).bind(missionId).first<Row>();
    return row ? mapEvidenceSnapshot(row) : null;
  }

  async recordEvidencePublication(publication: EvidencePublication): Promise<EvidencePublication> {
    const result = await this.db.prepare(`
      INSERT INTO evidence_publications
        (id, mission_id, kind, subject_id, payload_sha256, root_cid, published_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, subject_id) DO NOTHING
    `).bind(
      publication.id, publication.missionId, publication.kind, publication.subjectId, publication.payloadSha256,
      publication.rootCid, publication.publishedBy, publication.createdAt,
    ).run();
    if (Number(result.meta.changes ?? 0) === 0) {
      const existing = await this.db.prepare('SELECT * FROM evidence_publications WHERE kind = ? AND subject_id = ?')
        .bind(publication.kind, publication.subjectId).first<Row>();
      if (!existing || text(existing.payload_sha256) !== publication.payloadSha256 || text(existing.root_cid) !== publication.rootCid) {
        throw new Error('EVIDENCE_PUBLICATION_CONFLICT');
      }
      return mapEvidencePublication(existing);
    }
    return publication;
  }

  async listEvidencePublications(missionId: string): Promise<EvidencePublication[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM evidence_publications WHERE mission_id = ? ORDER BY created_at DESC, id DESC
    `).bind(missionId).all<Row>();
    return results.map(mapEvidencePublication);
  }

  async listAgentCidPortfolio(agentId: string, limit = 20): Promise<AgentCidPortfolioItem[]> {
    const { results } = await this.db.prepare(`
      SELECT m.id AS mission_id, m.title AS mission_title, m.updated_at AS completed_at,
        d.id AS deliverable_id, d.name, e.root_cid, e.manifest_sha256, e.version_no, e.visibility, e.verification_status
      FROM missions m JOIN deliverables d ON d.mission_id = m.id
      JOIN deliverable_ipfs_evidence e ON e.deliverable_id = d.id
      LEFT JOIN workflow_stage_attempts a ON a.mission_id = d.mission_id AND a.stage_id = d.stage_id AND a.is_current = 1
      WHERE m.status = 'completed' AND d.agent_id = ?
        AND (d.stage_id IS NULL OR d.attempt_no = a.attempt_no)
      ORDER BY m.updated_at DESC, e.version_no DESC LIMIT ?
    `).bind(agentId, Math.max(1, Math.min(50, limit))).all<Row>();
    return results.map((row) => ({
      missionId: text(row.mission_id), missionTitle: text(row.mission_title), deliverableId: text(row.deliverable_id),
      name: text(row.name), rootCid: text(row.root_cid), manifestSha256: text(row.manifest_sha256),
      versionNo: number(row.version_no), visibility: text(row.visibility) as AgentCidPortfolioItem['visibility'],
      verificationStatus: text(row.verification_status) as AgentCidPortfolioItem['verificationStatus'],
      completedAt: text(row.completed_at),
    }));
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
      const { results } = await this.db.prepare(`
        SELECT d.*, es.mission_id AS snapshot_mission_id, es.deliverables_json AS snapshot_deliverables_json,
          es.acceptance_criteria_sha256 AS snapshot_acceptance_criteria_sha256,
          es.workflow_version AS snapshot_workflow_version, es.scheduler_revision AS snapshot_scheduler_revision,
          es.event_watermark AS snapshot_event_watermark, es.frozen_by AS snapshot_frozen_by,
          es.created_at AS snapshot_snapshot_created_at
        FROM disputes d LEFT JOIN dispute_evidence_snapshots es ON es.dispute_id = d.id
        ORDER BY d.created_at DESC LIMIT 200
      `).all<Row>();
      return results.map(mapDispute);
    }
    const { results } = await this.db.prepare(`
      SELECT DISTINCT d.*, es.mission_id AS snapshot_mission_id, es.deliverables_json AS snapshot_deliverables_json,
        es.acceptance_criteria_sha256 AS snapshot_acceptance_criteria_sha256,
        es.workflow_version AS snapshot_workflow_version, es.scheduler_revision AS snapshot_scheduler_revision,
        es.event_watermark AS snapshot_event_watermark, es.frozen_by AS snapshot_frozen_by,
        es.created_at AS snapshot_snapshot_created_at
      FROM disputes d
      LEFT JOIN dispute_evidence_snapshots es ON es.dispute_id = d.id
      JOIN missions m ON m.id = d.mission_id
      LEFT JOIN workflow_stages s ON s.mission_id = m.id
      LEFT JOIN agents a ON a.id = s.agent_id
      WHERE m.requester_id = ? OR a.owner_id = ?
        OR EXISTS (
          SELECT 1 FROM dispute_proposal_rounds dp
          JOIN dispute_round_electorate de ON de.proposal_id = dp.id
          WHERE dp.dispute_id = d.id AND de.user_id = ?
        )
      ORDER BY d.created_at DESC LIMIT 200
    `).bind(user.id, user.id, user.id).all<Row>();
    return results.map(mapDispute);
  }

  async getDisputes(missionId: string): Promise<Dispute[]> {
    const { results } = await this.db.prepare(`
      SELECT d.*, es.mission_id AS snapshot_mission_id, es.deliverables_json AS snapshot_deliverables_json,
        es.acceptance_criteria_sha256 AS snapshot_acceptance_criteria_sha256,
        es.workflow_version AS snapshot_workflow_version, es.scheduler_revision AS snapshot_scheduler_revision,
        es.event_watermark AS snapshot_event_watermark, es.frozen_by AS snapshot_frozen_by,
        es.created_at AS snapshot_snapshot_created_at
      FROM disputes d LEFT JOIN dispute_evidence_snapshots es ON es.dispute_id = d.id
      WHERE d.mission_id = ? ORDER BY d.created_at DESC
    `).bind(missionId).all<Row>();
    return results.map(mapDispute);
  }

  async createDispute(dispute: Dispute): Promise<Dispute> {
    const statements: D1Statement[] = [
      this.db.prepare(`
        INSERT INTO disputes
          (id, mission_id, opened_by, reason, evidence_json, status, resolution, freeze_tx_hash, resolution_tx_hash, created_at, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, NULL)
      `).bind(dispute.id, dispute.missionId, dispute.openedBy, dispute.reason, JSON.stringify(dispute.evidence), dispute.status, dispute.freezeTxHash, dispute.createdAt),
      this.db.prepare("UPDATE escrows SET status = 'frozen', freeze_tx_hash = ?, updated_at = datetime('now') WHERE mission_id = ? AND status = 'held'").bind(dispute.freezeTxHash, dispute.missionId),
    ];
    if (dispute.collaborationIssueId) {
      statements.push(this.db.prepare('UPDATE collaboration_issues SET dispute_id=?,updated_at=? WHERE id=? AND mission_id=?')
        .bind(dispute.id,dispute.createdAt,dispute.collaborationIssueId,dispute.missionId));
    }
    if (dispute.evidenceSnapshot) {
      const snapshot = dispute.evidenceSnapshot;
      statements.push(this.db.prepare(`
        INSERT INTO dispute_evidence_snapshots
          (dispute_id, mission_id, deliverables_json, acceptance_criteria_sha256, workflow_version,
           scheduler_revision, event_watermark, frozen_by, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM disputes WHERE id = ? AND mission_id = ?)
      `).bind(
        dispute.id, snapshot.missionId, JSON.stringify(snapshot.deliverables), snapshot.acceptanceCriteriaSha256,
        snapshot.workflowVersion, snapshot.schedulerRevision, snapshot.eventWatermark, snapshot.frozenBy,
        snapshot.frozenAt, dispute.id, dispute.missionId,
      ));
    }
    await this.db.batch(statements);
    return dispute;
  }

  async startDisputeReview(
    id: string,
    actorId: string,
    startedAt = new Date().toISOString(),
    weightMode: ArbitrationProposal['weightMode'] = 'one_person_one_vote',
  ): Promise<Dispute | null> {
    const existingRow = await this.db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first<Row>();
    if (!existingRow) return null;
    const existing = mapDispute(existingRow);
    if (!['open', 'reviewing'].includes(existing.status)) return existing;

    const proposalRow = await this.db.prepare('SELECT * FROM dispute_proposal_rounds WHERE dispute_id = ? ORDER BY round DESC LIMIT 1').bind(id).first<Row>();
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
    const electorate = electorateRows.map((row) => ({
      userId: text(row.user_id),
      power: Math.max(1, number(row.power)),
      voteWeight: arbitrationVoteWeight(weightMode, number(row.power)),
    }));
    const eligibleWeight = electorate.reduce((sum, member) => sum + member.voteWeight, 0);
    const votingEndsAt = arbitrationVotingEndsAt(startedAt);
    const actionId = `${id}:review_started`;
    const statements = [
      this.db.prepare(`
        INSERT INTO dispute_proposal_rounds
          (id, dispute_id, round, parent_proposal_id, proposer_id, appeal_reason, appeal_deadline_at,
           status, weight_mode, weight_version, voting_starts_at, voting_ends_at,
           quorum_required, eligible_weight, support_votes, oppose_votes, abstain_votes, created_at)
        VALUES (?, ?, 0, NULL, ?, NULL, NULL, 'active', ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
      `).bind(
        proposalId, id, actorId, weightMode, arbitrationWeightVersion(weightMode), startedAt, votingEndsAt,
        arbitrationQuorum(eligibleWeight), eligibleWeight, startedAt,
      ),
      ...electorate.map((member) => this.db.prepare(`
        INSERT INTO dispute_round_electorate (proposal_id, user_id, power_snapshot, vote_weight, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(proposalId, member.userId, member.power, member.voteWeight, startedAt)),
      this.db.prepare("UPDATE disputes SET status = 'reviewing' WHERE id = ? AND status IN ('open', 'reviewing')").bind(id),
      this.db.prepare(`
        INSERT OR IGNORE INTO dispute_actions (id, dispute_id, actor_id, action, note, created_at)
        VALUES (?, ?, ?, 'review_started', ?, ?)
      `).bind(actionId, id, actorId, `DAO proposal ${proposalId} created in ${weightMode} mode with ${eligibleWeight} eligible weight`, startedAt),
    ];
    try {
      await this.db.batch(statements);
    } catch (error) {
      const concurrent = await this.db.prepare('SELECT id FROM dispute_proposal_rounds WHERE dispute_id = ? AND round = 0').bind(id).first<Row>();
      if (!concurrent) throw error;
    }
    const row = await this.db.prepare('SELECT * FROM disputes WHERE id = ?').bind(id).first<Row>();
    return row ? mapDispute(row) : null;
  }

  async getDisputeGovernance(id: string, userId: string, now = new Date().toISOString()): Promise<DisputeGovernance | null> {
    const dispute = await this.db.prepare(`
      SELECT d.*, m.requester_id,
        CASE WHEN d.opened_by = ? OR m.requester_id = ? OR EXISTS (
          SELECT 1 FROM workflow_stages s JOIN agents a ON a.id = s.agent_id
          WHERE s.mission_id = d.mission_id AND a.owner_id = ?
        ) THEN 1 ELSE 0 END AS is_party
      FROM disputes d JOIN missions m ON m.id = d.mission_id WHERE d.id = ?
    `).bind(userId, userId, userId, id).first<Row>();
    if (!dispute) return null;
    const { results: proposalRows } = await this.db.prepare(
      'SELECT * FROM dispute_proposal_rounds WHERE dispute_id = ? ORDER BY round ASC',
    ).bind(id).all<Row>();
    if (proposalRows.length === 0) {
      return {
        proposal: null, electorate: [], votes: [], rounds: [], execution: null, executionReady: false,
        appeal: { used: false, deadlineAt: null, canAppeal: false, reason: null, appellantId: null, createdAt: null },
        currentUser: { eligible: false, canVote: false, hasVoted: false, choice: null },
      };
    }
    const rounds = await Promise.all(proposalRows.map(async (proposalRow) => {
      const proposal = mapArbitrationProposal(proposalRow);
      const [{ results: electorateRows }, { results: voteRows }] = await Promise.all([
        this.db.prepare(`
          SELECT e.*, p.display_name
          FROM dispute_round_electorate e JOIN profiles p ON p.id = e.user_id
          WHERE e.proposal_id = ? ORDER BY p.display_name ASC, e.user_id ASC
        `).bind(proposal.id).all<Row>(),
        this.db.prepare(`
          SELECT v.*, p.display_name
          FROM dispute_round_votes v JOIN profiles p ON p.id = v.voter_id
          WHERE v.proposal_id = ? ORDER BY v.created_at ASC, v.id ASC
        `).bind(proposal.id).all<Row>(),
      ]);
      return { proposal, electorate: electorateRows.map(mapArbitrationElector), votes: voteRows.map(mapDisputeVote) };
    }));
    const currentRound = rounds.at(-1)!;
    const { proposal, electorate, votes } = currentRound;
    const eligible = electorate.some((item) => item.userId === userId) && !(await this.collaboration.listWork(id)).some(w=>w.proposalId===proposal.id && w.userId===userId && w.status==='withdrawn');
    const currentVote = votes.find((item) => item.voterId === userId);
    const initial = rounds[0]?.proposal ?? null;
    const appealProposal = rounds.find((round) => round.proposal.round === 1)?.proposal ?? null;
    const executionRow = await this.db.prepare(
      "SELECT * FROM governance_execution_queue WHERE scope = 'task_dispute' AND source_id = ?",
    ).bind(id).first<Row>();
    return {
      proposal,
      electorate,
      votes,
      rounds,
      appeal: {
        used: Boolean(appealProposal),
        deadlineAt: initial?.appealDeadlineAt ?? null,
        canAppeal: !appealProposal && initial?.status !== 'active' && initial?.status !== 'executed'
          && !executionRow && Boolean(initial?.appealDeadlineAt)
          && Date.parse(now) < Date.parse(initial!.appealDeadlineAt!) && boolean(dispute.is_party),
        reason: appealProposal?.appealReason ?? null,
        appellantId: appealProposal?.proposerId ?? null,
        createdAt: appealProposal?.createdAt ?? null,
      },
      execution: executionRow ? mapGovernanceExecution(executionRow) : null,
      executionReady: arbitrationExecutionReady(proposal, Boolean(appealProposal), now),
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
          INSERT INTO dispute_round_votes (id, proposal_id, voter_id, choice, reason, vote_weight, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM dispute_proposal_rounds
            WHERE id = ? AND status = 'active'
              AND julianday(voting_starts_at) <= julianday(?)
              AND julianday(voting_ends_at) > julianday(?)
          ) AND EXISTS (
            SELECT 1 FROM dispute_round_electorate WHERE proposal_id = ? AND user_id = ?
          ) AND NOT EXISTS (
            SELECT 1 FROM dispute_round_votes WHERE proposal_id = ? AND voter_id = ?
          ) AND NOT EXISTS (SELECT 1 FROM arbitration_work WHERE proposal_id=? AND user_id=? AND status='withdrawn')
        `).bind(
          voteId, governance.proposal.id, voterId, choice, reason, elector.voteWeight, votedAt,
          governance.proposal.id, votedAt, votedAt,
          governance.proposal.id, voterId,
          governance.proposal.id, voterId,
          governance.proposal.id, voterId,
        ),
        this.db.prepare(`
          UPDATE dispute_proposal_rounds
          SET support_votes = support_votes + ?, oppose_votes = oppose_votes + ?, abstain_votes = abstain_votes + ?
          WHERE id = ? AND status = 'active'
            AND EXISTS (SELECT 1 FROM dispute_round_votes WHERE id = ?)
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
      UPDATE dispute_proposal_rounds SET status = ?, outcome = ?, finalized_at = ?, finalized_by = ?,
        appeal_deadline_at = CASE WHEN round = 0 THEN ? ELSE NULL END
      WHERE id = ? AND status = 'active'
    `).bind(
      evaluation.status, evaluation.outcome, finalizedAt, actorId,
      arbitrationAppealEndsAt(finalizedAt), governance.proposal.id,
    ).run();
    const updated = await this.getDisputeGovernance(id, actorId, finalizedAt);
    return updated ? { state: 'finalized', governance: updated } : { state: 'missing' };
  }

  async createDisputeAppeal(id: string, appellantId: string, reason: string, createdAt: string): Promise<DisputeAppealResult> {
    const party = await this.db.prepare(`
      SELECT d.id FROM disputes d JOIN missions m ON m.id = d.mission_id
      WHERE d.id = ? AND d.status = 'reviewing' AND (
        d.opened_by = ? OR m.requester_id = ? OR EXISTS (
          SELECT 1 FROM workflow_stages s JOIN agents a ON a.id = s.agent_id
          WHERE s.mission_id = d.mission_id AND a.owner_id = ?
        )
      )
    `).bind(id, appellantId, appellantId, appellantId).first<Row>();
    if (!party) {
      const dispute = await this.db.prepare('SELECT id FROM disputes WHERE id = ?').bind(id).first<Row>();
      return dispute ? { state: 'not_allowed' } : { state: 'missing' };
    }
    const initialRow = await this.db.prepare(
      'SELECT * FROM dispute_proposal_rounds WHERE dispute_id = ? AND round = 0',
    ).bind(id).first<Row>();
    if (!initialRow) return { state: 'not_finalized' };
    const initial = mapArbitrationProposal(initialRow);
    if (initial.status === 'active' || initial.status === 'executed' || !initial.appealDeadlineAt) {
      return { state: 'not_finalized' };
    }
    if (Date.parse(createdAt) >= Date.parse(initial.appealDeadlineAt)) return { state: 'expired' };
    const existingAppeal = await this.db.prepare(
      'SELECT id FROM dispute_proposal_rounds WHERE dispute_id = ? AND round = 1',
    ).bind(id).first<Row>();
    if (existingAppeal) return { state: 'already_appealed' };
    const existingExecution = await this.db.prepare(
      "SELECT id FROM governance_execution_queue WHERE scope = 'task_dispute' AND source_id = ?",
    ).bind(id).first<Row>();
    if (existingExecution) return { state: 'execution_queued' };

    const [{ results: originalRows }, { results: currentRows }] = await Promise.all([
      this.db.prepare(`
        SELECT e.user_id, COALESCE(am.power, e.power_snapshot) AS current_power, e.power_snapshot, p.display_name
        FROM dispute_round_electorate e JOIN profiles p ON p.id = e.user_id
        LEFT JOIN arbitration_members am ON am.user_id = e.user_id
        WHERE e.proposal_id = ? ORDER BY e.user_id ASC
      `).bind(initial.id).all<Row>(),
      this.db.prepare(`
        SELECT am.user_id, am.power, p.display_name
        FROM arbitration_members am
        JOIN profiles p ON p.id = am.user_id
        JOIN disputes d ON d.id = ?
        JOIN missions m ON m.id = d.mission_id
        WHERE am.status = 'active' AND am.user_id <> d.opened_by AND am.user_id <> m.requester_id
          AND NOT EXISTS (
            SELECT 1 FROM workflow_stages s JOIN agents a ON a.id = s.agent_id
            WHERE s.mission_id = m.id AND a.owner_id = am.user_id
          )
        ORDER BY am.user_id ASC
      `).bind(id).all<Row>(),
    ]);
    const originalIds = new Set(originalRows.map((row) => text(row.user_id)));
    if (!currentRows.some((row) => !originalIds.has(text(row.user_id)))) return { state: 'no_expanded_electorate' };
    const electorate = new Map<string, { power: number; displayName: string }>();
    for (const row of originalRows) electorate.set(text(row.user_id), {
      power: Math.max(1, number(row.current_power) || number(row.power_snapshot)), displayName: text(row.display_name),
    });
    for (const row of currentRows) electorate.set(text(row.user_id), {
      power: Math.max(1, number(row.power)), displayName: text(row.display_name),
    });
    const members = [...electorate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([userId, member]) => ({
      userId, ...member, voteWeight: arbitrationVoteWeight(initial.weightMode, member.power),
    }));
    const eligibleWeight = members.reduce((sum, member) => sum + member.voteWeight, 0);
    const proposalId = `PROP-${crypto.randomUUID()}`;
    const votingEndsAt = arbitrationVotingEndsAt(createdAt);
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO dispute_proposal_rounds
          (id, dispute_id, round, parent_proposal_id, proposer_id, appeal_reason, appeal_deadline_at,
           status, weight_mode, weight_version, voting_starts_at, voting_ends_at, quorum_required,
           eligible_weight, support_votes, oppose_votes, abstain_votes, created_at)
        SELECT ?, ?, 1, ?, ?, ?, NULL, 'active', ?, ?, ?, ?, ?, ?, 0, 0, 0, ?
        WHERE EXISTS (
          SELECT 1 FROM dispute_proposal_rounds
          WHERE id = ? AND dispute_id = ? AND round = 0
            AND status IN ('succeeded', 'defeated', 'inconclusive', 'quorum_failed')
            AND julianday(appeal_deadline_at) > julianday(?)
        ) AND NOT EXISTS (
          SELECT 1 FROM dispute_proposal_rounds WHERE dispute_id = ? AND round = 1
        ) AND NOT EXISTS (
          SELECT 1 FROM governance_execution_queue WHERE scope = 'task_dispute' AND source_id = ?
        )
      `).bind(
        proposalId, id, initial.id, appellantId, reason, initial.weightMode, initial.weightVersion,
        createdAt, votingEndsAt, arbitrationQuorum(eligibleWeight), eligibleWeight, createdAt,
        initial.id, id, createdAt, id, id,
      ),
      ...members.map((member) => this.db.prepare(`
        INSERT INTO dispute_round_electorate (proposal_id, user_id, power_snapshot, vote_weight, created_at)
        SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM dispute_proposal_rounds WHERE id = ?)
      `).bind(proposalId, member.userId, member.power, member.voteWeight, createdAt, proposalId)),
      this.db.prepare(`
        INSERT INTO dispute_governance_events (id, dispute_id, actor_id, action, note, created_at)
        SELECT ?, ?, ?, 'appeal_created', ?, ?
        WHERE EXISTS (SELECT 1 FROM dispute_proposal_rounds WHERE id = ?)
      `).bind(`${id}:appeal`, id, appellantId, reason, createdAt, proposalId),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) {
      const concurrent = await this.db.prepare(
        'SELECT id FROM dispute_proposal_rounds WHERE dispute_id = ? AND round = 1',
      ).bind(id).first<Row>();
      if (concurrent) return { state: 'already_appealed' };
      const queued = await this.db.prepare(
        "SELECT id FROM governance_execution_queue WHERE scope = 'task_dispute' AND source_id = ?",
      ).bind(id).first<Row>();
      return queued ? { state: 'execution_queued' } : { state: 'expired' };
    }
    return { state: 'created', governance: (await this.getDisputeGovernance(id, appellantId, createdAt))! };
  }

  async queueDisputeExecution(
    id: string,
    actorId: string,
    queuedAt: string,
    web3: boolean,
  ): Promise<DisputeExecutionQueueResult> {
    const governance = await this.getDisputeGovernance(id, actorId, queuedAt);
    if (!governance?.proposal) return { state: 'missing' };
    if (governance.execution?.status === 'executed') return { state: 'already_executed' };
    if (governance.execution) return { state: 'replayed', governance };
    const escrow = await this.db.prepare(`
      SELECT e.status FROM escrows e JOIN disputes d ON d.mission_id = e.mission_id WHERE d.id = ?
    `).bind(id).first<Row>();
    if (text(escrow?.status) !== 'frozen') return { state: 'escrow_not_frozen' };
    if (!governance.executionReady || governance.proposal.outcome === null) return { state: 'not_ready' };
    const action = governance.proposal.outcome === 'refund_requester' ? 'refund_requester' : 'reject_dispute';
    const itemId = `GEXEC-${crypto.randomUUID()}`;
    const payloadHash = await arbitrationExecutionPayloadHash(id, governance.proposal.id, action);
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT INTO governance_execution_queue
          (id, scope, source_id, proposal_id, action_type, payload_hash, status, requested_by, requested_at)
        SELECT ?, 'task_dispute', ?, p.id, ?, ?, ?, ?, ?
        FROM dispute_proposal_rounds p
        JOIN disputes d ON d.id = p.dispute_id
        JOIN escrows e ON e.mission_id = d.mission_id
        WHERE p.id = ? AND p.dispute_id = ? AND d.status = 'reviewing' AND e.status = 'frozen'
          AND ((p.status = 'succeeded' AND p.outcome = 'refund_requester')
            OR (p.status = 'defeated' AND p.outcome = 'reject_dispute'))
          AND p.outcome = ?
          AND NOT EXISTS (SELECT 1 FROM dispute_proposal_rounds newer WHERE newer.dispute_id = p.dispute_id AND newer.round > p.round)
          AND (p.round = 1 OR julianday(p.appeal_deadline_at) <= julianday(?))
          AND NOT EXISTS (SELECT 1 FROM governance_execution_queue WHERE scope = 'task_dispute' AND source_id = ?)
      `).bind(
        itemId, id, action, payloadHash, web3 ? 'awaiting_transaction' : 'queued', actorId, queuedAt,
        governance.proposal.id, id, governance.proposal.outcome, queuedAt, id,
      ),
      this.db.prepare(`
        INSERT INTO dispute_governance_events (id, dispute_id, actor_id, action, note, created_at)
        SELECT ?, ?, ?, 'execution_queued', ?, ?
        WHERE EXISTS (SELECT 1 FROM governance_execution_queue WHERE id = ?)
      `).bind(`${id}:execution_queued`, id, actorId, payloadHash, queuedAt, itemId),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) {
      const existing = await this.db.prepare(
        "SELECT status FROM governance_execution_queue WHERE scope = 'task_dispute' AND source_id = ?",
      ).bind(id).first<Row>();
      if (existing) return { state: 'replayed', governance: (await this.getDisputeGovernance(id, actorId, queuedAt))! };
      return { state: 'not_ready' };
    }
    return { state: 'queued', governance: (await this.getDisputeGovernance(id, actorId, queuedAt))! };
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
            SELECT 1 FROM dispute_proposal_rounds p
            JOIN governance_execution_queue q
              ON q.scope = 'task_dispute' AND q.source_id = p.dispute_id AND q.proposal_id = p.id
            WHERE p.dispute_id = ? AND p.status = ? AND p.outcome = ?
              AND q.action_type = ? AND q.status IN ('queued', 'awaiting_transaction')
          )
      `).bind(
        status, resolution, resolutionTxHash, resolvedAt, id, id, expectedProposalStatus, expectedOutcome,
        status === 'resolved' ? 'refund_requester' : 'reject_dispute',
      ),
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
        UPDATE dispute_proposal_rounds SET status = 'executed', executed_at = ?, executed_by = ?
        WHERE id = (SELECT proposal_id FROM governance_execution_queue WHERE scope = 'task_dispute' AND source_id = ?)
          AND status = ? AND outcome = ?
          AND EXISTS (
            SELECT 1 FROM disputes
            WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
        )
      `).bind(resolvedAt, actorId, id, expectedProposalStatus, expectedOutcome, id, status, resolution, resolutionTxHash, resolvedAt),
      this.db.prepare(`
        UPDATE governance_execution_queue
        SET status = 'executed', tx_hash = ?, executed_by = ?, executed_at = ?
        WHERE scope = 'task_dispute' AND source_id = ? AND status IN ('queued', 'awaiting_transaction')
          AND EXISTS (
            SELECT 1 FROM disputes
            WHERE id = ? AND status = ? AND resolution = ? AND resolution_tx_hash IS ? AND resolved_at = ?
          )
      `).bind(resolutionTxHash, actorId, resolvedAt, id, id, status, resolution, resolutionTxHash, resolvedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO dispute_governance_events (id, dispute_id, actor_id, action, note, created_at)
        SELECT ?, ?, ?, 'execution_executed', payload_hash, ? FROM governance_execution_queue
        WHERE scope = 'task_dispute' AND source_id = ? AND status = 'executed' AND executed_at = ?
      `).bind(`${id}:execution_executed`, id, actorId, resolvedAt, id, resolvedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO reward_activities
          (id, source_key, user_id, mission_id, dispute_id, role, formula_version, asset, settled_amount, quality_bps,
           penalty_bps, score_micros, eligible, detail_json, occurred_at, created_at)
        SELECT 'YDACT-' || d.id || '-arb-' || v.voter_id,
          d.id || ':arbitration:' || v.voter_id,
          v.voter_id, d.mission_id, d.id, 'arbitrator', ?, 'YD_CONTRIBUTION', 1, 10000, 0, ?, 1,
          json_object('source', 'executed_arbitration', 'choice', v.choice), ?, ?
        FROM disputes d
        JOIN dispute_proposal_rounds p ON p.dispute_id = d.id AND p.status = 'executed'
        JOIN dispute_round_votes v ON v.proposal_id = p.id
        WHERE d.id = ? AND d.status = ? AND d.resolved_at = ?
          AND NOT EXISTS (SELECT 1 FROM arbitration_work w WHERE w.dispute_id=d.id AND w.user_id=v.voter_id)
      `).bind(REWARD_FORMULA_VERSION, rewardScoreMicros(1, 'arbitrator'), resolvedAt, resolvedAt, id, status, resolvedAt),
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
      `SELECT * FROM dispute_actions WHERE dispute_id = ?
       UNION ALL
       SELECT * FROM dispute_governance_events WHERE dispute_id = ?
       ORDER BY created_at ASC, id ASC`,
    ).bind(disputeId, disputeId).all<Row>();
    return results.map(mapDisputeAction);
  }

  async createAgentDispatch(dispatch: AgentDispatch): Promise<void> {
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO workflow_stage_attempts
          (id, mission_id, stage_id, attempt_no, status, input_json, output_json, is_current,
           started_at, completed_at, created_at, updated_at)
        SELECT 'ATTEMPT-' || s.id || '-1', s.mission_id, s.id, 1, s.status, s.input_json, s.output_json, 1,
          CASE WHEN s.status IN ('running', 'done', 'failed') THEN datetime('now') ELSE NULL END,
          CASE WHEN s.status IN ('done', 'failed') THEN datetime('now') ELSE NULL END,
          s.created_at, s.updated_at
        FROM workflow_stages s WHERE s.id = ? AND s.mission_id = ?
          AND NOT EXISTS (SELECT 1 FROM workflow_stage_attempts a WHERE a.stage_id = s.id AND a.is_current = 1)
      `).bind(dispatch.stageId, dispatch.missionId),
      this.db.prepare(`
        UPDATE workflow_stage_attempts SET run_id = ?, status = 'running',
          started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now')
        WHERE mission_id = ? AND stage_id = ? AND is_current = 1
          AND (run_id IS NULL OR run_id = ?)
      `).bind(dispatch.runId, dispatch.missionId, dispatch.stageId, dispatch.runId),
      this.db.prepare(`
        INSERT OR IGNORE INTO agent_dispatches (run_id, mission_id, stage_id, agent_id, expires_at)
        SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM workflow_stage_attempts
          WHERE mission_id = ? AND stage_id = ? AND is_current = 1 AND run_id = ?
        )
      `).bind(
        dispatch.runId, dispatch.missionId, dispatch.stageId, dispatch.agentId, dispatch.expiresAt,
        dispatch.missionId, dispatch.stageId, dispatch.runId,
      ),
    ]);
    if (Number(results[1]?.meta?.changes ?? 0) === 0) throw new Error('STALE_STAGE_ATTEMPT');
  }

  async applyAgentCallback(update: AgentCallbackUpdate) {
    const dispatch = await this.db.prepare(`
      SELECT d.expires_at, d.completed_at, a.attempt_no
      FROM agent_dispatches d
      JOIN workflow_stage_attempts a
        ON a.mission_id = d.mission_id AND a.stage_id = d.stage_id AND a.run_id = d.run_id
      WHERE d.run_id = ? AND d.mission_id = ? AND d.stage_id = ? AND d.agent_id = ? AND d.expires_at = ?
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
      JOIN workflow_stage_attempts a ON a.stage_id = d.stage_id AND a.mission_id = d.mission_id
      JOIN missions m ON m.id = d.mission_id
      JOIN escrows e ON e.mission_id = d.mission_id
      WHERE d.run_id = ? AND d.mission_id = ? AND d.stage_id = ? AND d.agent_id = ? AND d.expires_at = ?
        AND d.completed_at IS NULL AND julianday(d.expires_at) > julianday(?)
        AND a.is_current = 1 AND a.run_id = d.run_id
        AND s.status = 'running' AND m.status = 'running' AND m.cancelled_at IS NULL AND e.status = 'held'
        AND (? IN ('done', 'failed') OR NOT EXISTS (
          SELECT 1 FROM mission_runtime_controls c WHERE c.mission_id = d.mission_id AND c.paused_at IS NOT NULL
        ))
    `;
    const dispatchAttemptNo = number(dispatch.attempt_no);
    const artifactStatements = (update.artifacts ?? []).map((artifact) => {
      const artifactAttemptNo = artifact.attemptNo ?? dispatchAttemptNo;
      return this.db.prepare(`
      INSERT INTO deliverables
        (id, mission_id, stage_id, attempt_no, agent_id, name, uri, content_hash, mime_type, status, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM agent_callback_events
        WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
      ) AND EXISTS (
        SELECT 1 FROM workflow_stages s
        JOIN workflow_stage_attempts a ON a.stage_id = s.id AND a.mission_id = s.mission_id
        WHERE s.id = ? AND s.mission_id = ? AND s.agent_id = ? AND s.status = 'done'
          AND a.is_current = 1 AND a.attempt_no = ? AND a.run_id = ?
      )
    `).bind(
      artifact.id, artifact.missionId, artifact.stageId, artifactAttemptNo, artifact.agentId, artifact.name,
      artifact.uri, artifact.contentHash, artifact.mimeType, artifact.status, artifact.createdAt,
      update.runId, update.callbackId, processingToken,
      update.stageId, update.missionId, update.agentId, artifactAttemptNo, update.runId,
      );
    });
    const artifactEvidenceStatements = (update.artifacts ?? []).flatMap((artifact) => {
      const evidence = artifact.ipfsEvidence;
      if (!evidence) return [];
      return [this.db.prepare(`
        INSERT INTO deliverable_ipfs_evidence
          (deliverable_id, mission_id, scope_key, version_no, supersedes_deliverable_id, provider, root_cid,
           manifest_path, manifest_sha256, manifest_json, file_count, total_bytes, visibility, verification_status,
           last_verified_at, last_verification_error, submitted_by, created_at)
        SELECT ?, ?, ?, ?, ?, 'pinme_ipfs', ?, '/manifest.json', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?
        WHERE EXISTS (SELECT 1 FROM deliverables WHERE id = ? AND mission_id = ?)
      `).bind(
        artifact.id, artifact.missionId, evidence.scopeKey, evidence.versionNo, evidence.supersedesDeliverableId,
        evidence.rootCid, evidence.manifestSha256, JSON.stringify(evidence.manifest), evidence.fileCount,
        evidence.totalBytes, evidence.visibility, evidence.verificationStatus, artifact.agentId ?? update.agentId,
        artifact.createdAt, artifact.id, artifact.missionId,
      )];
    });
    const appliedIndex = 10 + artifactStatements.length + artifactEvidenceStatements.length;
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO agent_callback_events (run_id, callback_id, created_at)
        SELECT ?, ?, ? WHERE EXISTS (${validDispatch})
      `).bind(
        update.runId, update.callbackId, update.now,
        update.runId, update.missionId, update.stageId, update.agentId, update.expiresAt, update.now, update.status,
      ),
      this.db.prepare(`
        UPDATE agent_callback_events SET processing_token = ?
        WHERE run_id = ? AND callback_id = ? AND processing_token IS NULL AND applied_at IS NULL
          AND EXISTS (${validDispatch})
      `).bind(
        processingToken, update.runId, update.callbackId,
        update.runId, update.missionId, update.stageId, update.agentId, update.expiresAt, update.now, update.status,
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
        UPDATE workflow_stage_attempts SET status = ?,
          output_json = CASE WHEN ? = 1 THEN ? ELSE output_json END,
          completed_at = CASE WHEN ? IN ('done', 'failed') THEN ? ELSE completed_at END,
          updated_at = ?
        WHERE mission_id = ? AND stage_id = ? AND is_current = 1 AND run_id = ?
          AND EXISTS (
            SELECT 1 FROM agent_callback_events
            WHERE run_id = ? AND callback_id = ? AND processing_token = ? AND applied_at IS NULL
          )
      `).bind(
        update.status, update.output === undefined ? 0 : 1, outputJson,
        update.status, update.now, update.now, update.missionId, update.stageId, update.runId,
        update.runId, update.callbackId, processingToken,
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
      ...artifactEvidenceStatements,
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
    const artifactInsertFailed = artifactStatements.some((_, index) => Number(results[10 + index]?.meta?.changes ?? 0) === 0);
    const artifactEvidenceInsertFailed = artifactEvidenceStatements.some((_, index) => (
      Number(results[10 + artifactStatements.length + index]?.meta?.changes ?? 0) === 0
    ));
    if (Number(results[2]?.meta?.changes ?? 0) === 0
      || Number(results[3]?.meta?.changes ?? 0) === 0
      || Number(results[4]?.meta?.changes ?? 0) === 0 || artifactInsertFailed || artifactEvidenceInsertFailed
      || Number(results[appliedIndex]?.meta?.changes ?? 0) === 0) {
      throw new Error('AGENT_CALLBACK_ATOMICITY_FAILED');
    }
    const stage = (await this.listStages(update.missionId)).find((candidate) => candidate.id === update.stageId);
    return stage ? { state: 'applied' as const, stage } : { state: 'invalid' as const };
  }

  async claimAgentCallback(input: {
    runId: string; callbackId: string; missionId: string; stageId: string; agentId: string;
    expiresAt: string; now: string; status: WorkflowStage['status'];
  }): Promise<'accepted' | 'duplicate' | 'expired' | 'missing' | 'invalid'> {
    const dispatch = await this.db.prepare(`
      SELECT expires_at, completed_at FROM agent_dispatches
      WHERE run_id = ? AND mission_id = ? AND stage_id = ? AND agent_id = ? AND expires_at = ?
    `).bind(input.runId, input.missionId, input.stageId, input.agentId, input.expiresAt).first<Row>();
    if (!dispatch) return 'missing';
    const existing = await this.db.prepare(`
      SELECT applied_at FROM agent_callback_events WHERE run_id = ? AND callback_id = ?
    `).bind(input.runId, input.callbackId).first<Row>();
    if (text(existing?.applied_at)) return 'duplicate';
    if (text(dispatch.completed_at) || Date.parse(text(dispatch.expires_at)) <= Date.parse(input.now)) return 'expired';
    const validDispatch = `
      SELECT 1
      FROM agent_dispatches d
      JOIN workflow_stages s ON s.id = d.stage_id AND s.mission_id = d.mission_id
      JOIN workflow_stage_attempts a ON a.stage_id = d.stage_id AND a.mission_id = d.mission_id
      JOIN missions m ON m.id = d.mission_id
      JOIN escrows e ON e.mission_id = d.mission_id
      WHERE d.run_id = ? AND d.mission_id = ? AND d.stage_id = ? AND d.agent_id = ? AND d.expires_at = ?
        AND d.completed_at IS NULL AND julianday(d.expires_at) > julianday(?)
        AND a.is_current = 1 AND a.run_id = d.run_id
        AND s.status = 'running' AND m.status = 'running' AND m.cancelled_at IS NULL AND e.status = 'held'
        AND (? IN ('done', 'failed') OR NOT EXISTS (
          SELECT 1 FROM mission_runtime_controls c WHERE c.mission_id = d.mission_id AND c.paused_at IS NOT NULL
        ))
    `;
    const result = await this.db.prepare(`
      INSERT OR IGNORE INTO agent_callback_events (run_id, callback_id, created_at)
      SELECT ?, ?, ? WHERE EXISTS (${validDispatch})
    `).bind(
      input.runId, input.callbackId, input.now,
      input.runId, input.missionId, input.stageId, input.agentId, input.expiresAt, input.now, input.status,
    ).run();
    if (result.meta.changes > 0) return 'accepted';
    const reserved = await this.db.prepare(`
      SELECT applied_at FROM agent_callback_events WHERE run_id = ? AND callback_id = ?
    `).bind(input.runId, input.callbackId).first<Row>();
    if (text(reserved?.applied_at)) return 'duplicate';
    if (!reserved) return 'invalid';
    const current = await this.db.prepare(validDispatch).bind(
      input.runId, input.missionId, input.stageId, input.agentId, input.expiresAt, input.now, input.status,
    ).first<Row>();
    return current ? 'accepted' : 'invalid';
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
      INSERT OR IGNORE INTO notifications (id, user_id, title, detail, tone, is_read, created_at)
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

  async getUserPinmeCredential(userId: string): Promise<UserPinmeCredentialRecord | null> {
    const row = await this.db.prepare(`
      SELECT user_id, address_hint, ciphertext, iv, updated_at
      FROM user_pinme_credentials
      WHERE user_id = ?
    `).bind(userId).first<Row>();
    return row ? {
      userId: text(row.user_id),
      addressHint: text(row.address_hint),
      ciphertext: text(row.ciphertext),
      iv: text(row.iv),
      updatedAt: text(row.updated_at),
    } : null;
  }

  async saveUserPinmeCredential(credential: UserPinmeCredentialRecord): Promise<UserPinmeCredentialRecord> {
    await this.db.prepare(`
      INSERT INTO user_pinme_credentials (user_id, address_hint, ciphertext, iv, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        address_hint = excluded.address_hint,
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        updated_at = excluded.updated_at
    `).bind(
      credential.userId,
      credential.addressHint,
      credential.ciphertext,
      credential.iv,
      credential.updatedAt,
    ).run();
    return credential;
  }

  async deleteUserPinmeCredential(userId: string): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM user_pinme_credentials WHERE user_id = ?').bind(userId).run();
    return result.meta.changes > 0;
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

  async setArbitrationMember(userId: string, active: boolean, actorId: string, updatedAt: string, power?: number): Promise<ArbitrationMember | null> {
    const profile = await this.db.prepare('SELECT id FROM profiles WHERE id = ?').bind(userId).first<Row>();
    if (!profile) return null;
    const existing = await this.db.prepare('SELECT status, power FROM arbitration_members WHERE user_id = ?').bind(userId).first<Row>();
    const status: ArbitrationMember['status'] = active ? 'active' : 'inactive';
    const action = !existing ? 'appointed' : active ? 'activated' : 'deactivated';
    const nextPower = power === undefined ? Math.max(1, number(existing?.power) || 1) : Math.max(1, Math.floor(power));
    await this.db.batch([
      this.db.prepare(`
        INSERT INTO arbitration_members (user_id, status, power, appointed_by, appointed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET status = excluded.status, power = excluded.power, updated_at = excluded.updated_at
      `).bind(userId, status, nextPower, actorId, updatedAt, updatedAt),
      this.db.prepare(`
        INSERT INTO arbitration_member_actions (id, user_id, actor_id, action, power, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(`ARB-${crypto.randomUUID()}`, userId, actorId, action, nextPower, updatedAt),
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

  private async expireDeveloperLedgerExports(now: string): Promise<void> {
    const condition = `
      (j.status IN ('queued', 'processing') AND julianday(j.expires_at) <= julianday(?))
      OR (j.status = 'completed' AND EXISTS (
        SELECT 1 FROM export_artifacts a WHERE a.job_id = j.id AND a.deleted_at IS NULL
          AND julianday(a.expires_at) <= julianday(?)
      ))
    `;
    await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT j.id || ':expired:' || j.attempt, j.id, 'system', NULL, 'expired', '{"reason":"retention"}', ?
        FROM export_jobs j WHERE ${condition}
      `).bind(now, now, now),
      this.db.prepare(`
        UPDATE export_jobs AS j SET status = 'expired', lease_owner = NULL, lease_expires_at = NULL,
          updated_at = ?
        WHERE ${condition}
      `).bind(now, now, now),
      this.db.prepare(`
        UPDATE export_artifacts SET deleted_at = ?
        WHERE deleted_at IS NULL AND julianday(expires_at) <= julianday(?)
      `).bind(now, now),
    ]);
  }

  async requestDeveloperLedgerExport(ownerId: string, token: string, requestedAt: string): Promise<LedgerExportRequestResult> {
    await this.expireDeveloperLedgerExports(requestedAt);
    const countRow = await this.db.prepare(`
      SELECT
        COUNT(*) AS count,
        (SELECT le2.created_at FROM ledger_entries le2 JOIN agents a2 ON a2.id = le2.agent_id
          WHERE a2.owner_id = ? AND le2.token = ? ORDER BY le2.created_at DESC, le2.id DESC LIMIT 1) AS snapshot_created_at,
        (SELECT le3.id FROM ledger_entries le3 JOIN agents a3 ON a3.id = le3.agent_id
          WHERE a3.owner_id = ? AND le3.token = ? ORDER BY le3.created_at DESC, le3.id DESC LIMIT 1) AS snapshot_id
      FROM ledger_entries le JOIN agents a ON a.id = le.agent_id
      WHERE a.owner_id = ? AND le.token = ?
    `).bind(ownerId, token, ownerId, token, ownerId, token).first<Row>();
    const rowCount = number(countRow?.count);
    if (rowCount <= MAX_DIRECT_LEDGER_EXPORT_ROWS) return { mode: 'direct', rowCount };
    const existing = await this.db.prepare(`${ledgerExportSelect}
      WHERE j.owner_id = ? AND j.token = ? AND j.status IN ('queued', 'processing', 'completed')
      ORDER BY j.created_at DESC LIMIT 1
    `).bind(ownerId, token).first<Row>();
    if (existing) return { mode: 'async', job: mapLedgerExportJob(existing) };
    const id = `EXPORT-${crypto.randomUUID()}`;
    const expiresAt = exportJobExpiresAt(requestedAt);
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO export_jobs
          (id, owner_id, export_type, token, status, total_rows, snapshot_created_at, snapshot_id,
           processed_rows, progress, attempt,
           expires_at, created_at, updated_at)
        VALUES (?, ?, 'developer_ledger', ?, 'queued', ?, ?, ?, 0, 0, 1, ?, ?, ?)
      `).bind(
        id, ownerId, token, rowCount, text(countRow?.snapshot_created_at), text(countRow?.snapshot_id),
        expiresAt, requestedAt, requestedAt,
      ),
      this.db.prepare(`
        INSERT INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT ?, ?, 'user', ?, 'created', ?, ? WHERE EXISTS (SELECT 1 FROM export_jobs WHERE id = ?)
      `).bind(`${id}:created`, id, ownerId, JSON.stringify({ token, totalRows: rowCount, attempt: 1 }), requestedAt, id),
    ]);
    const selected = Number(results[0]?.meta?.changes ?? 0) > 0
      ? await this.db.prepare(`${ledgerExportSelect} WHERE j.id = ?`).bind(id).first<Row>()
      : await this.db.prepare(`${ledgerExportSelect}
          WHERE j.owner_id = ? AND j.token = ? AND j.status IN ('queued', 'processing', 'completed')
          ORDER BY j.created_at DESC LIMIT 1
        `).bind(ownerId, token).first<Row>();
    if (!selected) throw new Error('EXPORT_JOB_CREATE_FAILED');
    return { mode: 'async', job: mapLedgerExportJob(selected) };
  }

  async listDeveloperLedgerExports(ownerId: string, now: string): Promise<LedgerExportJob[]> {
    await this.expireDeveloperLedgerExports(now);
    const { results } = await this.db.prepare(`${ledgerExportSelect}
      WHERE j.owner_id = ? ORDER BY j.created_at DESC, j.id DESC LIMIT 50
    `).bind(ownerId).all<Row>();
    return results.map(mapLedgerExportJob);
  }

  async getDeveloperLedgerExport(ownerId: string, id: string, now: string): Promise<LedgerExportJob | null> {
    await this.expireDeveloperLedgerExports(now);
    const row = await this.db.prepare(`${ledgerExportSelect} WHERE j.id = ? AND j.owner_id = ?`)
      .bind(id, ownerId).first<Row>();
    return row ? mapLedgerExportJob(row) : null;
  }

  async cancelDeveloperLedgerExport(ownerId: string, id: string, cancelledAt: string): Promise<LedgerExportMutationResult> {
    await this.expireDeveloperLedgerExports(cancelledAt);
    const existing = await this.getDeveloperLedgerExport(ownerId, id, cancelledAt);
    if (!existing) return { state: 'missing' };
    if (existing.status === 'cancelled') return { state: 'unchanged', job: existing };
    if (!['queued', 'processing'].includes(existing.status)) return { state: 'invalid_state' };
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE export_jobs SET status = 'cancelled', cancelled_at = ?, lease_owner = NULL,
          lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND owner_id = ? AND status IN ('queued', 'processing')
      `).bind(cancelledAt, cancelledAt, id, ownerId),
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT ?, id, 'user', ?, 'cancelled', ?, ? FROM export_jobs
        WHERE id = ? AND owner_id = ? AND status = 'cancelled' AND cancelled_at = ?
      `).bind(`${id}:cancelled:${existing.attempt}`, ownerId, JSON.stringify({ attempt: existing.attempt }), cancelledAt, id, ownerId, cancelledAt),
    ]);
    const job = await this.getDeveloperLedgerExport(ownerId, id, cancelledAt);
    return Number(results[0]?.meta?.changes ?? 0) > 0 && job ? { state: 'applied', job } : { state: 'invalid_state' };
  }

  async retryDeveloperLedgerExport(ownerId: string, id: string, retriedAt: string): Promise<LedgerExportMutationResult> {
    await this.expireDeveloperLedgerExports(retriedAt);
    const existing = await this.getDeveloperLedgerExport(ownerId, id, retriedAt);
    if (!existing) return { state: 'missing' };
    if (existing.status !== 'failed' || Date.parse(retriedAt) >= Date.parse(existing.expiresAt)) return { state: 'invalid_state' };
    const activeSibling = await this.db.prepare(`
      SELECT id FROM export_jobs
      WHERE owner_id = ? AND token = ? AND id <> ? AND status IN ('queued', 'processing', 'completed')
      LIMIT 1
    `).bind(ownerId, existing.token, id).first<Row>();
    if (activeSibling) return { state: 'invalid_state' };
    const nextAttempt = existing.attempt + 1;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE export_jobs SET status = 'queued', processed_rows = 0, progress = 0, attempt = ?,
          lease_owner = NULL, lease_expires_at = NULL, error_code = NULL, error_message = NULL,
          started_at = NULL, completed_at = NULL, cancelled_at = NULL, updated_at = ?
        WHERE id = ? AND owner_id = ? AND status = 'failed' AND attempt = ?
          AND julianday(expires_at) > julianday(?)
          AND NOT EXISTS (
            SELECT 1 FROM export_jobs sibling
            WHERE sibling.owner_id = export_jobs.owner_id AND sibling.token = export_jobs.token
              AND sibling.id <> export_jobs.id AND sibling.status IN ('queued', 'processing', 'completed')
          )
      `).bind(nextAttempt, retriedAt, id, ownerId, existing.attempt, retriedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT ?, id, 'user', ?, 'retried', ?, ? FROM export_jobs
        WHERE id = ? AND owner_id = ? AND status = 'queued' AND attempt = ?
      `).bind(`${id}:retried:${nextAttempt}`, ownerId, JSON.stringify({ attempt: nextAttempt }), retriedAt, id, ownerId, nextAttempt),
    ]);
    const job = await this.getDeveloperLedgerExport(ownerId, id, retriedAt);
    return Number(results[0]?.meta?.changes ?? 0) > 0 && job ? { state: 'applied', job } : { state: 'invalid_state' };
  }

  async claimDeveloperLedgerExport(workerId: string, claimedAt: string): Promise<LedgerExportClaim | null> {
    await this.expireDeveloperLedgerExports(claimedAt);
    await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT id || ':lease_expired:' || attempt, id, 'system', NULL, 'retried',
          json_object('attempt', attempt + 1, 'reason', 'lease_expired'), ?
        FROM export_jobs WHERE status = 'processing' AND julianday(lease_expires_at) <= julianday(?)
      `).bind(claimedAt, claimedAt),
      this.db.prepare(`
        UPDATE export_jobs SET status = 'queued', processed_rows = 0, progress = 0, attempt = attempt + 1,
          lease_owner = NULL, lease_expires_at = NULL, error_code = 'LEASE_EXPIRED',
          error_message = 'Previous export worker lease expired', updated_at = ?
        WHERE status = 'processing' AND julianday(lease_expires_at) <= julianday(?)
      `).bind(claimedAt, claimedAt),
    ]);
    const candidate = await this.db.prepare(`
      SELECT id FROM export_jobs WHERE status = 'queued' AND julianday(expires_at) > julianday(?)
      ORDER BY created_at ASC, id ASC LIMIT 1
    `).bind(claimedAt).first<Row>();
    if (!candidate) return null;
    const id = text(candidate.id);
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE export_jobs SET status = 'processing', lease_owner = ?, lease_expires_at = ?,
          started_at = COALESCE(started_at, ?), error_code = NULL, error_message = NULL, updated_at = ?
        WHERE id = ? AND status = 'queued'
      `).bind(workerId, exportLeaseExpiresAt(claimedAt), claimedAt, claimedAt, id),
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT id || ':claimed:' || attempt, id, 'service', ?, 'claimed', json_object('attempt', attempt, 'workerId', ?), ?
        FROM export_jobs WHERE id = ? AND status = 'processing' AND lease_owner = ?
      `).bind(workerId, workerId, claimedAt, id, workerId),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
    const row = await this.db.prepare(`${ledgerExportSelect} WHERE j.id = ?`).bind(id).first<Row>();
    return row ? {
      job: mapLedgerExportJob(row), ownerId: text(row.owner_id), exportType: 'developer_ledger',
      snapshot: { createdAt: text(row.snapshot_created_at), id: text(row.snapshot_id) },
    } : null;
  }

  async updateDeveloperLedgerExportProgress(id: string, workerId: string, attempt: number, processedRows: number, updatedAt: string): Promise<LedgerExportJob | null> {
    await this.expireDeveloperLedgerExports(updatedAt);
    const row = await this.db.prepare('SELECT total_rows, attempt FROM export_jobs WHERE id = ?').bind(id).first<Row>();
    if (!row || processedRows < 0 || processedRows > number(row.total_rows)) return null;
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE export_jobs SET processed_rows = ?, progress = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'processing' AND lease_owner = ? AND attempt = ? AND processed_rows <= ?
          AND julianday(lease_expires_at) > julianday(?) AND julianday(expires_at) > julianday(?)
      `).bind(processedRows, exportProgress(processedRows, number(row.total_rows)), exportLeaseExpiresAt(updatedAt), updatedAt,
        id, workerId, attempt, processedRows, updatedAt, updatedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT ? || ':progress:' || attempt || ':' || ?, id, 'service', ?, 'progressed',
          json_object('attempt', attempt, 'processedRows', ?, 'totalRows', total_rows), ?
        FROM export_jobs WHERE id = ? AND status = 'processing' AND lease_owner = ? AND attempt = ? AND processed_rows = ?
          AND julianday(lease_expires_at) > julianday(?) AND julianday(expires_at) > julianday(?)
      `).bind(id, processedRows, workerId, processedRows, updatedAt, id, workerId, attempt, processedRows, updatedAt, updatedAt),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
    const selected = await this.db.prepare(`${ledgerExportSelect}
      WHERE j.id = ? AND j.status = 'processing' AND j.lease_owner = ? AND j.attempt = ?
        AND julianday(j.lease_expires_at) > julianday(?) AND julianday(j.expires_at) > julianday(?)
    `).bind(id, workerId, attempt, updatedAt, updatedAt).first<Row>();
    return selected ? mapLedgerExportJob(selected) : null;
  }

  async completeDeveloperLedgerExport(input: {
    id: string; workerId: string; attempt: number; objectKey: string; sha256: string; rowCount: number; byteSize: number; completedAt: string;
  }): Promise<LedgerExportJob | null> {
    if (!input.objectKey.startsWith(`private/exports/${input.id}/`)) return null;
    await this.expireDeveloperLedgerExports(input.completedAt);
    const artifactId = `EXPORT-ARTIFACT-${crypto.randomUUID()}`;
    const expiresAt = exportArtifactExpiresAt(input.completedAt);
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE export_jobs SET status = 'completed', processed_rows = total_rows, progress = 100,
          completed_at = ?, expires_at = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND status = 'processing' AND lease_owner = ? AND attempt = ? AND total_rows = ?
          AND julianday(lease_expires_at) > julianday(?) AND julianday(expires_at) > julianday(?)
      `).bind(input.completedAt, expiresAt, input.completedAt, input.id, input.workerId, input.attempt, input.rowCount,
        input.completedAt, input.completedAt),
      this.db.prepare(`
        INSERT INTO export_artifacts
          (id, job_id, object_key, sha256, content_type, row_count, byte_size, created_at, expires_at)
        SELECT ?, id, ?, ?, 'text/csv', total_rows, ?, ?, ? FROM export_jobs
        WHERE id = ? AND status = 'completed' AND completed_at = ?
          AND NOT EXISTS (SELECT 1 FROM export_artifacts WHERE job_id = ?)
      `).bind(artifactId, input.objectKey, input.sha256, input.byteSize, input.completedAt, expiresAt, input.id, input.completedAt, input.id),
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT id || ':completed:' || attempt, id, 'service', ?, 'completed',
          json_object('attempt', attempt, 'rowCount', total_rows, 'byteSize', ?), ?
        FROM export_jobs WHERE id = ? AND status = 'completed' AND completed_at = ?
      `).bind(input.workerId, input.byteSize, input.completedAt, input.id, input.completedAt),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
    const row = await this.db.prepare(`${ledgerExportSelect} WHERE j.id = ?`).bind(input.id).first<Row>();
    return row ? mapLedgerExportJob(row) : null;
  }

  async failDeveloperLedgerExport(id: string, workerId: string, attempt: number, errorCode: string, errorMessage: string, failedAt: string): Promise<LedgerExportJob | null> {
    await this.expireDeveloperLedgerExports(failedAt);
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE export_jobs SET status = 'failed', error_code = ?, error_message = ?,
          lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE id = ? AND status = 'processing' AND lease_owner = ? AND attempt = ?
          AND julianday(lease_expires_at) > julianday(?) AND julianday(expires_at) > julianday(?)
      `).bind(errorCode, errorMessage, failedAt, id, workerId, attempt, failedAt, failedAt),
      this.db.prepare(`
        INSERT OR IGNORE INTO export_job_events (id, job_id, actor_type, actor_id, action, detail_json, created_at)
        SELECT id || ':failed:' || attempt, id, 'service', ?, 'failed',
          json_object('attempt', attempt, 'errorCode', error_code), ?
        FROM export_jobs WHERE id = ? AND status = 'failed' AND error_code = ? AND attempt = ?
      `).bind(workerId, failedAt, id, errorCode, attempt),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return null;
    const row = await this.db.prepare(`${ledgerExportSelect} WHERE j.id = ?`).bind(id).first<Row>();
    return row ? mapLedgerExportJob(row) : null;
  }

  async getDeveloperLedgerExportArtifact(ownerId: string, id: string, now: string): Promise<LedgerExportPrivateArtifact | null> {
    await this.expireDeveloperLedgerExports(now);
    const row = await this.db.prepare(`
      SELECT a.* FROM export_artifacts a JOIN export_jobs j ON j.id = a.job_id
      WHERE j.id = ? AND j.owner_id = ? AND j.status = 'completed' AND a.deleted_at IS NULL
        AND julianday(a.expires_at) > julianday(?)
    `).bind(id, ownerId, now).first<Row>();
    return row ? {
      id: text(row.id), objectKey: text(row.object_key), sha256: text(row.sha256), contentType: 'text/csv',
      rowCount: number(row.row_count), byteSize: number(row.byte_size), createdAt: text(row.created_at), expiresAt: text(row.expires_at),
    } : null;
  }

  async recordRewardActivity(activity: RewardActivity): Promise<boolean> {
    const result = await this.db.prepare(`
      INSERT OR IGNORE INTO reward_activities
        (id, source_key, user_id, mission_id, dispute_id, role, formula_version, asset, settled_amount, quality_bps,
         penalty_bps, score_micros, eligible, detail_json, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      activity.id, activity.sourceKey, activity.userId, activity.missionId, activity.disputeId,
      activity.role, activity.formulaVersion, activity.asset, activity.settledAmount, activity.qualityBps, activity.penaltyBps,
      activity.scoreMicros, activity.eligible ? 1 : 0, JSON.stringify(activity.detail), activity.occurredAt, activity.createdAt,
    ).run();
    return result.meta.changes > 0;
  }

  async createRewardEpoch(epoch: RewardEpoch): Promise<RewardEpoch> {
    await this.db.batch([this.db.prepare(`
      INSERT INTO reward_epochs
        (id, epoch_number, status, starts_at, ends_at, claim_ends_at, total_reward_units,
         account_score_cap, formula_version, rules_json, chain_id, distributor_address,
         merkle_root, manifest_hash, publish_tx_hash, computed_at, published_at,
         created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      epoch.id, epoch.epochNumber, epoch.status, epoch.startsAt, epoch.endsAt, epoch.claimEndsAt,
      epoch.totalRewardUnits, epoch.accountScoreCap, epoch.formulaVersion, JSON.stringify(epoch.rules),
      epoch.chainId, epoch.distributorAddress.toLocaleLowerCase(), epoch.merkleRoot, epoch.manifestHash,
      epoch.publishTxHash, epoch.computedAt, epoch.publishedAt, epoch.createdBy, epoch.createdAt, epoch.updatedAt,
    ), this.db.prepare(`
      INSERT INTO yd_admin_actions (id, actor_id, action, target_id, detail_json, created_at)
      VALUES (?, ?, 'reward_epoch_created', ?, ?, ?)
    `).bind(
      `YDACTION-${crypto.randomUUID()}`, epoch.createdBy, epoch.id,
      JSON.stringify({ epochNumber: epoch.epochNumber, totalRewardUnits: epoch.totalRewardUnits }), epoch.createdAt,
    )]);
    return epoch;
  }

  async listRewardEpochs(): Promise<RewardEpoch[]> {
    const { results } = await this.db.prepare('SELECT * FROM reward_epochs ORDER BY epoch_number DESC').all<Row>();
    return results.map(mapRewardEpoch);
  }

  async getRewardEpoch(id: string): Promise<RewardEpoch | null> {
    const row = await this.db.prepare('SELECT * FROM reward_epochs WHERE id = ?').bind(id).first<Row>();
    return row ? mapRewardEpoch(row) : null;
  }

  async listRewardAllocations(epochId: string): Promise<RewardAllocation[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM reward_allocations WHERE epoch_id = ? ORDER BY wallet_address ASC
    `).bind(epochId).all<Row>();
    return results.map(mapRewardAllocation);
  }

  async computeRewardEpoch(id: string, computedAt: string, actorId: string): Promise<RewardEpochComputeResult> {
    const epoch = await this.getRewardEpoch(id);
    if (!epoch) return { state: 'missing' };
    if (epoch.status !== 'draft') return { state: 'not_draft' };
    const [{ results: activityRows }, { results: profileRows }] = await Promise.all([
      this.db.prepare(`
        SELECT * FROM reward_activities
        WHERE eligible = 1 AND formula_version = ?
          AND NOT EXISTS (SELECT 1 FROM arbitration_reward_epoch_items used WHERE used.activity_id=reward_activities.id)
          AND (julianday(occurred_at) >= julianday(?) OR json_extract(detail_json,'$.source')='reviewed_arbitration_work') AND julianday(occurred_at) < julianday(?)
        ORDER BY occurred_at ASC, id ASC
      `).bind(epoch.formulaVersion, epoch.startsAt, epoch.endsAt).all<Row>(),
      this.db.prepare("SELECT id, wallet_address FROM profiles WHERE wallet_address IS NOT NULL AND wallet_address <> ''").all<Row>(),
    ]);
    const wallets = new Map<string, Address>();
    for (const row of profileRows) {
      const wallet = text(row.wallet_address).toLocaleLowerCase();
      if (/^0x[a-f0-9]{40}$/.test(wallet)) wallets.set(text(row.id), wallet as Address);
    }
    let computed;
    try {
      computed = allocateRewardEpoch({
        epochNumber: epoch.epochNumber,
        chainId: epoch.chainId,
        distributorAddress: epoch.distributorAddress as Address,
        totalRewardUnits: BigInt(epoch.totalRewardUnits),
        accountScoreCap: epoch.accountScoreCap,
        activities: activityRows.map(mapRewardActivity),
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
    const statements: D1Statement[] = [this.db.prepare(`
      UPDATE reward_epochs SET status = 'computed', merkle_root = ?, manifest_hash = ?, computed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'draft'
    `).bind(computed.merkleRoot, computed.manifestHash, computedAt, computedAt, id)];
    for (const activity of activityRows.map(mapRewardActivity).filter(a => a.detail.source === 'reviewed_arbitration_work')) {
      statements.push(this.db.prepare(`INSERT INTO arbitration_reward_epoch_items (activity_id,epoch_id)
        SELECT ?,? WHERE EXISTS (SELECT 1 FROM reward_epochs WHERE id=? AND status='computed' AND computed_at=?)`)
        .bind(activity.id,id,id,computedAt));
    }
    for (const allocation of allocations) {
      statements.push(this.db.prepare(`
        INSERT INTO reward_allocations
          (id, epoch_id, user_id, wallet_address, effective_score, amount_units, leaf_hash, proof_json, status, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'unclaimed', ?
        WHERE EXISTS (SELECT 1 FROM reward_epochs WHERE id = ? AND status = 'computed' AND computed_at = ?)
      `).bind(
        allocation.id, allocation.epochId, allocation.userId, allocation.walletAddress,
        allocation.effectiveScore, allocation.amountUnits, allocation.leafHash, JSON.stringify(allocation.proof),
        allocation.createdAt, id, computedAt,
      ));
    }
    statements.push(this.db.prepare(`
      INSERT INTO yd_admin_actions (id, actor_id, action, target_id, detail_json, created_at)
      SELECT ?, ?, 'reward_epoch_computed', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM reward_epochs WHERE id = ? AND status = 'computed' AND computed_at = ?)
    `).bind(
      `YDACTION-${crypto.randomUUID()}`, actorId, id,
      JSON.stringify({ merkleRoot: computed.merkleRoot, manifestHash: computed.manifestHash, allocations: allocations.length }),
      computedAt, id, computedAt,
    ));
    const results = await this.db.batch(statements);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) return { state: 'not_draft' };
    return { state: 'computed', epoch: (await this.getRewardEpoch(id))!, allocations };
  }

  async markRewardEpochPublished(id: string, txHash: string, publishedAt: string, actorId: string): Promise<RewardEpoch | null> {
    await this.db.batch([this.db.prepare(`
      UPDATE reward_epochs SET status = 'published', publish_tx_hash = ?, published_at = ?, updated_at = ?
      WHERE id = ? AND status = 'computed' AND merkle_root IS NOT NULL
    `).bind(txHash, publishedAt, publishedAt, id), this.db.prepare(`
      INSERT INTO yd_admin_actions (id, actor_id, action, target_id, detail_json, created_at)
      SELECT ?, ?, 'reward_epoch_published', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM reward_epochs WHERE id = ? AND publish_tx_hash = ?)
    `).bind(
      `YDACTION-${crypto.randomUUID()}`, actorId, id, JSON.stringify({ txHash }), publishedAt, id, txHash,
    )]);
    return this.getRewardEpoch(id);
  }

  async markRewardEpochExpired(id: string, txHash: string, expiredAt: string, actorId: string): Promise<RewardEpoch | null> {
    await this.db.batch([
      this.db.prepare(`
        UPDATE reward_epochs SET status = 'expired', updated_at = ?
        WHERE id = ? AND status = 'published' AND julianday(claim_ends_at) < julianday(?)
      `).bind(expiredAt, id, expiredAt),
      this.db.prepare(`
        UPDATE reward_allocations SET status = 'expired'
        WHERE epoch_id = ? AND status = 'unclaimed'
          AND EXISTS (SELECT 1 FROM reward_epochs WHERE id = ? AND status = 'expired' AND updated_at = ?)
      `).bind(id, id, expiredAt),
      this.db.prepare(`
        INSERT INTO yd_admin_actions (id, actor_id, action, target_id, detail_json, created_at)
        SELECT ?, ?, 'reward_epoch_swept', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM reward_epochs WHERE id = ? AND status = 'expired' AND updated_at = ?)
      `).bind(`YDACTION-${crypto.randomUUID()}`, actorId, id, JSON.stringify({ txHash }), expiredAt, id, expiredAt),
    ]);
    return this.getRewardEpoch(id);
  }

  async getYdFinanceOverview(userId: string, now = new Date().toISOString()): Promise<YdFinanceOverview> {
    const [epochs, allocationRows, activityRows, stakingRow, governance] = await Promise.all([
      this.listRewardEpochs(),
      this.db.prepare(`
        SELECT a.* FROM reward_allocations a JOIN reward_epochs e ON e.id = a.epoch_id
        WHERE a.user_id = ? ORDER BY e.epoch_number DESC
      `).bind(userId).all<Row>(),
      this.db.prepare('SELECT * FROM reward_activities WHERE user_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 100').bind(userId).all<Row>(),
      this.db.prepare('SELECT * FROM staking_positions WHERE user_id = ?').bind(userId).first<Row>(),
      this.listEcosystemGovernance(userId, now),
    ]);
    return {
      epochs,
      allocations: allocationRows.results.map(mapRewardAllocation),
      activities: activityRows.results.map(mapRewardActivity),
      staking: stakingRow ? mapStakingPosition(stakingRow) : null,
      governance,
    };
  }

  async recordRewardClaim(claim: RewardClaim): Promise<{ claim: RewardClaim; applied: boolean } | null> {
    const allocation = await this.db.prepare(`
      SELECT * FROM reward_allocations WHERE epoch_id = ? AND user_id = ? AND wallet_address = ?
    `).bind(claim.epochId, claim.userId, claim.walletAddress.toLocaleLowerCase()).first<Row>();
    if (!allocation || text(allocation.amount_units) !== claim.amountUnits) return null;
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO reward_claims
          (id, epoch_id, user_id, wallet_address, amount_units, tx_hash, block_number, log_index, claimed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        claim.id, claim.epochId, claim.userId, claim.walletAddress.toLocaleLowerCase(), claim.amountUnits,
        claim.txHash, claim.blockNumber, claim.logIndex, claim.claimedAt,
      ),
      this.db.prepare(`
        UPDATE reward_allocations SET status = 'claimed', claim_tx_hash = ?, claimed_at = ?
        WHERE epoch_id = ? AND user_id = ? AND status IN ('unclaimed', 'expired')
          AND EXISTS (SELECT 1 FROM reward_claims WHERE epoch_id = ? AND user_id = ? AND tx_hash = ? AND log_index = ?)
      `).bind(
        claim.txHash, claim.claimedAt, claim.epochId, claim.userId,
        claim.epochId, claim.userId, claim.txHash, claim.logIndex,
      ),
    ]);
    return { claim, applied: Number(results[0]?.meta?.changes ?? 0) > 0 };
  }

  async syncYdStakingPosition(position: YdStakingPosition): Promise<YdStakingPosition> {
    await this.db.prepare(`
      INSERT INTO staking_positions
        (user_id, wallet_address, amount_units, unlock_time, duration_seconds, reputation_bps, raw_power,
         delegated_to, voting_power, verified, last_tx_hash, last_block_number, last_log_index, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        wallet_address = excluded.wallet_address,
        amount_units = excluded.amount_units,
        unlock_time = excluded.unlock_time,
        duration_seconds = excluded.duration_seconds,
        reputation_bps = excluded.reputation_bps,
        raw_power = excluded.raw_power,
        delegated_to = excluded.delegated_to,
        voting_power = excluded.voting_power,
        verified = excluded.verified,
        last_tx_hash = excluded.last_tx_hash,
        last_block_number = excluded.last_block_number,
        last_log_index = excluded.last_log_index,
        updated_at = excluded.updated_at
      WHERE staking_positions.last_block_number IS NULL
        OR CAST(excluded.last_block_number AS INTEGER) > CAST(staking_positions.last_block_number AS INTEGER)
        OR (CAST(excluded.last_block_number AS INTEGER) = CAST(staking_positions.last_block_number AS INTEGER)
          AND excluded.last_log_index >= COALESCE(staking_positions.last_log_index, -1))
    `).bind(
      position.userId, position.walletAddress.toLocaleLowerCase(), position.amountUnits, position.unlockTime,
      position.durationSeconds, position.reputationBps, position.rawPower, position.delegatedTo?.toLocaleLowerCase() ?? null,
      position.votingPower, position.verified ? 1 : 0, position.lastTxHash, position.lastBlockNumber,
      position.lastLogIndex, position.updatedAt,
    ).run();
    const row = await this.db.prepare('SELECT * FROM staking_positions WHERE user_id = ?').bind(position.userId).first<Row>();
    return row ? mapStakingPosition(row) : position;
  }

  async listGovernanceCandidates(): Promise<Array<{ userId: string; walletAddress: string }>> {
    const { results } = await this.db.prepare(`
      SELECT id, lower(wallet_address) AS wallet_address FROM profiles
      WHERE wallet_address IS NOT NULL AND wallet_address <> ''
      ORDER BY id ASC
    `).all<Row>();
    return results
      .map((row) => ({ userId: text(row.id), walletAddress: text(row.wallet_address) }))
      .filter((item) => /^0x[a-f0-9]{40}$/.test(item.walletAddress));
  }

  async createEcosystemProposal(proposal: EcosystemProposal, electorate: GovernancePowerSnapshot[]): Promise<EcosystemGovernanceDetail> {
    const statements: D1Statement[] = [this.db.prepare(`
      INSERT INTO governance_proposals
        (id, proposal_number, proposer_id, proposal_type, title, description, payload_json, status,
         snapshot_block, starts_at, ends_at, quorum_bps, approval_bps, eligible_power,
         for_power, against_power, abstain_power, finalized_at, finalized_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      proposal.id, proposal.proposalNumber, proposal.proposerId, proposal.proposalType, proposal.title,
      proposal.description, JSON.stringify(proposal.payload), proposal.status, proposal.snapshotBlock,
      proposal.startsAt, proposal.endsAt, proposal.quorumBps, proposal.approvalBps, proposal.eligiblePower,
      proposal.forPower, proposal.againstPower, proposal.abstainPower, proposal.finalizedAt,
      proposal.finalizedBy, proposal.createdAt,
    )];
    for (const snapshot of electorate) {
      statements.push(this.db.prepare(`
        INSERT INTO governance_power_snapshots
          (proposal_id, user_id, wallet_address, power, delegate_sources_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        snapshot.proposalId, snapshot.userId, snapshot.walletAddress.toLocaleLowerCase(), snapshot.power,
        JSON.stringify(snapshot.delegateSources), snapshot.createdAt,
      ));
    }
    statements.push(this.db.prepare(`
      INSERT INTO yd_admin_actions (id, actor_id, action, target_id, detail_json, created_at)
      VALUES (?, ?, 'governance_proposal_created', ?, ?, ?)
    `).bind(
      `YDACTION-${crypto.randomUUID()}`, proposal.proposerId, proposal.id,
      JSON.stringify({ snapshotBlock: proposal.snapshotBlock, eligiblePower: proposal.eligiblePower }), proposal.createdAt,
    ));
    await this.db.batch(statements);
    return (await this.getEcosystemGovernance(proposal.id, proposal.proposerId, proposal.createdAt))!;
  }

  private async getEcosystemGovernance(id: string, userId: string, now = new Date().toISOString()): Promise<EcosystemGovernanceDetail | null> {
    const proposalRow = await this.db.prepare('SELECT * FROM governance_proposals WHERE id = ?').bind(id).first<Row>();
    if (!proposalRow) return null;
    const [snapshotRows, voteRows] = await Promise.all([
      this.db.prepare('SELECT * FROM governance_power_snapshots WHERE proposal_id = ? ORDER BY user_id ASC').bind(id).all<Row>(),
      this.db.prepare('SELECT * FROM governance_votes WHERE proposal_id = ? ORDER BY created_at ASC, id ASC').bind(id).all<Row>(),
    ]);
    const proposal = mapEcosystemProposal(proposalRow);
    const electorate = snapshotRows.results.map(mapGovernanceSnapshot);
    const votes = voteRows.results.map(mapEcosystemVote);
    const snapshot = electorate.find((item) => item.userId === userId);
    const vote = votes.find((item) => item.voterId === userId);
    return {
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
    };
  }

  async listEcosystemGovernance(userId: string, now = new Date().toISOString()): Promise<EcosystemGovernanceDetail[]> {
    const { results } = await this.db.prepare('SELECT id FROM governance_proposals ORDER BY proposal_number DESC').all<Row>();
    const details = await Promise.all(results.map((row) => this.getEcosystemGovernance(text(row.id), userId, now)));
    return details.filter((detail): detail is EcosystemGovernanceDetail => detail !== null);
  }

  async castEcosystemVote(
    id: string,
    voterId: string,
    choice: EcosystemVoteChoice,
    reason: string,
    votedAt: string,
  ): Promise<EcosystemVoteResult> {
    const governance = await this.getEcosystemGovernance(id, voterId, votedAt);
    if (!governance) return { state: 'missing' };
    if (!governance.currentUser.eligible) return { state: 'not_eligible' };
    if (governance.currentUser.hasVoted) return { state: 'already_voted' };
    if (governance.proposal.status !== 'active') return { state: 'closed' };
    if (Date.parse(votedAt) < Date.parse(governance.proposal.startsAt) || Date.parse(votedAt) > Date.parse(governance.proposal.endsAt)) {
      return { state: 'expired' };
    }
    const voteId = `YDVOTE-${crypto.randomUUID()}`;
    const results = await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO governance_votes
          (id, proposal_id, voter_id, wallet_address, choice, power, reason, created_at)
        SELECT ?, p.id, s.user_id, s.wallet_address, ?, s.power, ?, ?
        FROM governance_proposals p JOIN governance_power_snapshots s ON s.proposal_id = p.id
        WHERE p.id = ? AND s.user_id = ? AND p.status = 'active'
          AND julianday(?) >= julianday(p.starts_at) AND julianday(?) <= julianday(p.ends_at)
      `).bind(voteId, choice, reason, votedAt, id, voterId, votedAt, votedAt),
      this.db.prepare(`
        UPDATE governance_proposals SET
          for_power = CAST(CAST(for_power AS INTEGER) + CASE WHEN ? = 'for' THEN (SELECT CAST(power AS INTEGER) FROM governance_votes WHERE id = ?) ELSE 0 END AS TEXT),
          against_power = CAST(CAST(against_power AS INTEGER) + CASE WHEN ? = 'against' THEN (SELECT CAST(power AS INTEGER) FROM governance_votes WHERE id = ?) ELSE 0 END AS TEXT),
          abstain_power = CAST(CAST(abstain_power AS INTEGER) + CASE WHEN ? = 'abstain' THEN (SELECT CAST(power AS INTEGER) FROM governance_votes WHERE id = ?) ELSE 0 END AS TEXT)
        WHERE id = ? AND EXISTS (SELECT 1 FROM governance_votes WHERE id = ?)
      `).bind(choice, voteId, choice, voteId, choice, voteId, id, voteId),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) === 0) {
      const latest = await this.getEcosystemGovernance(id, voterId, votedAt);
      if (latest?.currentUser.hasVoted) return { state: 'already_voted' };
      return { state: 'closed' };
    }
    return { state: 'applied', governance: (await this.getEcosystemGovernance(id, voterId, votedAt))! };
  }

  async finalizeEcosystemProposal(id: string, actorId: string, finalizedAt: string): Promise<EcosystemFinalizeResult> {
    const governance = await this.getEcosystemGovernance(id, actorId, finalizedAt);
    if (!governance) return { state: 'missing' };
    if (governance.proposal.status !== 'active') return { state: 'finalized', governance };
    const evaluation = evaluateEcosystemProposal(
      governance.proposal,
      finalizedAt,
      governance.votes.length,
      governance.electorate.length,
    );
    if (!evaluation.finalizable) return { state: 'not_ready', governance };
    await this.db.batch([this.db.prepare(`
      UPDATE governance_proposals SET status = ?, finalized_at = ?, finalized_by = ?
      WHERE id = ? AND status = 'active'
    `).bind(evaluation.status, finalizedAt, actorId, id), this.db.prepare(`
      INSERT INTO yd_admin_actions (id, actor_id, action, target_id, detail_json, created_at)
      SELECT ?, ?, 'governance_proposal_finalized', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM governance_proposals WHERE id = ? AND finalized_at = ?)
    `).bind(
      `YDACTION-${crypto.randomUUID()}`, actorId, id, JSON.stringify({ status: evaluation.status }), finalizedAt, id, finalizedAt,
    )]);
    return { state: 'finalized', governance: (await this.getEcosystemGovernance(id, actorId, finalizedAt))! };
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
