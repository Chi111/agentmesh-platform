import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { D1PlatformStore, type D1Database, type D1Statement } from './store';
import { MemoryPlatformStore } from './memoryStore';
import { handleCollaborationRequest, publishBilateralReviews, syncArbitrationRewards } from './collaboration';
import { createApp, drainCollaborationNotifications } from './worker';
import type { PlatformStore, RewardEpoch, UserContext } from './contracts';
import type { ArbitrationRewardPool, ArbitrationWork, CollaborationIssue, CollaborationView } from '../../shared/collaboration';
class Statement implements D1Statement {
  constructor(private db:DatabaseSync,private sql:string,private args:unknown[]=[]){}
  bind(...args:unknown[]){return new Statement(this.db,this.sql,args);}
  async all<T>(){return {results:this.db.prepare(this.sql).all(...this.args) as T[]};}
  async first<T>(){return (this.db.prepare(this.sql).get(...this.args)??null) as T|null;}
  async run(){return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.args).changes)}};}
}
class Database implements D1Database {
  private pending=Promise.resolve<unknown>(undefined);
  constructor(readonly db:DatabaseSync){}
  prepare(sql:string){return new Statement(this.db,sql);}
  async batch(statements:D1Statement[]){
    const run=this.pending.then(async()=>{this.db.exec('BEGIN IMMEDIATE');try{const rows=[];for(const s of statements)rows.push(await s.run());this.db.exec('COMMIT');return rows;}catch(e){this.db.exec('ROLLBACK');throw e;}});
    this.pending=run.catch(()=>undefined);return run;
  }
}
const now='2026-09-05T10:00:00.000Z';
const later='2026-09-07T10:00:00.000Z';
const deadline='2026-09-12T10:00:00.000Z';
const actors=['requester','developer','other','admin','arb1','arb2','outsider','admin2'];
const reviewInput={developerId:'developer',ratings:[5,4,5,4,5],comment:'评价密封期间，这条内容和评分不得泄露。'};
const issueInput={developerId:'developer',stageIds:['stage1'],category:'acceptance_delay',title:'验收标准与原需求不一致',body:'交付已经按原始验收标准完成，希望双方确认新增要求的范围。'};
for(const mode of ['memory','sqlite'] as const) describe(`bilateral collaboration (${mode})`,()=>{
  let db:Database;let store:PlatformStore;let users:Map<string,UserContext>;let currentNow:string;
  beforeEach(async()=>{
    db=new Database(new DatabaseSync(':memory:'));db.db.exec('PRAGMA foreign_keys=ON');
    const root=join(import.meta.dirname,'../../db');for(const file of readdirSync(root).filter(f=>/^\d+_.+\.sql$/.test(f)).sort())db.db.exec(readFileSync(join(root,file),'utf8'));
    for(const [index,name] of actors.entries())db.db.prepare('INSERT INTO profiles (id,display_name,role,email,wallet_address) VALUES (?,?,?,?,?)').run(name,name,name.startsWith('admin')?'admin':['developer','other'].includes(name)?'developer':'requester',`${name}@example.test`,`0x${String(index+1).repeat(40)}`);
    for(const [name,owner] of [['a1','developer'],['a2','developer'],['a3','other']])db.db.prepare("INSERT INTO agents (id,owner_id,name,category,summary,endpoint_url,price_usdc,wallet_address,status,author_name) VALUES (?,?,?,'engineering','test','https://example.test',10,?,'active',?)").run(name,owner,name,'0x'+'2'.repeat(40),owner);
    db.db.prepare("INSERT INTO missions (id,requester_id,title,description,category,budget_usdc,deadline,status,team_json,updated_at) VALUES ('m','requester','Test','Description','engineering',30,'2026-09-20','completed','[\"a1\",\"a2\",\"a3\"]',?)").run(now);
    for(const [i,a] of ['a1','a2','a3'].entries())db.db.prepare("INSERT INTO workflow_stages (id,mission_id,position,name,purpose,category,budget_usdc,status,agent_id,output_json) VALUES (?,'m',?,?,'task','engineering',10,'done',?,'{\"verified\":true}')").run(`stage${i+1}`,i+1,`Stage ${i+1}`,a);
    db.db.prepare("INSERT INTO escrows (id,mission_id,amount,token,network,status,released_at) VALUES ('e','m',30,'CREDIT','agentmesh','released',?)").run(now);
    const d1=new D1PlatformStore(db);users=new Map();for(const name of actors)users.set(name,(await d1.getProfile(name))!);
    if(mode==='sqlite')store=d1;else{const memory=new MemoryPlatformStore();for(const [name,user] of users)memory.profiles.set(name,user);for(const a of await d1.listAgents())memory.agents.set(a.id,a);memory.missions.set('m',(await d1.getMission('m'))!);memory.stages.set('m',await d1.listStages('m'));memory.escrows.set('m',(await d1.getEscrow('m'))!);store=memory;}
    currentNow=now;
  });
  afterEach(()=>db.db.close());
  const invoke=(user:string,path:string,method='GET',body:Record<string,unknown>={})=>handleCollaborationRequest(store,users.get(user)!,path,method,body,currentNow);
  const base='/api/missions/m/collaboration';
  async function http(user:string,path:string,method='GET',body?:unknown){
    const app=createApp({storeFactory:()=>store,now:()=>new Date(currentNow),identityResolver:async()=>({uid:user,provider:'pinme',email:users.get(user)?.email,displayName:user,claims:{}})});
    const response=await app.fetch(new Request(`http://test.local${path}`,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{PROJECT_NAME:'test'});
    return {status:response.status,body:await response.json() as any};
  }
  async function running(){if(store instanceof MemoryPlatformStore){store.missions.get('m')!.status='running';store.escrows.get('m')!.status='held';}else db.db.exec("UPDATE missions SET status='running' WHERE id='m'; UPDATE escrows SET status='held' WHERE mission_id='m'");}
  async function arbitration(openedBy='requester',collaborationIssueId?:string){
    await running();await store.createDispute({id:'d',missionId:'m',openedBy,...(collaborationIssueId?{collaborationIssueId}:{}),reason:'交付存在实际争议，需要查验任务证据。',evidence:[{label:'交付证据',uri:'https://example.test/evidence'}],status:'open',resolution:null,freezeTxHash:null,resolutionTxHash:null,createdAt:now,resolvedAt:null});
    for(const arb of ['arb1','arb2'])await store.setArbitrationMember(arb,true,'admin',now,1);
    await store.startDisputeReview('d','admin',now);
  }
  async function pool(budget=10_000_000){return (await invoke('admin','/api/arbitration/reward-pools','POST',{startsAt:now,endsAt:'2026-10-05T10:00:00.000Z',budgetMicros:budget,feeMicros:5_000_000})).body as ArbitrationRewardPool;}
  it('durably sends private-safe notices once under parallel drains and retries provider failures',async()=>{
    await store.updateUserPreferences('requester',{...(await store.getUserPreferences('requester')),taskUpdates:true,emailChannel:true});
    const issue=(await invoke('developer',`${base}/issues`,'POST',issueInput)).body as CollaborationIssue;
    let calls=0;let succeed=false;
    const dependencies={now:()=>new Date(currentNow),emailSender:async()=>{calls++;return {ok:succeed};}};
    await Promise.all([drainCollaborationNotifications(store,{},dependencies),drainCollaborationNotifications(store,{},dependencies)]);
    expect(calls).toBe(1);
    expect(await store.listNotifications('requester')).toHaveLength(1);
    expect(await store.listNotifications('other')).toHaveLength(0);
    expect(JSON.stringify(await store.listNotifications('requester'))).not.toContain(issue.body);
    currentNow='2026-09-05T10:06:00.000Z';succeed=true;
    await drainCollaborationNotifications(store,{},dependencies);
    await drainCollaborationNotifications(store,{},dependencies);
    expect(calls).toBe(2);expect(await store.listNotifications('requester')).toHaveLength(1);
    currentNow='2026-09-07T10:00:00.000Z';
    await drainCollaborationNotifications(store,{},dependencies);
    expect((await store.listNotifications('requester')).some(n=>n.title.includes('48 小时'))).toBe(true);
    expect((await store.listNotifications('developer')).some(n=>n.title.includes('48 小时'))).toBe(true);
  });
  it('sealed/revealed notifications never leak rating text or reach unrelated developers',async()=>{
    await invoke('developer',`${base}/reviews`,'POST',{developerId:'developer',ratings:[1,1,1,1,1],comment:'密封私有评价正文不可泄漏。'});
    const deps={now:()=>new Date(currentNow),emailSender:async()=>({ok:true})};
    await drainCollaborationNotifications(store,{},deps);
    const notes=await store.listNotifications('requester');
    expect(notes).toHaveLength(1);expect(notes[0].title).toContain('密封');
    expect(JSON.stringify(notes)).not.toContain('密封私有评价正文');
    await invoke('requester',`${base}/reviews`,'POST',{developerId:'developer',ratings:[5,5,5,5,5],comment:'任务完成情况符合约定。'});
    await drainCollaborationNotifications(store,{},deps);
    expect((await store.listNotifications('requester')).filter(n=>n.title.includes('揭示'))).toHaveLength(1);
    expect(await store.listNotifications('other')).toHaveLength(0);
  });

  it('scopes issues to a developer and leaves escrow/balances unchanged',async()=>{
    const before=await store.getEscrow('m');const result=await invoke('developer',`${base}/issues`,'POST',issueInput);const issue=result.body as CollaborationIssue;
    expect(await store.getEscrow('m')).toEqual(before);expect(await store.getDisputes('m')).toHaveLength(0);
    expect((await invoke('other',base)).body).toMatchObject({issues:[]});
    await expect(invoke('other',`${base}/issues/${issue.id}/respond`,'POST',{body:'不能跨开发者读取或回应问题。'})).rejects.toMatchObject({status:404});
    await expect(invoke('developer',`${base}/issues`,'POST',{...issueInput,stageIds:['stage3']})).rejects.toMatchObject({status:400});
    await expect(invoke('outsider',base)).rejects.toMatchObject({status:403});
    await invoke('requester',`${base}/issues/${issue.id}/respond`,'POST',{body:'请提供原始验收标准，我们会核对。',evidence:[{label:'需求',uri:'https://example.test/spec'}]});
    expect((await invoke('developer',base)).body).toMatchObject({messages:[{body:'请提供原始验收标准，我们会核对。'}]});
    await expect(invoke('requester',`${base}/issues/${issue.id}/resolve`,'POST',{body:'任务方不应直接关闭开发者提出的问题。'})).rejects.toMatchObject({status:403});
  });
  it('enforces negotiation and permits admin conversion with an auditable issue link',async()=>{
    await running();const issue=(await invoke('developer',`${base}/issues`,'POST',issueInput)).body as CollaborationIssue;
    await expect(invoke('developer',`${base}/issues/${issue.id}/escalate`,'POST')).rejects.toMatchObject({code:'NEGOTIATION_PENDING'});
    currentNow=later;await invoke('developer',`${base}/issues/${issue.id}/escalate`,'POST');
    expect((await invoke('admin','/api/collaboration/issues')).body).toHaveLength(1);
    expect((await store.getEscrow('m'))?.status).toBe('held');
    expect((await http('developer','/api/missions/m/disputes','POST',{reason:'开发者只能申请审核，不得绕过资金核验直接冻结。'})).status).toBe(403);
    const stale=(await store.collaboration.listIssues('m'))[0];
    const result=await http('admin','/api/missions/m/disputes','POST',{reason:'协商未解决，管理员根据双方材料建立正式资金案件。',issueId:issue.id,evidence:[]});
    expect(result.status,JSON.stringify(result.body)).toBe(201);
    expect((await store.getEscrow('m'))?.status).toBe('frozen');
    expect((await store.collaboration.listIssues('m'))[0].disputeId).toBe(result.body.data.id);
    expect(await store.collaboration.updateIssue({...stale,status:'resolved',resolution:'并发关闭操作不得清除资金案件链接。'},'escalated')).toBe(false);
    const otherView=await invoke('other',`/api/disputes/${result.body.data.id}/collaboration`);
    expect(otherView.body).toMatchObject({linkedIssues:[],messages:[]});
    expect((await invoke('developer',`/api/disputes/${result.body.data.id}/collaboration`)).body).toMatchObject({linkedIssues:[{id:issue.id}]});
    await expect(invoke('admin',`${base}/issues/${issue.id}/resolve`,'POST',{body:'资金案件尚未结案，不能提前关闭这条申请。'})).rejects.toMatchObject({code:'FUNDS_CASE_PENDING'});

  });
  it('keeps sealed reviews out of every legacy read and score surface, then publishes once',async()=>{
    await store.recomputeAgentQuality('a1',now);
    const beforeSnapshots=await store.listAgentReputationSnapshots('a1');
    const first=await http('requester',`${base}/reviews`,'POST',reviewInput);expect(first.status,JSON.stringify(first.body)).toBe(201);
    for(const name of ['developer','other','admin']){const data=(await invoke(name,base)).body as CollaborationView;expect(data.reviews).toHaveLength(0);}
    expect((await http('developer','/api/missions/m/stages/stage1/feedback')).body.data).toBeNull();
    const publicBefore=await http('requester','/api/agents/a1/quality');expect(publicBefore.body.data.bilateralReviews).toEqual([]);
    expect((await http('developer','/api/developer/agents/a1/quality')).body.data.feedback).toEqual([]);
    expect(await store.listAgentMetricEvents('a1')).toHaveLength(0);expect(await store.listAgentReputationSnapshots('a1')).toEqual(beforeSnapshots);
    expect((await http('requester','/api/missions/m/stages/stage1/feedback','PUT',{deliveryQuality:1})).status).toBe(409);
    await invoke('developer',`${base}/reviews`,'POST',{...reviewInput,ratings:[4,4,4,4,4],comment:'合作情况符合约定，建议下次提前整理好资料。'});
    await Promise.all([publishBilateralReviews(store,now),publishBilateralReviews(store,now)]);
    expect((await invoke('developer',base)).body).toMatchObject({reviews:[{publishedAt:now},{publishedAt:now}],requesterReputation:{count:1,score:4}});
    expect((await store.listAgentMetricEvents('a1')).filter(e=>e.type==='feedback_received')).toHaveLength(1);
    expect((await store.listAgentMetricEvents('a2')).filter(e=>e.type==='feedback_received')).toHaveLength(1);
    expect((await store.listAgentMetricEvents('a3')).filter(e=>e.type==='feedback_received')).toHaveLength(0);
    expect((await http('requester','/api/agents/a1/quality')).body.data.bilateralReviews).toHaveLength(1);
    await expect(invoke('developer',`${base}/reviews`,'POST',reviewInput)).rejects.toMatchObject({code:'REVIEW_ALREADY_SUBMITTED'});
    const review=((await invoke('developer',base)).body as CollaborationView).reviews.find(r=>r.direction==='requester')!;
    await invoke('developer',`${base}/reviews/${review.id}/respond`,'POST',{body:'开发者公开回应：交付证据已经补充，感谢客观反馈。'});
    expect((await http('requester','/api/agents/a1/quality')).body.data.bilateralReviews[0].responses).toEqual([{body:'开发者公开回应：交付证据已经补充，感谢客观反馈。',role:'developer',createdAt:now}]);

  });
  it('reveals at exactly seven days without requiring the other party and closes submissions',async()=>{
    await invoke('requester',`${base}/reviews`,'POST',reviewInput);
    currentNow='2026-09-12T09:59:59.999Z';expect(((await invoke('developer',base)).body as CollaborationView).reviews).toHaveLength(0);
    currentNow=deadline;expect(((await invoke('developer',base)).body as CollaborationView).reviews).toHaveLength(1);
    await expect(invoke('developer',`${base}/reviews`,'POST',reviewInput)).rejects.toMatchObject({code:'REVIEW_WINDOW_CLOSED'});
  });
  it('retains cancelled/refunded experiences without altering reputation',async()=>{
    if(store instanceof MemoryPlatformStore){store.missions.get('m')!.status='cancelled';store.escrows.get('m')!.status='refunded';}else db.db.exec("UPDATE missions SET cancelled_at='2026-09-05T10:00:00.000Z' WHERE id='m'; UPDATE escrows SET status='refunded' WHERE mission_id='m'");
    await invoke('requester',`${base}/reviews`,'POST',reviewInput);await invoke('developer',`${base}/reviews`,'POST',reviewInput);
    const data=(await invoke('requester',base)).body as CollaborationView;expect(data.reviews.every(r=>!r.eligible)).toBe(true);expect(data.requesterReputation.count).toBe(0);expect(await store.listAgentMetricEvents('a1')).toHaveLength(0);
  });
  it('rejects credentials and malicious evidence URLs at the HTTP boundary',async()=>{
    expect((await http('developer',`${base}/issues`,'POST',{...issueInput,body:'Bearer sensitive-token-value-must-not-be-public'})).status).toBe(400);
    const issue=(await invoke('developer',`${base}/issues`,'POST',issueInput)).body as CollaborationIssue;
    expect((await http('requester',`${base}/issues/${issue.id}/respond`,'POST',{body:'这条证据不应被接受。',evidence:[{label:'unsafe',uri:'javascript:alert(1)'}]})).status).toBe(400);
  });
  it('reserves a bounded pool atomically and rejects overlapping policies',async()=>{
    await arbitration();const p=await pool(5_000_000);
    const results=await Promise.allSettled(['arb1','arb2'].map(user=>invoke(user,'/api/disputes/d/reward-work/accept','POST',{poolId:p.id})));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await store.collaboration.listPools())[0].reservedMicros).toBe(5_000_000);
    await expect(pool()).rejects.toMatchObject({code:'POOL_WINDOW_OVERLAP'});
    await expect(invoke('requester','/api/disputes/d/reward-work/accept','POST',{poolId:p.id})).rejects.toMatchObject({code:'WORK_NOT_AVAILABLE'});
  });
  it('allows recusal before voting, releasing the reserved fee without a rejection',async()=>{
    await arbitration();const p=await pool(5_000_000);
    const work=(await invoke('arb1','/api/disputes/d/reward-work/accept','POST',{poolId:p.id})).body as ArbitrationWork;
    await invoke('arb1','/api/disputes/d/reward-work/withdraw','POST',{workId:work.id,reason:'发现我与开发者曾经合作，为避免利益冲突主动回避。'});
    expect((await store.collaboration.listPools())[0].reservedMicros).toBe(0);
    expect((await store.collaboration.listWork('d'))[0].status).toBe('withdrawn');
    expect((await store.getDisputeGovernance('d','arb1',now))?.currentUser.canVote).toBe(false);
    expect((await store.castDisputeVote('d','arb1','abstain','已回避委员不得重新参与本轮投票。',now)).state).toBe('not_eligible');
    await invoke('arb2','/api/disputes/d/reward-work/accept','POST',{poolId:p.id});
    expect((await store.collaboration.listPools())[0].reservedMicros).toBe(5_000_000);
  });
  it('excludes the case-opening administrator from approving fixed compensation',async()=>{
    await arbitration('admin');const p=await pool();
    const work=(await invoke('arb1','/api/disputes/d/reward-work/accept','POST',{poolId:p.id})).body as ArbitrationWork;
    await store.castDisputeVote('d','arb1','oppose_refund','依据原始交付标准与交付证据，我认为应继续验收。',now);
    await invoke('arb1','/api/disputes/d/reward-work/submit','POST',{workId:work.id,report:'这里明确记录我审阅的材料、可复现的交付结果以及裁决依据。'.repeat(5),evidence:['案件事实与诉求']});
    await expect(invoke('admin','/api/disputes/d/reward-work/approve','POST',{workId:work.id,reason:'案件发起人不能兼任本案的报酬审核人。'})).rejects.toMatchObject({status:403});
    await invoke('admin2','/api/disputes/d/reward-work/approve','POST',{workId:work.id,reason:'独立审核了证据引用和说明完整性，确认履职完成。'});
  });
  it('does not release a reservation when a vote was committed after a stale read',async()=>{
    await arbitration();const p=await pool();const work=(await invoke('arb1','/api/disputes/d/reward-work/accept','POST',{poolId:p.id})).body as ArbitrationWork;
    await store.castDisputeVote('d','arb1','abstain','已经提交不可修改的投票，不能再回避领取记录。',now);
    expect(await store.collaboration.updateWork({...work,status:'withdrawn',reviewReason:'该更新携带的是投票前读取的旧履职状态。'},'accepted')).toBe(false);
    expect((await store.collaboration.listPools())[0].reservedMicros).toBe(5_000_000);
  });
  it('redacts reports that may quote another developer’s private linked issue',async()=>{
    const issue=(await invoke('developer',`${base}/issues`,'POST',issueInput)).body as CollaborationIssue;
    await invoke('admin',`${base}/issues/${issue.id}/escalate`,'POST');await arbitration('requester',issue.id);
    const p=await pool();const work=(await invoke('arb1','/api/disputes/d/reward-work/accept','POST',{poolId:p.id})).body as ArbitrationWork;
    await store.castDisputeVote('d','arb1','oppose_refund','核对双方的任务材料后给出判断。',now);
    const report='引用开发者私有协调记录，具体资料只应由相关双方和委员会读取。'.repeat(5);
    await invoke('arb1','/api/disputes/d/reward-work/submit','POST',{workId:work.id,report,evidence:[issue.id]});
    const other=(await invoke('other','/api/disputes/d/collaboration')).body as {work:ArbitrationWork[]};
    expect(other.work[0]).toMatchObject({report:'',evidence:[],reviewReason:null,feeMicros:5_000_000});
    const owner=(await invoke('developer','/api/disputes/d/collaboration')).body as {work:ArbitrationWork[]};expect(owner.work[0].report).toBe(report);
  });
  it('pays reviewed work before execution, equally for opposing votes, without duplicate epochs',async()=>{
    await arbitration();const p=await pool();const work:ArbitrationWork[]=[];
    for(const name of ['arb1','arb2'])work.push((await invoke(name,'/api/disputes/d/reward-work/accept','POST',{poolId:p.id})).body as ArbitrationWork);
    for(const [index,name] of ['arb1','arb2'].entries()){
      await store.castDisputeVote('d',name,index===0?'support_refund':'oppose_refund','已经查阅交付证据并与原始验收要求逐项核对。',now);
      await invoke(name,'/api/disputes/d/reward-work/submit','POST',{workId:work[index].id,report:'核对原始需求与交付证据后，需要区分原范围交付与新增要求。'.repeat(5),evidence:['https://example.test/evidence']});
      await invoke('admin','/api/disputes/d/reward-work/approve','POST',{workId:work[index].id,reason:'已核对证据引用和审案说明的完整性，与投票方向无关。'});
    }
    await syncArbitrationRewards(store,now);await syncArbitrationRewards(store,now);
    expect((await store.getEscrow('m'))?.status).toBe('frozen');
    const epoch:RewardEpoch={id:'ep1',epochNumber:1,status:'draft',startsAt:'2026-09-06T10:00:00.000Z',endsAt:later,claimEndsAt:deadline,totalRewardUnits:'10000000000000000000',accountScoreCap:100,formulaVersion:'agentmesh-yd-v1',rules:{},chainId:11155111,distributorAddress:'0x'+'1'.repeat(40),merkleRoot:null,manifestHash:null,publishTxHash:null,computedAt:null,publishedAt:null,createdBy:'admin',createdAt:now,updatedAt:now};
    await store.createRewardEpoch(epoch);const computed=await store.computeRewardEpoch('ep1',later,'admin');
    expect(computed.state).toBe('computed');const allocations=await store.listRewardAllocations('ep1');expect(allocations.map(a=>a.amountUnits)).toEqual(['5000000000000000000','5000000000000000000']);
    await store.createRewardEpoch({...epoch,id:'ep2',epochNumber:2});expect((await store.computeRewardEpoch('ep2',later,'admin')).state).toBe('no_eligible_accounts');
    const dossier=await invoke('developer','/api/disputes/d/collaboration');expect(dossier.body).toMatchObject({work:[{status:'approved'},{status:'approved'}]});
  });
});
