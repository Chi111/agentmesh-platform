import type { ArbitrationRewardView, ArbitrationWork, BilateralReview, CollaborationIssue, CollaborationMessage, CollaborationView, IssueCategory } from '../../shared/collaboration';
import type { Agent, Mission, PlatformStore, UserContext, WorkflowStage } from './contracts';
import { taskProfile } from './matching';
import { feedbackWeightForPriorCount } from './agentQuality';
import { REWARD_FORMULA_VERSION } from './ydFinance';

export class CollaborationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function check(ok: unknown, status: number, code: string, message: string): asserts ok { if (!ok) throw new CollaborationError(status, code, message); }
function content(body: Record<string, unknown>, key: string, min = 5, max = 2000): string {
  const value = body[key];
  check(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, 400, 'INVALID_COLLABORATION_INPUT', `${key} 长度必须为 ${min}–${max} 个字符。`);
  return value.trim();
}
function evidence(body: Record<string, unknown>): CollaborationMessage['evidence'] {
  if (body.evidence === undefined) return [];
  check(Array.isArray(body.evidence) && body.evidence.length <= 10, 400, 'INVALID_EVIDENCE', '最多提交 10 条证据。');
  return body.evidence.map(item => {
    check(item && typeof item === 'object' && !Array.isArray(item), 400, 'INVALID_EVIDENCE', '证据格式无效。');
    const label = content(item, 'label', 1, 120); const uri = content(item, 'uri', 8, 2000);
    let url: URL; try { url = new URL(uri); } catch { throw new CollaborationError(400, 'INVALID_EVIDENCE', '证据链接无效。'); }
    check(['https:', 'ipfs:'].includes(url.protocol) && !url.username && !url.password, 400, 'INVALID_EVIDENCE', '证据仅接受 HTTPS 或 IPFS 链接。');
    return { label, uri };
  });
}
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const addDays = (at: string, days: number) => new Date(Date.parse(at) + days * 86400000).toISOString();
type Context = { mission: Mission; stages: WorkflowStage[]; agents: Agent[] };
async function context(store: PlatformStore, user: UserContext, missionId: string): Promise<Context> {
  const mission = await store.getMission(missionId);
  check(mission, 404, 'MISSION_NOT_FOUND', '任务不存在。');
  const [stages, agents] = await Promise.all([store.listStages(missionId), store.listAgents()]);
  check(user.role === 'admin' || mission.requesterId === user.id || stages.some(s => agents.some(a => a.id === s.agentId && a.ownerId === user.id)), 403, 'FORBIDDEN', '仅实际任务参与者可使用协作渠道。');
  return { mission, stages, agents };
}
function pairs(c: Context) {
  const developers = new Map<string, { developerId: string; name: string; stageIds: string[]; stageNames: string[] }>();
  for (const stage of c.stages) {
    if (stage.nodeType !== 'task') continue;
    const agent = c.agents.find(a => a.id === stage.agentId);
    if (!agent?.ownerId || agent.ownerId === c.mission.requesterId) continue;
    const pair = developers.get(agent.ownerId) ?? { developerId: agent.ownerId, name: agent.author || agent.ownerId, stageIds: [], stageNames: [] };
    pair.stageIds.push(stage.id); pair.stageNames.push(stage.name); developers.set(agent.ownerId, pair);
  }
  return [...developers.values()];
}
function visibleIssue(issue: CollaborationIssue, c: Context, user: UserContext) { return user.role === 'admin' || user.id === c.mission.requesterId || user.id === issue.developerId; }
async function reviewWindow(store: PlatformStore, c: Context) {
  const [escrow, disputes] = await Promise.all([store.getEscrow(c.mission.id), store.getDisputes(c.mission.id)]);
  const refund = disputes.filter(d => d.status === 'resolved').sort((a,b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))[0];
  const closedAt = c.mission.status === 'completed' && escrow?.status === 'released' ? escrow.releasedAt ?? c.mission.updatedAt
    : c.mission.status === 'cancelled' ? refund?.resolvedAt ?? c.mission.updatedAt : null;
  const contested = disputes.some(d => ['open','reviewing','resolved'].includes(d.status));
  return { endsAt: closedAt ? addDays(closedAt, 7) : null, eligible: c.mission.status === 'completed' && escrow?.status === 'released' && !contested,
    caseStatus: refund ? 'refunded' : contested ? 'disputed' : c.mission.status };
}
// Publication is retryable: deterministic event keys prevent cron and HTTP races from counting twice.
export async function publishBilateralReviews(store: PlatformStore, now: string, missionId?: string) {
  const reviews = await store.collaboration.listReadyReviews(now, missionId);
  for (const review of reviews) {
    if (review.direction === 'requester' && review.eligible) {
      const stages = await store.listStages(review.missionId);
      const agentIds = [...new Set(stages.filter(s => review.stageIds.includes(s.id) && s.status === 'done' && s.agentId).map(s => s.agentId!))];
      for (const agentId of agentIds) {
        const prior = (await store.listAgentMetricEvents(agentId)).filter(e => e.type === 'feedback_received' && e.detail.requesterId === review.authorId && e.sourceId !== review.id).length;
        await store.recordAgentMetricEvent({
          id: `AGMETRIC-${review.id}-${agentId}`, idempotencyKey: `bilateral:${review.id}:${agentId}`, agentId,
          type: 'feedback_received', value: review.ratings.reduce((a,b) => a+b, 0) / review.ratings.length * 20,
          weight: feedbackWeightForPriorCount(prior), severity: 'info', sourceType: 'feedback', sourceId: review.id,
          detail: { requesterId: review.authorId, bilateralReviewId: review.id }, occurredAt: now, createdAt: now,
        }, now);
      }
    }
    if (review.direction === 'requester' && review.eligible) {
      const stages = await store.listStages(review.missionId);
      const state = await store.matching.load();
      for (const stage of stages.filter(s => review.stageIds.includes(s.id) && s.status === 'done' && s.agentId)) {
        const lease = state.leases.filter(l => l.stageId === stage.id && l.agentId === stage.agentId && l.status === 'released').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
        if (!lease) continue;
        const profile = taskProfile(stage);
        await store.matching.saveOutcome({id:`${stage.id}:${stage.agentId}:${lease.agentVersion}`,agentId:stage.agentId!,agentVersion:lease.agentVersion,family:profile.family,mode:profile.mode,success:true,quality:(review.ratings[0]+review.ratings[1])/10,durationSeconds:lease.completedAt&&lease.contactedAt?Math.max(1,(Date.parse(lease.completedAt)-Date.parse(lease.contactedAt))/1000):null,occurredAt:now});
      }
    }
    await store.collaboration.publishReview(review.id, now);
  }
}
export async function publicBilateralAgentReviews(store: PlatformStore, agentId: string) {
  const reviews=await store.collaboration.listPublishedAgentReviews(agentId);
  const responses=await store.collaboration.listReviewResponses(reviews.map(r=>r.id));
  return reviews.map(r => ({id:r.id,ratings:r.ratings,comment:r.comment,publishedAt:r.publishedAt,eligible:r.eligible,caseStatus:r.caseStatus,
    responses:responses.filter(m=>m.targetId===r.id).map(m=>({body:m.body,createdAt:m.createdAt,role:m.authorId===r.developerId?'developer':'requester'}))}));
}
async function view(store: PlatformStore, user: UserContext, c: Context, now: string): Promise<CollaborationView> {
  await publishBilateralReviews(store, now, c.mission.id);
  const [issues, reviews, messages, window] = await Promise.all([store.collaboration.listIssues(c.mission.id),store.collaboration.listReviews(c.mission.id),store.collaboration.listMessages(c.mission.id), reviewWindow(store,c)]);
  const role = user.id === c.mission.requesterId ? 'requester' : pairs(c).some(p => p.developerId === user.id) ? 'developer' : 'observer';
  const visibleIssues = issues.filter(i => visibleIssue(i,c,user));
  // Even admins do not receive the sealed counterparty's text or scores through this channel.
  const visibleReviews = reviews.filter(r => (role === 'requester' || r.developerId === user.id || user.role === 'admin') && (r.authorId === user.id || r.publishedAt));
  const visibleIds = new Set([...visibleIssues.map(x => x.id), ...visibleReviews.filter(r => r.publishedAt).map(x => x.id)]);
  const requesterReviews = await store.collaboration.listPublishedRequesterReviews(c.mission.requesterId);
  const counts = new Map<string, number>(); let total = 0, weights = 0;
  for (const r of requesterReviews) { const n = counts.get(r.developerId) ?? 0; const weight = 1 / Math.sqrt(n+1); counts.set(r.developerId,n+1); total += r.ratings.reduce((a,b)=>a+b,0)/r.ratings.length*weight; weights += weight; }
  return { issues: visibleIssues, messages: messages.filter(m => visibleIds.has(m.targetId)), reviews: visibleReviews,
    pairs: pairs(c).filter(p => role !== 'developer' || p.developerId === user.id).map(p => ({...p,submitted: reviews.some(r=>r.developerId===p.developerId && r.direction===role),counterpartSubmitted: reviews.some(r=>r.developerId===p.developerId && r.direction!==role)})),
    reviewEndsAt: window.endsAt, canReview: role !== 'observer' && Boolean(window.endsAt && now < window.endsAt), role,
    requesterReputation: {count: requesterReviews.length,score: weights ? Math.round(total/weights*100)/100 : null,confidence: counts.size >= 10 ? 'high' : counts.size >= 3 ? 'medium' : 'low'} };
}
async function addMessage(store: PlatformStore, user: UserContext, missionId: string, targetId: string, kind: CollaborationMessage['kind'], body: Record<string, unknown>, now: string) {
  const message: CollaborationMessage = {id:id('MSG'),missionId,targetId,kind,authorId:user.id,body:content(body,'body'),evidence:evidence(body),createdAt:now};
  await store.collaboration.insertMessage(message); return message;
}
export async function handleCollaborationRequest(store: PlatformStore, user: UserContext, path: string, method: string, body: Record<string, unknown>, now: string): Promise<{status:number;body:unknown}> {
  if (path === '/api/collaboration/issues' && method === 'GET') {
    check(user.role === 'admin',403,'FORBIDDEN','仅管理员可以读取待协调申请。');
    return {status:200,body:(await store.collaboration.listIssues()).filter(i=>i.status==='escalated')};
  }
  const match = path.match(/^\/api\/missions\/([^/]+)\/collaboration(?:\/(issues|reviews)(?:\/([^/]+)(?:\/(respond|escalate|resolve))?)?)?$/);
  if (match) {
    const missionId = decodeURIComponent(match[1]); const c = await context(store,user,missionId);
    const resource = match[2]; const targetId = match[3] ? decodeURIComponent(match[3]) : null; const action = match[4];
    if (!resource && method === 'GET') return {status:200,body:await view(store,user,c,now)};
    if (resource === 'issues' && !targetId && method === 'POST') {
      const developerId = content(body,'developerId',1,200); const pair = pairs(c).find(p=>p.developerId===developerId);
      check(pair && (user.id===c.mission.requesterId || user.id===developerId || user.role==='admin'),403,'FORBIDDEN','只能就自己参与的交付提交问题。');
      const categories: IssueCategory[] = ['delivery','scope_change','missing_material','acceptance_delay','review_appeal','platform_bug'];
      check(categories.includes(body.category as IssueCategory),400,'INVALID_CATEGORY','请选择问题类型。');
      check(Array.isArray(body.stageIds) && body.stageIds.length > 0 && body.stageIds.every(s=>typeof s==='string' && pair.stageIds.includes(s)),400,'INVALID_STAGE_SCOPE','请选择该开发者参与的节点。');
      const issue: CollaborationIssue = {id:id('ISSUE'),missionId,developerId,authorId:user.id,stageIds:[...new Set(body.stageIds as string[])],category:body.category as IssueCategory,title:content(body,'title',5,120),body:content(body,'body'),status:'open',dueAt:addDays(now,2),createdAt:now,updatedAt:now,resolution:null,disputeId:null};
      await store.collaboration.insertIssue(issue); return {status:201,body:issue};
    }
    if (resource === 'issues' && targetId && method === 'POST') {
      const issue = (await store.collaboration.listIssues(missionId)).find(i=>i.id===targetId);
      check(issue && visibleIssue(issue,c,user),404,'ISSUE_NOT_FOUND','问题不存在或无权访问。');
      check(issue.status!=='resolved',409,'ISSUE_CLOSED','问题已经关闭。');
      if (action==='respond') return {status:201,body:await addMessage(store,user,missionId,targetId,'issue',body,now)};
      if (action==='escalate') {
        check(issue.status==='open',409,'ISSUE_ALREADY_ESCALATED','申请已经提交。');
        check(now>=issue.dueAt || user.role==='admin',409,'NEGOTIATION_PENDING','请先完成 48 小时协商窗口。');
        check(await store.collaboration.updateIssue({...issue,status:'escalated',updatedAt:now},issue.status),409,'COLLABORATION_CONFLICT','问题状态已变化，请刷新。');
        return {status:200,body:{...issue,status:'escalated',updatedAt:now}};
      }
      if (action==='resolve') {
        check(user.id===issue.authorId || user.role==='admin',403,'FORBIDDEN','仅发起人确认解决，或管理员填写处理结论后关闭。');
        if (issue.disputeId) {
          const dispute = (await store.getDisputes(missionId)).find(d=>d.id===issue.disputeId);
          check(dispute && ['resolved','rejected'].includes(dispute.status),409,'FUNDS_CASE_PENDING','关联资金案件尚未结案，不能提前关闭协调申请。');
        }
        const resolution = content(body,'body',12);
        check(await store.collaboration.updateIssue({...issue,status:'resolved',resolution,updatedAt:now},issue.status),409,'COLLABORATION_CONFLICT','问题状态已变化，请刷新。');
        return {status:200,body:{...issue,status:'resolved',resolution,updatedAt:now}};
      }
    }
    if (resource==='reviews' && !targetId && method==='POST') {
      const developerId = content(body,'developerId',1,200); const pair = pairs(c).find(p=>p.developerId===developerId);
      check(pair && (user.id===c.mission.requesterId || user.id===developerId),403,'FORBIDDEN','仅合作双方可以互评，不能评价自己。');
      const window = await reviewWindow(store,c);
      check(window.endsAt && now<window.endsAt,409,'REVIEW_WINDOW_CLOSED','互评仅在任务结案后的七天内开放。');
      check(Array.isArray(body.ratings) && body.ratings.length===5 && body.ratings.every(v=>Number.isInteger(v) && v>=1 && v<=5),400,'INVALID_RATINGS','五个维度均需填写 1–5 分。');
      const review: BilateralReview = {id:id('REVIEW'),missionId,developerId,authorId:user.id,direction:user.id===developerId?'developer':'requester',ratings:body.ratings as number[],comment:content(body,'comment',5,1000),createdAt:now,revealAt:window.endsAt,publishedAt:null,stageIds:pair.stageIds,eligible:window.eligible,caseStatus:window.caseStatus};
      check(await store.collaboration.insertReview(review),409,'REVIEW_ALREADY_SUBMITTED','评价已经密封提交，不能修改；公开后可补充回应。');
      await publishBilateralReviews(store,now,missionId); return {status:201,body:await view(store,user,c,now)};
    }
    if (resource==='reviews' && targetId && action==='respond' && method==='POST') {
      await publishBilateralReviews(store,now,missionId);
      const review = (await store.collaboration.listReviews(missionId)).find(r=>r.id===targetId);
      check(review?.publishedAt && (user.id===review.developerId || user.id===c.mission.requesterId),403,'REVIEW_NOT_PUBLIC','仅双方能回应已公开的评价。');
      return {status:201,body:await addMessage(store,user,missionId,targetId,'review',body,now)};
    }
  }
  const disputeMatch = path.match(/^\/api\/disputes\/([^/]+)\/(collaboration|reward-work)(?:\/([^/]+))?$/);
  if (disputeMatch) return handleArbitrationWork(store,user,decodeURIComponent(disputeMatch[1]),disputeMatch[2],disputeMatch[3],method,body,now);
  if (path==='/api/arbitration/reward-pools') {
    check(user.role==='admin',403,'FORBIDDEN','仅管理员可以管理仲裁预算。');
    if (method==='GET') return {status:200,body:await store.collaboration.listPools()};
    if (method==='POST') {
      const startsAt = content(body,'startsAt',10,40), endsAt = content(body,'endsAt',10,40);
      check(Number.isFinite(Date.parse(startsAt)) && Number.isFinite(Date.parse(endsAt)) && new Date(startsAt).toISOString()===startsAt && new Date(endsAt).toISOString()===endsAt && startsAt<endsAt && endsAt>now,400,'INVALID_POOL_WINDOW','请填写有效的预算周期。');
      check(Number.isSafeInteger(body.budgetMicros) && Number.isSafeInteger(body.feeMicros) && Number(body.feeMicros)>0 && Number(body.budgetMicros)>=Number(body.feeMicros) && Number(body.budgetMicros)<=1e12,400,'INVALID_POOL_BUDGET','预算必须覆盖单次报酬，最多 1,000,000 PM。');
      const pool={id:id('ARBPOOL'),startsAt,endsAt,budgetMicros:Number(body.budgetMicros),feeMicros:Number(body.feeMicros),reservedMicros:0,createdBy:user.id,createdAt:now};
      check(await store.collaboration.insertPool(pool),409,'POOL_WINDOW_OVERLAP','仲裁预算周期不能重叠。'); return {status:201,body:pool};
    }
  }
  throw new CollaborationError(404,'ROUTE_NOT_FOUND','协作接口不存在。');
}

async function handleArbitrationWork(store:PlatformStore,user:UserContext,disputeId:string,resource:string,action:string|undefined,method:string,body:Record<string,unknown>,now:string):Promise<{status:number;body:unknown}> {
  const dispute = (await store.listDisputes(user)).find(d=>d.id===disputeId);
  check(dispute,404,'DISPUTE_NOT_FOUND','案件不存在。');
  const [mission, stages, agents, governance] = await Promise.all([store.getMission(dispute.missionId),store.listStages(dispute.missionId),store.listAgents(),store.getDisputeGovernance(disputeId,user.id,now)]);
  check(mission,404,'MISSION_NOT_FOUND','任务不存在。');
  const party = user.id===dispute.openedBy || user.id===mission.requesterId || stages.some(s=>agents.some(a=>a.id===s.agentId && a.ownerId===user.id));
  const allLinkedIssues = (await store.collaboration.listIssues(dispute.missionId)).filter(i=>i.disputeId===disputeId);
  const canReadIssue = (i:CollaborationIssue) => user.role==='admin' || user.id===mission.requesterId || user.id===i.developerId || Boolean(governance?.rounds.some(r=>r.electorate.some(e=>e.userId===user.id)));
  const linkedIssues = allLinkedIssues.filter(canReadIssue);
  // Reports and audit reasons may quote any linked private material, so redact them as well.
  const canReadReports = allLinkedIssues.every(canReadIssue);
  const linkedIds = new Set(linkedIssues.map(i=>i.id));
  const ownWork = (await store.collaboration.listWork()).filter(w=>w.userId===user.id);
  const reputation = {accepted:ownWork.length,submitted:ownWork.filter(w=>w.submittedAt).length,approved:ownWork.filter(w=>w.status==='approved').length,rejected:ownWork.filter(w=>w.status==='rejected').length};
  const evidenceOptions = ['案件事实与诉求', ...dispute.evidence.map(e=>e.uri), ...linkedIssues.map(i=>i.id)];
  if (dispute.evidenceSnapshot) evidenceOptions.push('冻结任务证据快照');
  const pools = await store.collaboration.listPools(); const work = await store.collaboration.listWork(disputeId);
  const current = work.find(w=>w.userId===user.id && w.proposalId===governance?.proposal?.id);
  if (resource==='collaboration' && method==='GET') {
    await syncArbitrationRewards(store, now, work);
    const result: ArbitrationRewardView = {linkedIssues,reputation,pools:pools.filter(p=>p.startsAt<=now && p.endsAt>now),work:work.map(w=>canReadReports || w.userId===user.id ? w : {...w,report:'',evidence:[],reviewReason:null}),messages:(await store.collaboration.listMessages(dispute.missionId)).filter(m=>(m.kind==='dispute' && m.targetId===disputeId) || linkedIds.has(m.targetId)),canRespond:party && ['open','reviewing'].includes(dispute.status),canAccept:Boolean(governance?.currentUser.canVote && !current),evidenceOptions};
    return {status:200,body:result};
  }
  if (resource==='collaboration' && method==='POST') {
    check(party && ['open','reviewing'].includes(dispute.status),403,'FORBIDDEN','仅案件双方能在开放案件中补充陈述。');
    return {status:201,body:await addMessage(store,user,dispute.missionId,disputeId,'dispute',body,now)};
  }
  if (resource==='reward-work' && method==='POST') {
    if (action==='accept') {
      check(governance?.proposal && governance.currentUser.canVote && !party && !current,409,'WORK_NOT_AVAILABLE','仅尚未投票的无利益冲突委员可以接案。');
      const pool = pools.find(p=>p.id===body.poolId && p.startsAt<=now && p.endsAt>now);
      check(pool,409,'POOL_NOT_AVAILABLE','当前没有可用的仲裁预算。');
      const entry:ArbitrationWork={id:id('ARBWORK'),disputeId,proposalId:governance.proposal.id,userId:user.id,poolId:pool.id,feeMicros:pool.feeMicros,status:'accepted',report:'',evidence:[],acceptedAt:now,submittedAt:null,reviewedAt:null,reviewedBy:null,reviewReason:null};
      check(await store.collaboration.insertWork(entry),409,'POOL_EXHAUSTED','预算已用完或已接案，请刷新。'); return {status:201,body:entry};
    }
    const entry = work.find(w=>w.id===body.workId);
    check(entry,404,'WORK_NOT_FOUND','履职记录不存在。');
    if (action==='withdraw') {
      const round=governance?.rounds.find(r=>r.proposal.id===entry.proposalId);
      check(entry.userId===user.id && entry.status==='accepted' && !round?.votes.some(v=>v.voterId===user.id),409,'WORK_NOT_WITHDRAWABLE','仅尚未投票的接案委员可以回避本案。');
      const next={...entry,status:'withdrawn' as const,reviewReason:content(body,'reason',12,2000)};
      check(await store.collaboration.updateWork(next,'accepted'),409,'WORK_CONFLICT','履职状态已变化。'); return {status:200,body:next};
    }
    if (action==='submit') {
      const round = governance?.rounds.find(r=>r.proposal.id===entry.proposalId);
      check(entry.userId===user.id && entry.status==='accepted' && round?.votes.some(v=>v.voterId===user.id) && now<addDays(round.proposal.votingEndsAt,2),409,'WORK_NOT_SUBMITTABLE','请先按时投票，并在投票截止后 48 小时内提交审案说明。');
      check(Array.isArray(body.evidence) && body.evidence.length>0 && body.evidence.length<=10 && body.evidence.every(v=>typeof v==='string' && evidenceOptions.includes(v)),400,'EVIDENCE_REQUIRED','请选择审阅的案件证据。');
      const next={...entry,status:'submitted' as const,report:content(body,'report',80,4000),evidence:[...new Set(body.evidence as string[])],submittedAt:now};
      check(await store.collaboration.updateWork(next,'accepted'),409,'WORK_CONFLICT','履职状态已变化。'); return {status:200,body:next};
    }
    if (action==='approve' || action==='reject') {
      check(user.role==='admin' && user.id!==entry.userId && !party,403,'FORBIDDEN','履职审核须由无利益冲突的管理员完成。');
      check(entry.status==='submitted',409,'WORK_CONFLICT','只审核已提交的履职记录。');
      check(action==='reject' || await store.getProfile(entry.userId).then(p=>Boolean(p?.walletAddress && /^0x[a-fA-F0-9]{40}$/.test(p.walletAddress))),409,'REWARD_WALLET_REQUIRED','委员需要先绑定领取钱包。');
      const next={...entry,status:action==='approve'?'approved' as const:'rejected' as const,reviewedAt:now,reviewedBy:user.id,reviewReason:content(body,'reason',12,2000)};
      check(await store.collaboration.updateWork(next,'submitted'),409,'WORK_CONFLICT','履职状态已变化。');
      await syncArbitrationRewards(store,now,[next]); return {status:200,body:next};
    }
  }
  throw new CollaborationError(404,'ROUTE_NOT_FOUND','仲裁协作接口不存在。');
}
export async function syncArbitrationRewards(store:PlatformStore,now:string,work?:ArbitrationWork[]) {
  for (const entry of work ?? await store.collaboration.listWork()) {
    if (entry.status!=='approved') continue;

    await store.recordRewardActivity({id:`ARBREWARD-${entry.id}`,sourceKey:`arbitration-work:${entry.id}`,userId:entry.userId,missionId:null,disputeId:entry.disputeId,role:'arbitrator',formulaVersion:REWARD_FORMULA_VERSION,asset:'PM',settledAmount:0,qualityBps:10000,penaltyBps:0,scoreMicros:1,eligible:true,detail:{source:'reviewed_arbitration_work',fixedRewardUnits:(BigInt(entry.feeMicros)*1000000000000n).toString(),workId:entry.id,poolId:entry.poolId},occurredAt:entry.reviewedAt!,createdAt:now});
  }
}
