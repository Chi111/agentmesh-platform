import type { OutcomePackage } from '../../shared/outcomePackage';
import type { CollaborationStore } from './collaborationStore';
import type { MatchingStore } from './matchingStore';
import type { WorkflowCondition, WorkflowFieldMapping } from './workflowDsl';

export type UserRole = 'requester' | 'developer' | 'admin';
export type AgentStatus = 'trial' | 'active' | 'paused';
export type AgentMarketplaceStatus = 'registered' | 'verifying' | 'trial' | 'listed' | 'degraded' | 'suspended' | 'retired';
export type AgentQualityConfidence = 'low' | 'medium' | 'high';
export type AgentQualityGateMode = 'shadow' | 'enforce';
export type AgentMetricSeverity = 'info' | 'warning' | 'severe';
export type AgentMetricEventType =
  | 'trial_passed'
  | 'trial_failed'
  | 'endpoint_healthy'
  | 'endpoint_unreachable'
  | 'artifact_verified'
  | 'artifact_invalid'
  | 'mission_settled_success'
  | 'mission_failed'
  | 'mission_timeout'
  | 'mission_refunded'
  | 'dispute_won'
  | 'dispute_lost'
  | 'feedback_received'
  | 'security_incident'
  | 'security_resolved'
  | 'admin_adjustment';
export type MissionStatus = 'draft' | 'matching' | 'running' | 'paused' | 'review' | 'completed' | 'cancelled';
export type MissionPauseMode = 'requester' | 'emergency';
export type StageStatus = 'queued' | 'running' | 'done' | 'failed';
export type WorkflowNodeType = 'task' | 'approval';
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
  /** The verified identity payload contains the complete current external-wallet state. */
  walletAddressAuthoritative?: boolean;
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
  /** Monotonically increases whenever the owner changes the base price. */
  priceVersion?: number;
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
  quality?: AgentQualityProfile;
}

export interface AgentVersion {
  id: string;
  agentId: string;
  version: string;
  endpoint: string;
  authType: Agent['authType'];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  capabilities: string[];
  createdAt: string;
}

export interface StageQuote {
  /** Customer-funded gross amount for this stage, before the protocol fee. */
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

export interface AgentTrial {
  id: string;
  agentId: string;
  agentVersionId: string | null;
  suiteVersion: string;
  status: 'running' | 'passed' | 'failed';
  score: number;
  responseTimeMs: number;
  checks: Array<{ key: string; passed: boolean; score: number; summary: string }>;
  summary: string;
  evidence: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  createdBy: string;
}

export interface AgentHealthCheck {
  id: string;
  agentId: string;
  status: 'healthy' | 'unreachable' | 'invalid';
  responseTimeMs: number | null;
  httpStatus: number | null;
  errorCode: string | null;
  checkedAt: string;
}

export interface AgentMetricEvent {
  id: string;
  idempotencyKey: string;
  agentId: string;
  type: AgentMetricEventType;
  value: number;
  weight: number;
  severity: AgentMetricSeverity;
  sourceType: 'registration' | 'trial' | 'health' | 'stage' | 'settlement' | 'dispute' | 'feedback' | 'admin';
  sourceId: string;
  detail: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface AgentQualityBreakdown {
  reliability: number;
  quality: number;
  delivery: number;
  response: number;
  history: number;
  riskPenalty: number;
}

export interface AgentQualityStats {
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
}

export interface AgentQualityProfile extends AgentQualityStats {
  gateMode: AgentQualityGateMode;
  eligible: boolean;
  wouldBeEligible: boolean;
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

export interface AgentFeedback {
  id: string;
  agentId: string;
  missionId: string;
  stageId: string;
  requesterId: string;
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

export interface AgentQualityDetail {
  stats: AgentQualityStats;
  trials: AgentTrial[];
  healthChecks: AgentHealthCheck[];
  feedback: AgentFeedback[];
  snapshots: AgentReputationSnapshot[];
}

export interface AgentMetricRecordResult {
  applied: boolean;
  stats: AgentQualityStats | null;
}

export interface Mission {
  deliveryPolicy?: 'legacy' | 'outcome_v1';
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
  workflowVersion: number;
  workflowViewport: WorkflowViewport;
  pausedAt: string | null;
  pausedBy: string | null;
  pauseReason: string | null;
  pauseMode: MissionPauseMode | null;
  schedulerRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface StageOffer {
  id: string;
  missionId: string;
  stageId: string;
  agentId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  /** Immutable for the lifetime of this offer and used as its settlement weight. */
  quote: StageQuote;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStage {
  id: string;
  missionId: string;
  position: number;
  nodeType: WorkflowNodeType;
  positionX: number;
  positionY: number;
  progress: number;
  name: string;
  purpose: string;
  category: string;
  budget: number;
  status: StageStatus;
  agentId: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  attemptNo: number;
  attemptCreatedAt: string;
  createdAt: string;
  updatedAt: string;
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
    status: StageStatus;
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
  createdAt: string;
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

export type WorkflowTemplateSaveResult =
  | { state: 'saved' | 'unchanged'; detail: WorkflowTemplateDetail }
  | { state: 'conflict'; detail: WorkflowTemplateDetail | null };

export interface WorkflowViewport {
  x: number;
  y: number;
  zoom: number;
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
  attemptNo?: number | null;
  agentId: string | null;
  name: string;
  uri: string;
  contentHash: string;
  mimeType: string;
  status: 'submitted' | 'accepted' | 'rejected';
  createdAt: string;
  ipfsEvidence?: DeliverableIpfsEvidence | null;
}

export type IpfsEvidenceVisibility = 'public' | 'encrypted';
export type IpfsVerificationStatus = 'declared' | 'verified' | 'unavailable' | 'hash_mismatch' | 'invalid_manifest';

export interface DeliverableManifestFile {
  path: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
}

export interface DeliverableManifest {
  schema: 'agentmesh.deliverable-manifest.v1';
  outcomePackage?: OutcomePackage;
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
  files: DeliverableManifestFile[];
}

export interface DeliverableIpfsEvidence {
  provider: 'pinme_ipfs';
  rootCid: string;
  manifestPath: '/manifest.json';
  manifestSha256: string;
  manifest: DeliverableManifest;
  fileCount: number;
  totalBytes: number;
  visibility: IpfsEvidenceVisibility;
  versionNo: number;
  supersedesDeliverableId: string | null;
  scopeKey: string;
  verificationStatus: IpfsVerificationStatus;
  lastVerifiedAt: string | null;
  lastVerificationError: string | null;
}

export interface FrozenDeliverableEvidence {
  deliverableId: string;
  stageId: string | null;
  attemptNo: number | null;
  agentId: string | null;
  name: string;
  rootCid: string | null;
  manifestSha256: string | null;
  versionNo: number | null;
  verificationStatus: IpfsVerificationStatus | 'legacy';
  createdAt: string;
}

export interface MissionEvidenceSnapshot {
  missionId: string;
  deliverables: FrozenDeliverableEvidence[];
  acceptanceCriteriaSha256: string;
  workflowVersion: number;
  schedulerRevision: number;
  eventWatermark: string | null;
  frozenBy: string;
  frozenAt: string;
}

export interface EvidencePublication {
  id: string;
  missionId: string;
  kind: 'acceptance_dossier' | 'dispute_dossier';
  subjectId: string;
  payloadSha256: string;
  rootCid: string;
  publishedBy: string;
  createdAt: string;
}

export interface ReviewDossier {
  schema: 'agentmesh.review-dossier.v1';
  kind: 'acceptance' | 'dispute';
  subjectId: string;
  missionId: string;
  snapshot: MissionEvidenceSnapshot;
}

export interface AgentCidPortfolioItem {
  missionId: string;
  missionTitle: string;
  deliverableId: string;
  name: string;
  rootCid: string;
  manifestSha256: string;
  versionNo: number;
  visibility: IpfsEvidenceVisibility;
  verificationStatus: IpfsVerificationStatus;
  completedAt: string;
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
  requesterWalletAddress: string | null;
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
  collaborationIssueId?: string;
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
  evidenceSnapshot?: MissionEvidenceSnapshot | null;
}

export type ArbitrationMemberStatus = 'active' | 'inactive';
export type DisputeVoteChoice = 'support_refund' | 'oppose_refund' | 'abstain';
export type ArbitrationProposalStatus = 'active' | 'succeeded' | 'defeated' | 'inconclusive' | 'quorum_failed' | 'executed';

export interface ArbitrationMember {
  userId: string;
  displayName: string;
  email?: string;
  role: UserRole;
  status: ArbitrationMemberStatus;
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

export type GovernanceExecutionStatus = 'queued' | 'awaiting_transaction' | 'executed' | 'cancelled';

export interface GovernanceExecutionItem {
  id: string;
  scope: 'task_dispute' | 'ecosystem';
  sourceId: string;
  proposalId: string;
  action: 'refund_requester' | 'reject_dispute';
  payloadHash: string;
  status: GovernanceExecutionStatus;
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

export type DisputeAppealResult =
  | { state: 'created'; governance: DisputeGovernance }
  | { state: 'missing' | 'not_allowed' | 'not_finalized' | 'expired' | 'already_appealed' | 'no_expanded_electorate' | 'execution_queued' };

export type DisputeExecutionQueueResult =
  | { state: 'queued' | 'replayed'; governance: DisputeGovernance }
  | { state: 'missing' | 'not_ready' | 'escrow_not_frozen' | 'already_executed' };

export type DisputeVoteMutationResult =
  | { state: 'applied'; governance: DisputeGovernance }
  | { state: 'missing' | 'not_eligible' | 'already_voted' | 'closed' | 'expired' };

export type DisputeFinalizeResult =
  | { state: 'finalized' | 'not_ready'; governance: DisputeGovernance }
  | { state: 'missing' };

export type RewardEpochStatus = 'draft' | 'computed' | 'published' | 'expired';
export type RewardActivityRole = 'requester' | 'agent_owner' | 'arbitrator';
export type RewardAllocationStatus = 'unclaimed' | 'claimed' | 'expired';

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
  status: RewardAllocationStatus;
  claimTxHash: string | null;
  claimedAt: string | null;
  createdAt: string;
}

export interface RewardClaim {
  id: string;
  epochId: string;
  userId: string;
  walletAddress: string;
  amountUnits: string;
  txHash: string;
  blockNumber: string;
  logIndex: number;
  claimedAt: string;
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
export type EcosystemProposalStatus = 'active' | 'succeeded' | 'defeated' | 'quorum_failed' | 'cancelled';
export type EcosystemVoteChoice = 'for' | 'against' | 'abstain';

export interface EcosystemProposal {
  id: string;
  proposalNumber: number;
  proposerId: string;
  proposalType: EcosystemProposalType;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: EcosystemProposalStatus;
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

export interface GovernancePowerSnapshot {
  proposalId: string;
  userId: string;
  walletAddress: string;
  power: string;
  delegateSources: string[];
  createdAt: string;
}

export interface EcosystemVote {
  id: string;
  proposalId: string;
  voterId: string;
  walletAddress: string;
  choice: EcosystemVoteChoice;
  power: string;
  reason: string;
  createdAt: string;
}

export interface EcosystemGovernanceDetail {
  proposal: EcosystemProposal;
  electorate: GovernancePowerSnapshot[];
  votes: EcosystemVote[];
  currentUser: {
    eligible: boolean;
    canVote: boolean;
    hasVoted: boolean;
    power: string;
    choice: EcosystemVoteChoice | null;
  };
}

export interface YdFinanceOverview {
  epochs: RewardEpoch[];
  allocations: RewardAllocation[];
  activities: RewardActivity[];
  staking: YdStakingPosition | null;
  governance: EcosystemGovernanceDetail[];
}

export type RewardEpochComputeResult =
  | { state: 'computed'; epoch: RewardEpoch; allocations: RewardAllocation[] }
  | { state: 'missing' | 'not_draft' | 'no_eligible_accounts' };

export type EcosystemVoteResult =
  | { state: 'applied'; governance: EcosystemGovernanceDetail }
  | { state: 'missing' | 'not_eligible' | 'already_voted' | 'closed' | 'expired' };

export type EcosystemFinalizeResult =
  | { state: 'finalized' | 'not_ready'; governance: EcosystemGovernanceDetail }
  | { state: 'missing' };

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

/** Encrypted-at-rest PinMe credential. Plaintext AppKeys never cross the store boundary. */
export interface UserPinmeCredentialRecord {
  userId: string;
  addressHint: string;
  ciphertext: string;
  iv: string;
  updatedAt: string;
}

export interface DisputeAction {
  id: string;
  disputeId: string;
  actorId: string;
  action: 'review_started' | 'appeal_created' | 'execution_queued' | 'execution_executed' | 'resolved' | 'rejected';
  note: string | null;
  createdAt: string;
}

export interface AdminUser extends UserContext {
  createdAt: string;
  updatedAt: string;
  arbitration: Pick<ArbitrationMember, 'status' | 'power'> | null;
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

export type LedgerExportStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired';

export interface LedgerExportArtifact {
  id: string;
  sha256: string;
  contentType: 'text/csv';
  rowCount: number;
  byteSize: number;
  createdAt: string;
  expiresAt: string;
}

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
  artifact: LedgerExportArtifact | null;
}

export type LedgerExportRequestResult =
  | { mode: 'direct'; rowCount: number }
  | { mode: 'async'; job: LedgerExportJob };

export type LedgerExportMutationResult =
  | { state: 'applied' | 'unchanged'; job: LedgerExportJob }
  | { state: 'missing' | 'invalid_state' };

export interface LedgerExportClaim {
  job: LedgerExportJob;
  ownerId: string;
  exportType: 'developer_ledger';
  snapshot: LedgerCursor;
}

export interface LedgerExportPrivateArtifact extends LedgerExportArtifact {
  objectKey: string;
}

export interface CandidateMatch {
  stageId: string;
  stageName: string;
  candidates: Array<{
    agent: Agent;
    score: number;
    reasons: string[];
    quote: StageQuote;
  }>;
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

export type MissionControlResult =
  | { state: 'applied'; mission: Mission; schedulerRevision: number }
  | { state: 'unchanged'; mission: Mission }
  | { state: 'invalid'; mission: Mission | null };

export type MissionChangeRequestResult =
  | { state: 'applied'; mission: Mission; changeRequest: MissionChangeRequest; schedulerRevision: number }
  | { state: 'blocked_running_stage'; mission: Mission }
  | { state: 'invalid'; mission: Mission | null };

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
  artifacts?: Deliverable[];
  progress?: number;
  currentStage: string;
  event: ExecutionEvent;
}

export interface DispatchOutboxItem {
  id: string;
  missionId: string;
  stageId: string;
  runId: string;
  expiresAt: string;
  status: 'pending' | 'processing' | 'done';
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowDraftSaveResult =
  | { state: 'saved'; mission: Mission }
  | { state: 'version_conflict' }
  | { state: 'locked' }
  | { state: 'missing' };

export type AgentCallbackApplyResult =
  | { state: 'applied'; stage: WorkflowStage }
  | { state: 'duplicate' }
  | { state: 'expired' }
  | { state: 'missing' }
  | { state: 'invalid' };

export interface PlatformStore {
  readonly collaboration: CollaborationStore;
  readonly matching: MatchingStore;
  ensureIdentityProfile(identity: AuthIdentityInput): Promise<UserContext>;
  getProfile(id: string): Promise<UserContext | null>;
  updateRole(id: string, role: Exclude<UserRole, 'admin'>): Promise<UserContext>;
  consumeRateLimit(bucket: string, limit: number, windowSeconds: number, nowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;

  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  getAgentLoadMultipliers(agentIds: string[]): Promise<Map<string, number>>;
  createAgent(agent: Agent): Promise<Agent>;
  updateAgentPrice(id: string, ownerId: string, price: number, updatedAt: string, changedBy?: string): Promise<Agent | null>;
  updateAgentTrial(id: string, score: number, status: AgentStatus, responseTimeMs?: number | null): Promise<Agent | null>;
  updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null>;
  getAgentQualityStats(agentId: string): Promise<AgentQualityStats | null>;
  listAgentQualityStats(): Promise<AgentQualityStats[]>;
  recordAgentTrial(trial: AgentTrial): Promise<AgentTrial>;
  listAgentTrials(agentId: string, limit?: number): Promise<AgentTrial[]>;
  recordAgentHealthCheck(check: AgentHealthCheck): Promise<AgentHealthCheck>;
  listAgentHealthChecks(agentId: string, limit?: number): Promise<AgentHealthCheck[]>;
  recordAgentMetricEvent(event: AgentMetricEvent, evaluatedAt: string): Promise<AgentMetricRecordResult>;
  recomputeAgentQuality(agentId: string, evaluatedAt: string): Promise<AgentQualityStats | null>;
  listAgentMetricEvents(agentId: string): Promise<AgentMetricEvent[]>;
  listAgentReputationSnapshots(agentId: string, limit?: number): Promise<AgentReputationSnapshot[]>;
  saveAgentFeedback(feedback: AgentFeedback, evaluatedAt: string): Promise<{ feedback: AgentFeedback; stats: AgentQualityStats | null }>;
  getAgentFeedback(missionId: string, stageId: string, agentId: string): Promise<AgentFeedback | null>;
  listAgentFeedback(agentId: string, limit?: number): Promise<AgentFeedback[]>;

  listMissions(user: UserContext): Promise<Mission[]>;
  listMissionsAwaitingOutcome(limit: number): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  createMission(mission: Mission, stages: WorkflowStage[], edges?: WorkflowEdge[]): Promise<Mission>;
  rescheduleMission(id: string, requesterId: string, deadline: string, expectedVersion: number, now: string): Promise<WorkflowDraftSaveResult>;
  saveCompilation(id: string, spec: Record<string, unknown>, stages: WorkflowStage[], edges: WorkflowEdge[], expectedVersion: number): Promise<WorkflowDraftSaveResult>;
  saveWorkflowDraft(id: string, stages: WorkflowStage[], edges: WorkflowEdge[], viewport: WorkflowViewport, expectedVersion: number): Promise<WorkflowDraftSaveResult>;
  confirmWorkflow(id: string, stages: WorkflowStage[], team: string[], offers: StageOffer[], expectedVersion?: number): Promise<Mission | null>;
  startMission(
    id: string,
    requesterId: string,
    depositTxHash: string | null,
    payoutHash?: string | null,
    startedAt?: string,
    requesterWalletAddress?: string | null,
  ): Promise<MissionStartResult | null>;
  submitMissionForReview(id: string, reviewDueAt: string): Promise<Mission | null>;
  pauseMission(id: string, actorId: string, mode: MissionPauseMode, reason: string, pausedAt: string): Promise<MissionControlResult>;
  resumeMission(
    id: string,
    actorId: string,
    expectedMode: MissionPauseMode,
    expectedSchedulerRevision: number,
    resumedAt: string,
  ): Promise<MissionControlResult>;
  applyMissionChangeRequest(input: {
    id: string;
    missionId: string;
    targetStageIds: string[];
    resetStageIds: string[];
    reason: string;
    acceptanceCriteria: string;
    requestedBy: string;
    createdAt: string;
    expectedRunningStageIds?: string[];
  }): Promise<MissionChangeRequestResult>;
  listMissionChangeRequests(missionId: string): Promise<MissionChangeRequest[]>;
  listWorkflowCheckpoints(missionId: string, limit?: number): Promise<WorkflowCheckpoint[]>;
  listDirtyMissionControls(limit?: number): Promise<Array<{ missionId: string; schedulerRevision: number }>>;
  markMissionCheckpointClean(missionId: string, schedulerRevision: number, actorId: string | null, reconciledAt: string): Promise<boolean>;
  acceptMission(id: string, actorId: string, releaseTxHash: string | null, evidenceSnapshot?: MissionEvidenceSnapshot): Promise<AcceptanceResult | null>;
  listStages(missionId: string): Promise<WorkflowStage[]>;
  listEdges(missionId: string): Promise<WorkflowEdge[]>;
  recordWorkflowTransition(checkpoint: WorkflowTransitionCheckpoint): Promise<{ applied: boolean; checkpoint: WorkflowTransitionCheckpoint }>;
  listWorkflowTransitions(missionId: string, limit?: number): Promise<WorkflowTransitionCheckpoint[]>;
  listCurrentWorkflowTransitions(missionId: string): Promise<WorkflowTransitionCheckpoint[]>;
  saveWorkflowTemplateVersion(input: {
    id: string;
    ownerId: string;
    name: string;
    description: string;
    nodes: WorkflowStage[];
    edges: WorkflowEdge[];
    entryIds: string[];
    exitIds: string[];
    contentHash: string;
    createdAt: string;
  }): Promise<WorkflowTemplateSaveResult>;
  listWorkflowTemplates(ownerId: string): Promise<WorkflowTemplateDetail[]>;
  getWorkflowTemplate(ownerId: string, templateId: string, version?: number): Promise<WorkflowTemplateDetail | null>;
  listStageOffers(missionId: string, now?: string): Promise<StageOffer[]>;
  getStageOffer(id: string, now?: string): Promise<StageOffer | null>;
  respondStageOffer(id: string, ownerId: string, decision: 'accepted' | 'declined', respondedAt: string): Promise<StageOffer | null>;
  claimStageForDispatch(missionId: string, stageId: string): Promise<WorkflowStage | null>;
  resetStageDispatch(missionId: string, stageId: string): Promise<void>;
  updateStage(missionId: string, stageId: string, status: StageStatus, output?: Record<string, unknown> | null): Promise<WorkflowStage | null>;
  transitionStage(
    missionId: string,
    stageId: string,
    expectedStatus: StageStatus,
    status: StageStatus,
    output?: Record<string, unknown> | null,
  ): Promise<WorkflowStage | null>;
  transitionRunningStage(missionId: string, stageId: string, status: Exclude<StageStatus, 'queued'>, output?: Record<string, unknown> | null): Promise<WorkflowStage | null>;
  setStageProgress(missionId: string, stageId: string, progress: number): Promise<WorkflowStage | null>;
  resetWorkflowNodes(missionId: string, stageIds: string[], gateId?: string): Promise<void>;
  updateMissionWorkflowState(missionId: string, progress: number, currentStage: string): Promise<Mission | null>;

  enqueueDispatches(missionId: string, stageIds: string[], now: string): Promise<DispatchOutboxItem[]>;
  recoverExpiredStageDispatches(missionId: string, now: string): Promise<string[]>;
  listPendingDispatches(limit: number, now: string): Promise<DispatchOutboxItem[]>;
  claimDispatch(id: string, now: string): Promise<boolean>;
  completeDispatch(id: string, status: 'done' | 'pending', now: string, nextAttemptAt?: string): Promise<void>;

  addEvent(event: ExecutionEvent, progress?: number, currentStage?: string, stageGuard?: StageStatus): Promise<ExecutionEvent>;
  listEvents(missionId: string): Promise<ExecutionEvent[]>;
  addDeliverable(deliverable: Deliverable): Promise<Deliverable>;
  listDeliverables(missionId: string): Promise<Deliverable[]>;
  updateDeliverableIpfsVerification(
    missionId: string,
    deliverableId: string,
    status: IpfsVerificationStatus,
    verifiedAt: string,
    error: string | null,
  ): Promise<Deliverable | null>;
  getAcceptanceEvidenceSnapshot(missionId: string): Promise<MissionEvidenceSnapshot | null>;
  recordEvidencePublication(publication: EvidencePublication): Promise<EvidencePublication>;
  listEvidencePublications(missionId: string): Promise<EvidencePublication[]>;
  listAgentCidPortfolio(agentId: string, limit?: number): Promise<AgentCidPortfolioItem[]>;

  getEscrow(missionId: string): Promise<Escrow | null>;
  getWalletAccount(userId: string, limit?: number): Promise<WalletAccount>;
  claimTestCredit(userId: string, now: string): Promise<{ account: WalletAccount; credited: boolean }>;
  listDisputes(user: UserContext): Promise<Dispute[]>;
  getDisputes(missionId: string): Promise<Dispute[]>;
  createDispute(dispute: Dispute): Promise<Dispute>;
  startDisputeReview(id: string, actorId: string, startedAt?: string, weightMode?: ArbitrationProposal['weightMode']): Promise<Dispute | null>;
  getDisputeGovernance(id: string, userId: string, now?: string): Promise<DisputeGovernance | null>;
  castDisputeVote(id: string, voterId: string, choice: DisputeVoteChoice, reason: string, votedAt: string): Promise<DisputeVoteMutationResult>;
  finalizeDisputeProposal(id: string, actorId: string, finalizedAt: string): Promise<DisputeFinalizeResult>;
  createDisputeAppeal(id: string, appellantId: string, reason: string, createdAt: string): Promise<DisputeAppealResult>;
  queueDisputeExecution(id: string, actorId: string, queuedAt: string, web3: boolean): Promise<DisputeExecutionQueueResult>;
  resolveDispute(id: string, resolution: string, status: 'resolved' | 'rejected', actorId: string, resolutionTxHash: string | null): Promise<DisputeResolutionResult | null>;
  listDisputeActions(disputeId: string): Promise<DisputeAction[]>;

  createAgentDispatch(dispatch: AgentDispatch): Promise<void>;
  applyAgentCallback(update: AgentCallbackUpdate): Promise<AgentCallbackApplyResult>;
  claimAgentCallback(input: {
    runId: string;
    callbackId: string;
    missionId: string;
    stageId: string;
    agentId: string;
    expiresAt: string;
    now: string;
    status: StageStatus;
  }): Promise<'accepted' | 'duplicate' | 'expired' | 'missing' | 'invalid'>;
  completeAgentDispatch(runId: string, now: string): Promise<void>;

  listNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: Notification): Promise<Notification>;
  markNotificationsRead(userId: string): Promise<void>;
  getUserPreferences(userId: string): Promise<UserPreferences>;
  updateUserPreferences(userId: string, preferences: UserPreferences): Promise<UserPreferences>;
  getUserPinmeCredential(userId: string): Promise<UserPinmeCredentialRecord | null>;
  saveUserPinmeCredential(credential: UserPinmeCredentialRecord): Promise<UserPinmeCredentialRecord>;
  deleteUserPinmeCredential(userId: string): Promise<boolean>;

  listAdminUsers(limit: number): Promise<AdminUser[]>;
  listArbitrationMembers(): Promise<ArbitrationMember[]>;
  setArbitrationMember(userId: string, active: boolean, actorId: string, updatedAt: string, power?: number): Promise<ArbitrationMember | null>;
  countProfilesByRole(role: UserRole): Promise<number>;
  updateAdminUserRole(targetId: string, role: UserRole, actorId: string, createdAt: string): Promise<{ profile: AdminUser; action: AdminAction | null } | null>;
  listAdminActions(limit: number): Promise<AdminAction[]>;
  getDeveloperSummary(ownerId: string): Promise<{ jobs: number; activeAgents: number; volume: number; pending: number }>;
  getDeveloperLedger(ownerId: string, limit: number, cursor: LedgerCursor | null, token: string): Promise<DeveloperLedger>;
  requestDeveloperLedgerExport(ownerId: string, token: string, requestedAt: string): Promise<LedgerExportRequestResult>;
  listDeveloperLedgerExports(ownerId: string, now: string): Promise<LedgerExportJob[]>;
  getDeveloperLedgerExport(ownerId: string, id: string, now: string): Promise<LedgerExportJob | null>;
  cancelDeveloperLedgerExport(ownerId: string, id: string, cancelledAt: string): Promise<LedgerExportMutationResult>;
  retryDeveloperLedgerExport(ownerId: string, id: string, retriedAt: string): Promise<LedgerExportMutationResult>;
  claimDeveloperLedgerExport(workerId: string, claimedAt: string): Promise<LedgerExportClaim | null>;
  updateDeveloperLedgerExportProgress(id: string, workerId: string, attempt: number, processedRows: number, updatedAt: string): Promise<LedgerExportJob | null>;
  completeDeveloperLedgerExport(input: {
    id: string;
    workerId: string;
    attempt: number;
    objectKey: string;
    sha256: string;
    rowCount: number;
    byteSize: number;
    completedAt: string;
  }): Promise<LedgerExportJob | null>;
  failDeveloperLedgerExport(id: string, workerId: string, attempt: number, errorCode: string, errorMessage: string, failedAt: string): Promise<LedgerExportJob | null>;
  getDeveloperLedgerExportArtifact(ownerId: string, id: string, now: string): Promise<LedgerExportPrivateArtifact | null>;

  recordRewardActivity(activity: RewardActivity): Promise<boolean>;
  createRewardEpoch(epoch: RewardEpoch): Promise<RewardEpoch>;
  listRewardEpochs(): Promise<RewardEpoch[]>;
  getRewardEpoch(id: string): Promise<RewardEpoch | null>;
  listRewardAllocations(epochId: string): Promise<RewardAllocation[]>;
  computeRewardEpoch(id: string, computedAt: string, actorId: string): Promise<RewardEpochComputeResult>;
  markRewardEpochPublished(id: string, txHash: string, publishedAt: string, actorId: string): Promise<RewardEpoch | null>;
  markRewardEpochExpired(id: string, txHash: string, expiredAt: string, actorId: string): Promise<RewardEpoch | null>;
  getYdFinanceOverview(userId: string, now?: string): Promise<YdFinanceOverview>;
  recordRewardClaim(claim: RewardClaim): Promise<{ claim: RewardClaim; applied: boolean } | null>;
  syncYdStakingPosition(position: YdStakingPosition): Promise<YdStakingPosition>;
  listGovernanceCandidates(): Promise<Array<{ userId: string; walletAddress: string }>>;
  createEcosystemProposal(proposal: EcosystemProposal, electorate: GovernancePowerSnapshot[]): Promise<EcosystemGovernanceDetail>;
  listEcosystemGovernance(userId: string, now?: string): Promise<EcosystemGovernanceDetail[]>;
  castEcosystemVote(id: string, voterId: string, choice: EcosystemVoteChoice, reason: string, votedAt: string): Promise<EcosystemVoteResult>;
  finalizeEcosystemProposal(id: string, actorId: string, finalizedAt: string): Promise<EcosystemFinalizeResult>;

  claimIdempotent(userId: string, key: string, method: string, path: string, requestHash: string): Promise<IdempotencyClaim>;
  completeIdempotent(userId: string, key: string, result: IdempotentResult): Promise<void>;
  abandonIdempotent(userId: string, key: string): Promise<void>;
}
