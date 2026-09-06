import type { ArbitrationRewardPool, ArbitrationWork, BilateralReview, CollaborationIssue, CollaborationMessage } from '../../shared/collaboration';
import type { D1Database } from './store';
export interface CollaborationNotice {
  id: string; userId: string; missionId: string; title: string; createdAt: string; availableAt: string;
  issueId?: string | null; status: string; claimToken?: string | null; leaseUntil?: string | null;
}
export interface CollaborationStore {
  pendingNotices(now: string): Promise<CollaborationNotice[]>;
  claimNotice(id: string, token: string, now: string, leaseUntil: string): Promise<boolean>;
  finishNotice(id: string, token: string, delivered: boolean): Promise<void>;

  listIssues(missionId?: string): Promise<CollaborationIssue[]>;
  insertIssue(issue: CollaborationIssue): Promise<void>;
  updateIssue(issue: CollaborationIssue, expectedStatus: CollaborationIssue['status']): Promise<boolean>;
  listMessages(missionId: string): Promise<CollaborationMessage[]>;
  insertMessage(message: CollaborationMessage): Promise<void>;
  listReviewResponses(reviewIds: string[]): Promise<CollaborationMessage[]>;
  listReviews(missionId?: string): Promise<BilateralReview[]>;
  listReadyReviews(now: string, missionId?: string): Promise<BilateralReview[]>;
  listPublishedAgentReviews(agentId: string): Promise<BilateralReview[]>;
  listPublishedRequesterReviews(requesterId: string): Promise<BilateralReview[]>;
  insertReview(review: BilateralReview): Promise<boolean>;
  publishReview(id: string, publishedAt: string): Promise<void>;
  listPools(): Promise<ArbitrationRewardPool[]>;
  insertPool(pool: ArbitrationRewardPool): Promise<boolean>;
  listWork(disputeId?: string): Promise<ArbitrationWork[]>;
  insertWork(work: ArbitrationWork): Promise<boolean>;
  updateWork(work: ArbitrationWork, expectedStatus: ArbitrationWork['status']): Promise<boolean>;
}

// The same persistence contract is exercised in API tests and SQLite migration tests.
export class MemoryCollaborationStore implements CollaborationStore {
  constructor(private readonly missionContext: (id: string) => {requesterId?: string; stages: Array<{id:string;agentId:string|null}>} = () => ({stages:[]}), private readonly hasVote: (proposalId:string,userId:string)=>boolean = () => false, private readonly disputeMission: (id:string)=>string|undefined = () => undefined) {}
  readonly notices = new Map<string, CollaborationNotice>();
  private notify(key: string, missionId: string, developerId: string, title: string, at: string, exclude?: string, availableAt=at, issueId?:string) {
    const users = new Set([this.missionContext(missionId).requesterId,developerId]);
    for (const userId of users) if (userId && userId!==exclude) {
      const id=`${key}:${userId}`;
      if (!this.notices.has(id)) this.notices.set(id,{id,userId,missionId,title,createdAt:at,availableAt,issueId,status:'pending'});
    }
  }
  async pendingNotices(now:string) { return structuredClone([...this.notices.values()].filter(n=>n.status!=='delivered' && n.availableAt<=now && (!n.leaseUntil || n.leaseUntil<=now) && (!n.issueId || this.issues.get(n.issueId)?.status==='open')).slice(0,100)); }
  async claimNotice(id:string,token:string,now:string,leaseUntil:string) {
    const n=this.notices.get(id); if (!n || n.status==='delivered' || n.availableAt>now || (n.leaseUntil && n.leaseUntil>now)) return false;
    n.status='processing';n.claimToken=token;n.leaseUntil=leaseUntil;return true;
  }
  async finishNotice(id:string,token:string,delivered:boolean) { const n=this.notices.get(id);if(n?.claimToken===token){n.status=delivered?'delivered':'pending';n.claimToken=null;} }
  readonly issues = new Map<string, CollaborationIssue>();
  readonly messages = new Map<string, CollaborationMessage>();
  readonly reviews = new Map<string, BilateralReview>();
  readonly pools = new Map<string, ArbitrationRewardPool>();
  readonly work = new Map<string, ArbitrationWork>();
  async listIssues(missionId?: string) { return structuredClone([...this.issues.values()].filter(x => !missionId || x.missionId === missionId)); }
  async insertIssue(issue: CollaborationIssue) { this.issues.set(issue.id, structuredClone(issue));
    this.notify(`issue:${issue.id}`,issue.missionId,issue.developerId,'收到新的协作问题',issue.createdAt,issue.authorId);
    this.notify(`issue-due:${issue.id}`,issue.missionId,issue.developerId,'协商已满 48 小时，可申请协调',issue.createdAt,undefined,issue.dueAt,issue.id);
  }
  async updateIssue(issue: CollaborationIssue, expectedStatus: CollaborationIssue['status']) {
    if (this.issues.get(issue.id)?.status !== expectedStatus || this.issues.get(issue.id)?.disputeId !== issue.disputeId) return false;
    this.issues.set(issue.id, structuredClone(issue));
    if(issue.status!==expectedStatus)this.notify(`issue-state:${issue.id}:${issue.status}`,issue.missionId,issue.developerId,'协作问题处理状态已更新',issue.updatedAt);
    return true;
  }
  async listMessages(missionId: string) { return structuredClone([...this.messages.values()].filter(x => x.missionId === missionId)); }
  async listReviewResponses(ids: string[]) { return structuredClone([...this.messages.values()].filter(m=>m.kind==='review' && ids.includes(m.targetId))); }
  async insertMessage(message: CollaborationMessage) { this.messages.set(message.id, structuredClone(message));
    const developerId=message.kind==='issue'?this.issues.get(message.targetId)?.developerId:message.kind==='review'?this.reviews.get(message.targetId)?.developerId:undefined;
    if(developerId)this.notify(`message:${message.id}`,message.missionId,developerId,'协作记录有新回应',message.createdAt,message.authorId);
  }
  async listReviews(missionId?: string) { return structuredClone([...this.reviews.values()].filter(x => !missionId || x.missionId === missionId)); }
  async listReadyReviews(now: string, missionId?: string) {
    const all = [...this.reviews.values()];
    return structuredClone(all.filter(r => !r.publishedAt && (!missionId || r.missionId === missionId) && (r.revealAt <= now || all.some(o => o.missionId === r.missionId && o.developerId === r.developerId && o.direction !== r.direction))).slice(0,100));
  }
  async listPublishedAgentReviews(agentId: string) { return structuredClone([...this.reviews.values()].filter(r => r.publishedAt && r.direction==='requester' && this.missionContext(r.missionId).stages.some(s => s.agentId===agentId && r.stageIds.includes(s.id))).slice(-50).reverse()); }
  async listPublishedRequesterReviews(requesterId: string) { return structuredClone([...this.reviews.values()].filter(r => r.publishedAt && r.eligible && r.direction==='developer' && this.missionContext(r.missionId).requesterId===requesterId)); }
  async insertReview(review: BilateralReview) {
    if ([...this.reviews.values()].some(x => x.missionId === review.missionId && x.developerId === review.developerId && x.direction === review.direction)) return false;
    this.reviews.set(review.id, structuredClone(review));
    this.notify(`review-sealed:${review.id}`,review.missionId,review.developerId,'对方已提交密封评价',review.createdAt,review.authorId);
    return true;
  }
  async publishReview(id: string, publishedAt: string) { const r = this.reviews.get(id); if (r && !r.publishedAt) { r.publishedAt = publishedAt; this.notify(`review-public:${r.missionId}:${r.developerId}`,r.missionId,r.developerId,'双方评价已揭示，可查看并回应',publishedAt); } }
  async listPools() { return structuredClone([...this.pools.values()]); }
  async insertPool(pool: ArbitrationRewardPool) {
    if ([...this.pools.values()].some(x => x.startsAt < pool.endsAt && x.endsAt > pool.startsAt)) return false;
    this.pools.set(pool.id, structuredClone(pool)); return true;
  }
  async listWork(disputeId?: string) { return structuredClone([...this.work.values()].filter(x => !disputeId || x.disputeId === disputeId)); }
  async insertWork(work: ArbitrationWork) {
    if ([...this.work.values()].some(x => x.proposalId === work.proposalId && x.userId === work.userId)) return false;
    const pool = this.pools.get(work.poolId);
    if (!pool || pool.feeMicros !== work.feeMicros || pool.startsAt > work.acceptedAt || pool.endsAt <= work.acceptedAt || pool.reservedMicros + work.feeMicros > pool.budgetMicros) return false;
    pool.reservedMicros += work.feeMicros; this.work.set(work.id, structuredClone(work)); return true;
  }
  async updateWork(work: ArbitrationWork, expectedStatus: ArbitrationWork['status']) {
    if (this.work.get(work.id)?.status !== expectedStatus || (work.status==='withdrawn' && this.hasVote(work.proposalId,work.userId))) return false;
    if (expectedStatus === 'accepted' && work.status === 'withdrawn') this.pools.get(work.poolId)!.reservedMicros -= work.feeMicros;
    this.work.set(work.id, structuredClone(work));
    if(['approved','rejected'].includes(work.status)) {
      const missionId=this.disputeMission(work.disputeId);
      if(missionId){const id=`work-review:${work.id}:${work.userId}`;this.notices.set(id,{id,userId:work.userId,missionId,title:'仲裁履职审核已完成',createdAt:work.reviewedAt!,availableAt:work.reviewedAt!,status:'pending'});}
    }
    return true;
  }
}

type Row = Record<string, unknown>;
function issueRow(r: Row): CollaborationIssue { return { id: String(r.id), missionId: String(r.mission_id), developerId: String(r.developer_id), authorId: String(r.author_id), stageIds: JSON.parse(String(r.stage_ids_json)), category: r.category as CollaborationIssue['category'], title: String(r.title), body: String(r.body), status: r.status as CollaborationIssue['status'], dueAt: String(r.due_at), createdAt: String(r.created_at), updatedAt: String(r.updated_at), resolution: r.resolution as string | null, disputeId: r.dispute_id as string | null }; }
function reviewRow(r: Row): BilateralReview { return { id: String(r.id), missionId: String(r.mission_id), developerId: String(r.developer_id), authorId: String(r.author_id), direction: r.direction as BilateralReview['direction'], ratings: JSON.parse(String(r.ratings_json)), comment: String(r.comment), createdAt: String(r.created_at), revealAt: String(r.reveal_at), publishedAt: r.published_at as string | null, stageIds: JSON.parse(String(r.stage_ids_json)), eligible: r.eligible === 1, caseStatus: String(r.case_status) }; }
function poolRow(r: Row): ArbitrationRewardPool { return { id: String(r.id), startsAt: String(r.starts_at), endsAt: String(r.ends_at), budgetMicros: Number(r.budget_micros), feeMicros: Number(r.fee_micros), reservedMicros: Number(r.reserved_micros), createdBy: String(r.created_by), createdAt: String(r.created_at) }; }
function workRow(r: Row): ArbitrationWork { return { id: String(r.id), disputeId: String(r.dispute_id), proposalId: String(r.proposal_id), userId: String(r.user_id), poolId: String(r.pool_id), feeMicros: Number(r.fee_micros), status: r.status as ArbitrationWork['status'], report: String(r.report), evidence: JSON.parse(String(r.evidence_json)), acceptedAt: String(r.accepted_at), submittedAt: r.submitted_at as string | null, reviewedAt: r.reviewed_at as string | null, reviewedBy: r.reviewed_by as string | null, reviewReason: r.review_reason as string | null }; }
export class D1CollaborationStore implements CollaborationStore {
  constructor(private readonly db: D1Database) {}
  async pendingNotices(now:string):Promise<CollaborationNotice[]> {
    const {results}=await this.db.prepare(`SELECT * FROM collaboration_notification_outbox n WHERE status<>'delivered' AND available_at<=?
      AND (lease_until IS NULL OR lease_until<=?) AND (issue_id IS NULL OR EXISTS (SELECT 1 FROM collaboration_issues i WHERE i.id=n.issue_id AND i.status='open')) ORDER BY available_at,id LIMIT 100`).bind(now,now).all();
    return results.map(r=>({id:String(r.id),userId:String(r.user_id),missionId:String(r.mission_id),title:String(r.title),createdAt:String(r.created_at),availableAt:String(r.available_at),issueId:r.issue_id as string|null,status:String(r.status)}));
  }
  async claimNotice(id:string,token:string,now:string,leaseUntil:string) {
    const r=await this.db.prepare(`UPDATE collaboration_notification_outbox SET status='processing',claim_token=?,lease_until=? WHERE id=? AND status<>'delivered' AND available_at<=? AND (lease_until IS NULL OR lease_until<=?)`).bind(token,leaseUntil,id,now,now).run();return r.meta.changes===1;
  }
  async finishNotice(id:string,token:string,delivered:boolean) { await this.db.prepare(`UPDATE collaboration_notification_outbox SET status=?,claim_token=NULL WHERE id=? AND claim_token=?`).bind(delivered?'delivered':'pending',id,token).run(); }
  async listIssues(missionId?: string) { const { results } = await (missionId ? this.db.prepare('SELECT * FROM collaboration_issues WHERE mission_id=? ORDER BY created_at').bind(missionId) : this.db.prepare("SELECT * FROM collaboration_issues WHERE status='escalated' ORDER BY created_at LIMIT 200")).all(); return results.map(issueRow); }
  async insertIssue(x: CollaborationIssue) { await this.db.prepare('INSERT INTO collaboration_issues VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(x.id,x.missionId,x.developerId,x.authorId,JSON.stringify(x.stageIds),x.category,x.title,x.body,x.status,x.dueAt,x.createdAt,x.updatedAt,x.resolution,x.disputeId).run(); }
  async updateIssue(x: CollaborationIssue, expectedStatus: CollaborationIssue['status']) { const result = await this.db.prepare('UPDATE collaboration_issues SET status=?,updated_at=?,resolution=? WHERE id=? AND status=? AND dispute_id IS ?').bind(x.status,x.updatedAt,x.resolution,x.id,expectedStatus,x.disputeId).run(); return result.meta.changes === 1; }
  async listMessages(missionId: string): Promise<CollaborationMessage[]> { const { results } = await this.db.prepare('SELECT * FROM collaboration_messages WHERE mission_id=? ORDER BY created_at,id').bind(missionId).all(); return results.map(r => ({id:String(r.id),missionId:String(r.mission_id),targetId:String(r.target_id),kind:r.kind as CollaborationMessage['kind'],authorId:String(r.author_id),body:String(r.body),evidence:JSON.parse(String(r.evidence_json)),createdAt:String(r.created_at)})); }
  async listReviewResponses(ids:string[]):Promise<CollaborationMessage[]> {
    if (!ids.length) return [];
    const {results}=await this.db.prepare(`SELECT * FROM collaboration_messages WHERE kind='review' AND target_id IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at,id`).bind(...ids).all();
    return results.map(r=>({id:String(r.id),missionId:String(r.mission_id),targetId:String(r.target_id),kind:'review',authorId:String(r.author_id),body:String(r.body),evidence:JSON.parse(String(r.evidence_json)),createdAt:String(r.created_at)}));
  }
  async insertMessage(x: CollaborationMessage) { await this.db.prepare('INSERT INTO collaboration_messages VALUES (?,?,?,?,?,?,?,?)').bind(x.id,x.missionId,x.targetId,x.kind,x.authorId,x.body,JSON.stringify(x.evidence),x.createdAt).run(); }
  async listReviews(missionId?: string) { const {results} = await (missionId ? this.db.prepare('SELECT * FROM bilateral_reviews WHERE mission_id=? ORDER BY created_at,id').bind(missionId) : this.db.prepare('SELECT * FROM bilateral_reviews ORDER BY created_at,id')).all(); return results.map(reviewRow); }
  async listReadyReviews(now: string, missionId?: string) {
    const {results}=await this.db.prepare(`SELECT r.* FROM bilateral_reviews r WHERE r.published_at IS NULL
      AND (? IS NULL OR r.mission_id=?) AND (r.reveal_at<=? OR EXISTS (SELECT 1 FROM bilateral_reviews other WHERE other.mission_id=r.mission_id AND other.developer_id=r.developer_id AND other.direction<>r.direction))
      ORDER BY r.created_at,r.id LIMIT 100`).bind(missionId??null,missionId??null,now).all(); return results.map(reviewRow);
  }
  async listPublishedAgentReviews(agentId:string) {
    const {results}=await this.db.prepare(`SELECT r.* FROM bilateral_reviews r WHERE r.published_at IS NOT NULL AND r.direction='requester'
      AND EXISTS (SELECT 1 FROM workflow_stages s JOIN json_each(r.stage_ids_json) j ON j.value=s.id WHERE s.mission_id=r.mission_id AND s.agent_id=?) ORDER BY r.published_at DESC,r.id DESC LIMIT 50`).bind(agentId).all();return results.map(reviewRow);
  }
  async listPublishedRequesterReviews(requesterId:string) {
    const {results}=await this.db.prepare(`SELECT r.* FROM bilateral_reviews r JOIN missions m ON m.id=r.mission_id WHERE r.published_at IS NOT NULL AND r.eligible=1 AND r.direction='developer' AND m.requester_id=? ORDER BY r.created_at,r.id`).bind(requesterId).all();return results.map(reviewRow);
  }
  async insertReview(x: BilateralReview) { const r = await this.db.prepare('INSERT INTO bilateral_reviews VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mission_id,developer_id,direction) DO NOTHING').bind(x.id,x.missionId,x.developerId,x.authorId,x.direction,JSON.stringify(x.ratings),x.comment,x.createdAt,x.revealAt,x.publishedAt,JSON.stringify(x.stageIds),x.eligible ? 1 : 0,x.caseStatus).run(); return r.meta.changes === 1; }
  async publishReview(id: string, at: string) { await this.db.prepare('UPDATE bilateral_reviews SET published_at=? WHERE id=? AND published_at IS NULL').bind(at,id).run(); }
  async listPools() { const {results} = await this.db.prepare('SELECT * FROM arbitration_reward_pools ORDER BY starts_at').all(); return results.map(poolRow); }
  async insertPool(x: ArbitrationRewardPool) { const r = await this.db.prepare('INSERT INTO arbitration_reward_pools SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM arbitration_reward_pools WHERE starts_at<? AND ends_at>?)').bind(x.id,x.startsAt,x.endsAt,x.budgetMicros,x.feeMicros,0,x.createdBy,x.createdAt,x.endsAt,x.startsAt).run(); return r.meta.changes === 1; }
  async listWork(disputeId?: string) { const {results} = await (disputeId ? this.db.prepare('SELECT * FROM arbitration_work WHERE dispute_id=? ORDER BY accepted_at').bind(disputeId) : this.db.prepare('SELECT * FROM arbitration_work ORDER BY accepted_at')).all(); return results.map(workRow); }
  async insertWork(x: ArbitrationWork) {
    // INSERT ... SELECT avoids invoking the reservation trigger for replayed work.
    const r = await this.db.prepare(`INSERT INTO arbitration_work SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM arbitration_work WHERE proposal_id=? AND user_id=?) AND EXISTS (SELECT 1 FROM arbitration_reward_pools WHERE id=? AND reserved_micros+?<=budget_micros AND starts_at<=? AND ends_at>?)`).bind(x.id,x.disputeId,x.proposalId,x.userId,x.poolId,x.feeMicros,x.status,x.report,JSON.stringify(x.evidence),x.acceptedAt,x.submittedAt,x.reviewedAt,x.reviewedBy,x.reviewReason,x.proposalId,x.userId,x.poolId,x.feeMicros,x.acceptedAt,x.acceptedAt).run(); return r.meta.changes === 1;
  }
  async updateWork(x: ArbitrationWork, expectedStatus: ArbitrationWork['status']) { const r = await this.db.prepare(`UPDATE arbitration_work SET status=?,report=?,evidence_json=?,submitted_at=?,reviewed_at=?,reviewed_by=?,review_reason=? WHERE id=? AND status=? AND (? <> 'withdrawn' OR NOT EXISTS (SELECT 1 FROM dispute_round_votes WHERE proposal_id=? AND voter_id=?))`).bind(x.status,x.report,JSON.stringify(x.evidence),x.submittedAt,x.reviewedAt,x.reviewedBy,x.reviewReason,x.id,expectedStatus,x.status,x.proposalId,x.userId).run(); return r.meta.changes === 1; }
}
