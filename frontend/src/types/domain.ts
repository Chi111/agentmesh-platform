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
  arbitration: { status: 'active' | 'inactive'; power: number } | null;
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

export type MissionStatus = 'draft' | 'matching' | 'running' | 'paused' | 'review' | 'completed' | 'cancelled';

export type AgentStatus = 'trial' | 'active' | 'paused';
export type AgentMarketplaceStatus = 'registered' | 'verifying' | 'trial' | 'listed' | 'degraded' | 'suspended' | 'retired';
export type AgentQualityConfidence = 'low' | 'medium' | 'high';

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
  priceVersion?: number;
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
  quality?: AgentQualityProfile;
}

export interface AgentQualityBreakdown {
  reliability: number;
  quality: number;
  delivery: number;
  response: number;
  history: number;
  riskPenalty: number;
}

export interface AgentQualityProfile {
  agentId: string;
  marketplaceStatus: AgentMarketplaceStatus;
  reputation: number;
  breakdown: AgentQualityBreakdown;
  confidence: AgentQualityConfidence;
  settledJobs: number;
  successfulJobs: number;
  failedJobs: number;
  refundedJobs: number;
  trialPassed: boolean;
  endpointHealthy: boolean;
  payoutValid: boolean;
  unresolvedSevereRisks: number;
  premium: boolean;
  newAgent: boolean;
  eligibilityReasons: string[];
  formulaVersion: string;
  lastTrialAt: string | null;
  lastHealthCheckAt: string | null;
  updatedAt: string;
  gateMode: 'shadow' | 'enforce';
  eligible: boolean;
  wouldBeEligible: boolean;
}

export type AgentQualityStats = Omit<AgentQualityProfile, 'gateMode' | 'eligible' | 'wouldBeEligible'>;

export interface AgentFeedback {
  id: string;
  agentId: string;
  missionId: string;
  stageId: string;
  version: number;
  deliveryQuality: number;
  requirementsFit: number;
  communication: number;
  onTime: boolean;
  reuse: boolean;
  comment: string;
  effective: boolean;
  createdAt: string;
}

export interface AgentReputationSnapshot {
  id: string;
  agentId: string;
  evaluatedAt: string;
  formulaVersion: string;
  eventCount: number;
  reputation: number;
  breakdown: AgentQualityBreakdown;
  confidence: AgentQualityConfidence;
  marketplaceStatus: AgentMarketplaceStatus;
  eligibilityReasons: string[];
  createdAt: string;
}

export interface AgentQualityPublicDetail {
  agent: Agent;
  feedback: AgentFeedback[];
  snapshots: AgentReputationSnapshot[];
  cidPortfolio: AgentCidPortfolioItem[];
}

export interface AgentCidPortfolioItem {
  missionId: string;
  missionTitle: string;
  deliverableId: string;
  name: string;
  rootCid: string;
  manifestSha256: string;
  versionNo: number;
  visibility: 'public' | 'encrypted';
  verificationStatus: IpfsVerificationStatus;
  completedAt: string;
}

export interface AdminAgentQualityRow {
  agent: Agent;
  reasons: string[];
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
  priority: 'normal' | 'high' | 'urgent';
  expertise: ExpertiseLevel;
  yieldEnabled: boolean;
  status: MissionStatus;
  progress: number;
  createdAt: string;
  currentStage: string;
  team: string[];
  reviewDueAt: string | null;
  workflowVersion: number;
  workflowViewport: WorkflowViewport;
  pausedAt: string | null;
  pausedBy: string | null;
  pauseReason: string | null;
  pauseMode: 'requester' | 'emergency' | null;
  schedulerRevision: number;
}

export interface WorkflowViewport {
  x: number;
  y: number;
  zoom: number;
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
  nodeType: 'task' | 'approval';
  positionX: number;
  positionY: number;
  progress: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  attemptNo: number;
  attemptCreatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MissionChangeRequest {
  id: string;
  missionId: string;
  version: number;
  targetStageIds: string[];
  resetStageIds: string[];
  reason: string;
  acceptanceCriteria: string;
  requestedBy: string;
  priorStageState: Array<{
    stageId: string;
    attemptNo: number;
    status: WorkflowStage['status'];
    progress: number;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
  }>;
  status: 'applied';
  createdAt: string;
}

export interface WorkflowCheckpoint {
  id: string;
  missionId: string;
  sequence: number;
  kind: 'pause' | 'resume' | 'change_request' | 'reconciled';
  workflowVersion: number;
  schedulerRevision: number;
  changeVersion: number;
  schedulerState: 'clean' | 'dirty';
  payload: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export interface WorkflowEdge {
  id: string;
  missionId: string;
  sourceStageId: string;
  targetStageId: string;
  condition?: WorkflowCondition | null;
  mappings?: WorkflowFieldMapping[];
  createdAt?: string;
}

export type WorkflowCondition =
  | { op: 'exists'; path: string }
  | { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; path: string; value: string | number | boolean | null }
  | { op: 'in'; path: string; value: Array<string | number | boolean | null> }
  | { op: 'and' | 'or'; conditions: WorkflowCondition[] }
  | { op: 'not'; condition: WorkflowCondition };

export interface WorkflowFieldMapping {
  from: string;
  to: string;
  required?: boolean;
}

export interface WorkflowTransitionCheckpoint {
  id: string;
  missionId: string;
  edgeId: string;
  sourceStageId: string;
  targetStageId: string;
  sourceAttemptNo: number;
  workflowVersion: number;
  matched: boolean;
  mappedInput: Record<string, unknown>;
  missingRequired: string[];
  errorCode: string | null;
  createdAt: string;
}

export interface WorkflowTemplate {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTemplateVersion {
  templateId: string;
  version: number;
  nodes: WorkflowStage[];
  edges: WorkflowEdge[];
  entryIds: string[];
  exitIds: string[];
  contentHash: string;
  createdAt: string;
}

export interface WorkflowTemplateDetail {
  template: WorkflowTemplate;
  version: WorkflowTemplateVersion;
}

export interface StageOffer {
  id: string;
  missionId: string;
  stageId: string;
  agentId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  quote: StageQuote;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StageQuote {
  amount: number;
  token: 'CREDIT' | 'mUSDC' | 'sETH';
  basePriceUsdc: number;
  agentPriceVersion: number;
  formulaVersion: string;
  comparableToBasePrice: boolean;
  multipliers: {
    complexity: number;
    urgency: number;
    expertise: number;
    load: number;
  };
}

export interface CandidateMatch {
  stageId: string;
  stageName: string;
  candidates: Array<{ agent: Agent; score: number; reasons: string[]; quote: StageQuote }>;
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
  attemptNo?: number | null;
  agentId?: string | null;
  name: string;
  uri: string;
  contentHash: string;
  mimeType: string;
  status: 'submitted' | 'accepted' | 'rejected';
  createdAt?: string;
  ipfsEvidence?: DeliverableIpfsEvidence | null;
}

export type IpfsVerificationStatus = 'declared' | 'verified' | 'unavailable' | 'hash_mismatch' | 'invalid_manifest';

export interface DeliverableManifest {
  schema: 'agentmesh.deliverable-manifest.v1';
  missionId: string;
  stageId: string | null;
  attemptNo: number | null;
  agentId: string | null;
  logicalName: string;
  versionNo: number;
  supersedesRootCid: string | null;
  acceptanceCriteriaSha256: string;
  encryptionKeyFingerprint?: string | null;
  createdAt: string;
  generator: string;
  files: Array<{ path: string; sha256: string; mimeType: string; byteSize: number }>;
}

export interface DeliverableIpfsEvidence {
  provider: 'pinme_ipfs';
  rootCid: string;
  manifestPath: '/manifest.json';
  manifestSha256: string;
  manifest: DeliverableManifest;
  fileCount: number;
  totalBytes: number;
  visibility: 'public' | 'encrypted';
  versionNo: number;
  supersedesDeliverableId: string | null;
  scopeKey: string;
  verificationStatus: IpfsVerificationStatus;
  lastVerifiedAt: string | null;
  lastVerificationError: string | null;
}

export interface MissionEvidenceSnapshot {
  missionId: string;
  deliverables: Array<{
    deliverableId: string; stageId: string | null; attemptNo: number | null; agentId: string | null; name: string;
    rootCid: string | null; manifestSha256: string | null; versionNo: number | null;
    verificationStatus: IpfsVerificationStatus | 'legacy'; createdAt: string;
  }>;
  acceptanceCriteriaSha256: string;
  workflowVersion: number;
  schedulerRevision: number;
  eventWatermark: string | null;
  frozenBy: string;
  frozenAt: string;
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
  requesterWalletAddress?: string | null;
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
  evidenceSnapshot?: MissionEvidenceSnapshot | null;
}

export type DisputeVoteChoice = 'support_refund' | 'oppose_refund' | 'abstain';
export type ArbitrationProposalStatus = 'active' | 'succeeded' | 'defeated' | 'inconclusive' | 'quorum_failed' | 'executed';

export interface ArbitrationMember {
  userId: string;
  displayName: string;
  email?: string;
  role: UserProfile['role'];
  status: 'active' | 'inactive';
  power: number;
  appointedBy: string;
  appointedAt: string;
  updatedAt: string;
}

export interface ArbitrationProposal {
  id: string;
  disputeId: string;
  proposerId: string;
  status: ArbitrationProposalStatus;
  weightMode: 'one_person_one_vote' | 'power';
  weightVersion: 'one_person_one_vote.v1' | 'member_power.v1';
  round: 0 | 1;
  parentProposalId: string | null;
  appealReason: string | null;
  appealDeadlineAt: string | null;
  votingStartsAt: string;
  votingEndsAt: string;
  quorumRequired: number;
  eligibleWeight: number;
  supportVotes: number;
  opposeVotes: number;
  abstainVotes: number;
  outcome: 'refund_requester' | 'reject_dispute' | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  executedAt: string | null;
  executedBy: string | null;
  createdAt: string;
}

export interface DisputeGovernanceRound {
  proposal: ArbitrationProposal;
  electorate: ArbitrationElector[];
  votes: DisputeVote[];
}

export interface GovernanceExecutionItem {
  id: string;
  scope: 'task_dispute' | 'ecosystem';
  sourceId: string;
  proposalId: string;
  action: 'refund_requester' | 'reject_dispute';
  payloadHash: string;
  status: 'queued' | 'awaiting_transaction' | 'executed' | 'cancelled';
  requestedBy: string;
  requestedAt: string;
  txHash: string | null;
  executedBy: string | null;
  executedAt: string | null;
}

export interface ArbitrationElector {
  userId: string;
  displayName: string;
  powerSnapshot: number;
  voteWeight: number;
}

export interface DisputeVote {
  id: string;
  proposalId: string;
  voterId: string;
  voterDisplayName: string;
  choice: DisputeVoteChoice;
  reason: string;
  voteWeight: number;
  createdAt: string;
}

export interface DisputeGovernance {
  proposal: ArbitrationProposal | null;
  electorate: ArbitrationElector[];
  votes: DisputeVote[];
  rounds: DisputeGovernanceRound[];
  appeal: {
    used: boolean;
    deadlineAt: string | null;
    canAppeal: boolean;
    reason: string | null;
    appellantId: string | null;
    createdAt: string | null;
  };
  execution: GovernanceExecutionItem | null;
  executionReady: boolean;
  currentUser: {
    eligible: boolean;
    canVote: boolean;
    hasVoted: boolean;
    choice: DisputeVoteChoice | null;
  };
}

export interface DisputeAction {
  id: string;
  disputeId: string;
  actorId: string;
  action: 'review_started' | 'appeal_created' | 'execution_queued' | 'execution_executed' | 'resolved' | 'rejected';
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

export interface PinmeIntegrationStatus {
  configured: boolean;
  addressHint: string | null;
  updatedAt: string | null;
}

export interface MissionDetail {
  mission: Mission;
  stages: WorkflowStage[];
  edges: WorkflowEdge[];
  offers: StageOffer[];
  events: ExecutionEvent[];
  deliverables: Deliverable[];
  escrow: Escrow | null;
  disputes: Dispute[];
  changeRequests: MissionChangeRequest[];
  checkpoints: WorkflowCheckpoint[];
  transitions: WorkflowTransitionCheckpoint[];
}

export interface NewDeliverableInput {
  stageId?: string;
  name: string;
  uri?: string;
  contentHash?: string;
  mimeType?: string;
  ipfsEvidence?: {
    rootCid: string;
    manifestSha256: string;
    manifest: DeliverableManifest;
    visibility: 'public' | 'encrypted';
    supersedesDeliverableId: string | null;
  };
}

export interface IpfsEvidenceContext {
  acceptanceCriteria: Record<string, unknown>;
  acceptanceCriteriaSha256: string;
  scopeKey: string;
  nextVersionNo: number;
  supersedesDeliverableId: string | null;
  supersedesRootCid: string | null;
  manifestTemplate: DeliverableManifest;
}

export interface ReviewDossierResponse {
  dossier: {
    schema: 'agentmesh.review-dossier.v1'; kind: 'acceptance' | 'dispute'; subjectId: string;
    missionId: string; snapshot: MissionEvidenceSnapshot;
  };
  canonicalJson: string;
  payloadSha256: string;
  publications: Array<{
    id: string; missionId: string; kind: 'acceptance_dossier' | 'dispute_dossier'; subjectId: string;
    payloadSha256: string; rootCid: string; publishedBy: string; createdAt: string;
  }>;
  publishGuide: { command: string; note: string };
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

export type LedgerExportStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface LedgerExportJob {
  id: string;
  token: string;
  status: LedgerExportStatus;
  totalRows: number;
  processedRows: number;
  progress: number;
  attempt: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  artifact: {
    id: string;
    sha256: string;
    contentType: 'text/csv';
    rowCount: number;
    byteSize: number;
    createdAt: string;
    expiresAt: string;
  } | null;
}

export type LedgerExportRequestResult =
  | { mode: 'direct'; rowCount: number }
  | { mode: 'async'; job: LedgerExportJob };

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

export type RewardEpochStatus = 'draft' | 'computed' | 'published' | 'expired';
export type RewardActivityRole = 'requester' | 'agent_owner' | 'arbitrator';

export interface YdChainConfig {
  configured: boolean;
  chainId: number;
  tokenAddress: string | null;
  distributorAddress: string | null;
  stakingAddress: string | null;
  decimals: number;
  confirmations: number;
  testnet: boolean;
  rewardLabel: string;
  yieldLabel: string;
}

export interface RewardEpoch {
  id: string;
  epochNumber: number;
  status: RewardEpochStatus;
  startsAt: string;
  endsAt: string;
  claimEndsAt: string;
  totalRewardUnits: string;
  accountScoreCap: number;
  formulaVersion: string;
  rules: Record<string, unknown>;
  chainId: number;
  distributorAddress: string;
  merkleRoot: string | null;
  manifestHash: string | null;
  publishTxHash: string | null;
  computedAt: string | null;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RewardActivity {
  id: string;
  sourceKey: string;
  userId: string;
  missionId: string | null;
  disputeId: string | null;
  role: RewardActivityRole;
  formulaVersion: string;
  asset: string;
  settledAmount: number;
  qualityBps: number;
  penaltyBps: number;
  scoreMicros: number;
  eligible: boolean;
  detail: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface RewardAllocation {
  id: string;
  epochId: string;
  userId: string;
  walletAddress: string;
  effectiveScore: number;
  amountUnits: string;
  leafHash: string;
  proof: string[];
  status: 'unclaimed' | 'claimed' | 'expired';
  claimTxHash: string | null;
  claimedAt: string | null;
  createdAt: string;
}

export interface YdStakingPosition {
  userId: string;
  walletAddress: string;
  amountUnits: string;
  unlockTime: string | null;
  durationSeconds: number;
  reputationBps: number;
  rawPower: string;
  delegatedTo: string | null;
  votingPower: string;
  verified: boolean;
  lastTxHash: string | null;
  lastBlockNumber: string | null;
  lastLogIndex: number | null;
  updatedAt: string;
}

export type EcosystemProposalType = 'reward_release' | 'reward_weights' | 'ecosystem_grant' | 'development' | 'platform_parameter';
export type EcosystemVoteChoice = 'for' | 'against' | 'abstain';

export interface EcosystemProposal {
  id: string;
  proposalNumber: number;
  proposerId: string;
  proposalType: EcosystemProposalType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: 'active' | 'succeeded' | 'defeated' | 'quorum_failed' | 'cancelled';
  snapshotBlock: string;
  startsAt: string;
  endsAt: string;
  quorumBps: number;
  approvalBps: number;
  eligiblePower: string;
  forPower: string;
  againstPower: string;
  abstainPower: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  createdAt: string;
}

export interface EcosystemGovernanceDetail {
  proposal: EcosystemProposal;
  electorate: Array<{ proposalId: string; userId: string; walletAddress: string; power: string; delegateSources: string[]; createdAt: string }>;
  votes: Array<{ id: string; proposalId: string; voterId: string; walletAddress: string; choice: EcosystemVoteChoice; power: string; reason: string; createdAt: string }>;
  currentUser: { eligible: boolean; canVote: boolean; hasVoted: boolean; power: string; choice: EcosystemVoteChoice | null };
}

export interface YdFinanceOverview {
  config: YdChainConfig;
  epochs: RewardEpoch[];
  allocations: RewardAllocation[];
  activities: RewardActivity[];
  staking: YdStakingPosition | null;
  governance: EcosystemGovernanceDetail[];
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
