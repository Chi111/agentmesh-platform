export type IssueCategory = 'delivery' | 'scope_change' | 'missing_material' | 'acceptance_delay' | 'review_appeal' | 'platform_bug';
export interface CollaborationIssue {
  id: string; missionId: string; developerId: string; authorId: string; stageIds: string[];
  category: IssueCategory; title: string; body: string; status: 'open' | 'escalated' | 'resolved';
  dueAt: string; createdAt: string; updatedAt: string; resolution: string | null; disputeId: string | null;
}
export interface CollaborationMessage {
  id: string; missionId: string; targetId: string; kind: 'issue' | 'review' | 'dispute';
  authorId: string; body: string; evidence: Array<{ label: string; uri: string }>; createdAt: string;
}
export interface BilateralReview {
  id: string; missionId: string; developerId: string; authorId: string; direction: 'requester' | 'developer';
  ratings: number[]; comment: string; createdAt: string; revealAt: string; publishedAt: string | null;
  stageIds: string[]; eligible: boolean; caseStatus: string;
}
export interface CollaborationView {
  issues: CollaborationIssue[]; messages: CollaborationMessage[]; reviews: BilateralReview[];
  pairs: Array<{ developerId: string; name: string; stageIds: string[]; stageNames: string[]; submitted: boolean; counterpartSubmitted: boolean }>;
  reviewEndsAt: string | null; canReview: boolean; role: 'requester' | 'developer' | 'observer';
  requesterReputation: { count: number; score: number | null; confidence: 'low' | 'medium' | 'high' };
}
export interface ArbitrationRewardPool {
  id: string; startsAt: string; endsAt: string; budgetMicros: number; feeMicros: number;
  reservedMicros: number; createdBy: string; createdAt: string;
}
export interface ArbitrationWork {
  id: string; disputeId: string; proposalId: string; userId: string; poolId: string; feeMicros: number;
  status: 'accepted' | 'submitted' | 'approved' | 'rejected' | 'withdrawn'; report: string; evidence: string[];
  acceptedAt: string; submittedAt: string | null; reviewedAt: string | null; reviewedBy: string | null; reviewReason: string | null;
}
export interface ArbitrationRewardView {
  pools: ArbitrationRewardPool[]; work: ArbitrationWork[]; messages: CollaborationMessage[];
  linkedIssues: CollaborationIssue[];
  reputation: { accepted: number; submitted: number; approved: number; rejected: number };
  canRespond: boolean; canAccept: boolean; evidenceOptions: string[];
}
