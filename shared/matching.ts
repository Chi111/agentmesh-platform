export const MATCHING_POLICY = 'agentmesh.match.v2.1';
export type ExecutionMode = 'analyze' | 'implement' | 'review';
export type MatchPreference = 'balanced' | 'speed' | 'cost';
export interface TaskProfile {
  version: 1;
  family: string;
  mode: ExecutionMode;
  objective: string;
  acceptance: string[];
  capabilities: string[];
  tools: string[];
  inputType: string | null;
  outputType: string | null;
  independentReview: boolean;
  risk: 'normal' | 'high';
  unknowns: string[];
}
export interface ExecutionProfile {
  agentId: string;
  agentVersion: string;
  revision: number;
  maxConcurrency: number;
  // Owner-scoped pool: multiple endpoints may share one physical executor.
  pool: string;
  poolConcurrency: number;
  updatedAt: string;
}
export interface CapabilityEvidence {
  id: string;
  agentId: string;
  agentVersion: string;
  family: string;
  mode: ExecutionMode;
  taskDescription: string;
  capabilities: string[];
  tools: string[];
  inputTypes: string[];
  outputTypes: string[];
  durationSeconds: number;
  quality: number;
  sourceId: string;
  verifiedBy: string;
  verifiedAt: string;
  expiresAt: string;
}
export interface MatchingOutcome {
  id: string;
  agentId: string;
  agentVersion: string;
  family: string;
  mode: ExecutionMode;
  success: boolean;
  quality: number;
  durationSeconds: number | null;
  occurredAt: string;
}
export interface CapacityLease {
  claimToken?: string;
  contactedAt?: string | null;
  completedAt?: string | null;
  runId: string;
  missionId: string;
  stageId: string;
  agentId: string;
  agentVersion: string;
  pool: string;
  status: 'active' | 'quarantined' | 'released';
  createdAt: string;
  expiresAt: string;
}
export interface MatchingData {
  profiles: ExecutionProfile[];
  evidence: CapabilityEvidence[];
  outcomes: MatchingOutcome[];
  leases: CapacityLease[];
  commitments?: Array<{missionId:string; stageId:string; agentId:string}>;
}
export interface MatchOption {
  agentId: string;
  ownerId: string;
  utility: number;
  score: number;
  quote: number;
  durationSeconds: number;
  durationSource: 'observed' | 'reviewed-estimate';
  evidenceIds: string[];
  sampleCount: number;
  uncertainty: number;
  reasons: string[];
  pool: string;
  concurrency: number;
  poolConcurrency: number;
}
export interface MatchAssignment {
  stageId: string;
  agentId: string;
  startSeconds: number;
  endSeconds: number;
  quote: number;
  reasons: string[];
  alternatives: string[];
}
export interface MatchPlan {
  id: string;
  missionId: string;
  workflowVersion: number;
  policyVersion: string;
  snapshotHash: string;
  preference: MatchPreference;
  lockedAssignments: Record<string, string>;
  createdAt: string;
  expiresAt: string;
  status: 'ready' | 'needs_review';
  assignments: MatchAssignment[];
  profiles: Record<string, TaskProfile>;
  candidates: Record<string, MatchOption[]>;
  excluded: Record<string, Array<{ agentId: string; reasons: string[] }>>;
  totalQuote: number;
  makespanSeconds: number | null;
  warnings: string[];
}
