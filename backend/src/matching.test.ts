import { describe, expect, it } from 'vitest';
import type { Agent, Mission, WorkflowStage } from './contracts';
import type { MatchingData, MatchOption, CapabilityEvidence } from '../../shared/matching';
import {rankEvidenceCandidates,taskProfile,applySemanticAssessment} from './matching';
import {allocateWorkflow} from './workflowAllocator';
const mission = {
  id: 'TASK-price', requesterId: 'requester', title: 'Pricing', description: 'A priced task', category: '软件开发', tags: [],
  budget: 100, paymentMethod: 'web2_balance', deadline: '2026-10-01', priority: 'high', expertise: 'principal',
  yieldEnabled: false, status: 'draft', progress: 0, currentStage: '', team: [], compiledSpec: null, workflowVersion: 1,
  workflowViewport: { x: 0, y: 0, zoom: 1 }, reviewDueAt: null, pausedAt: null, pausedBy: null, pauseReason: null,
  pauseMode: null, schedulerRevision: 0, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z',
} satisfies Mission;

const stage = {
  id: 'STAGE-price', missionId: mission.id, position: 1, nodeType: 'task', positionX: 0, positionY: 0, progress: 0,
  name: '实现', purpose: '实现功能', category: '软件开发', budget: 50, status: 'queued', agentId: 'agent-price',
  input: { executionMode: 'implement' }, output: null, attemptNo: 1, attemptCreatedAt: mission.createdAt,
  createdAt: mission.createdAt, updatedAt: mission.updatedAt,
} satisfies WorkflowStage;

const agent = {
  id: 'agent-price', ownerId: 'developer', name: 'Builder', category: '软件开发', summary: 'Builds software reliably.', tags: [],
  endpoint: 'https://agent.example.test', authType: 'none', inputSchema: {}, outputSchema: {}, price: 20, priceVersion: 3,
  wallet: '0x73325bd3e93d9a12e5d2d5219424daf0e55f856d', status: 'active', version: 'v1', trustScore: 9,
  successRate: 95, responseTime: '1s', jobs: 0, volume: 0, author: 'Developer', official: false,
  createdAt: mission.createdAt, updatedAt: mission.updatedAt,
} satisfies Agent;


const now='2026-09-04T00:00:00.000Z';
const active={...agent,quality:{wouldBeEligible:true}} as Agent;
const evidence:CapabilityEvidence={id:'e1',agentId:agent.id,agentVersion:agent.version,family:'软件开发',mode:'implement',taskDescription:'Implement tested software with usable artifacts and acceptance checks.',capabilities:['react'],tools:['browser'],inputTypes:['json.v1'],outputTypes:['html.v1'],durationSeconds:360,quality:90,sourceId:'trial-1',verifiedBy:'admin',verifiedAt:now,expiresAt:'2026-10-01T00:00:00.000Z'};
const data:MatchingData={profiles:[{agentId:agent.id,agentVersion:agent.version,revision:1,maxConcurrency:1,pool:agent.id,poolConcurrency:1,updatedAt:now}],evidence:[evidence],outcomes:[],leases:[]};
const rank=(task:WorkflowStage=stage, context:MatchingData=data, agents:Agent[]=[active])=>rankEvidenceCandidates(mission,task,agents,context,new Map(),now);
describe('evidence matching',()=>{
  it('uses node evidence and never promotes self-declared tags to verified ability',()=>{
    expect(rank().options).toHaveLength(1);
    expect(rank(stage,{...data,evidence:[]},[{...active,tags:['软件开发','react'],trustScore:10}]).options).toHaveLength(0);
    expect(rank({...stage,category:'安全审查'}).options).toHaveLength(0);
  });
  it.each(['version','mode','expiry','shadow','capacity','contracts','tools'])('rejects invalid evidence or constraints: %s',(kind)=>{
    const context=structuredClone(data);let task:WorkflowStage=structuredClone(stage);let a=structuredClone(active);
    if(kind==='version') context.evidence[0].agentVersion='old';
    if(kind==='mode') task.input.executionMode='review';
    if(kind==='expiry') context.evidence[0].expiresAt=now;
    if(kind==='shadow') a.quality!.wouldBeEligible=false;
    if(kind==='capacity') context.profiles=[];
    if(kind==='contracts') task.input.inputType='csv.v2';
    if(kind==='tools') task.input.requiredTools=['private-db'];
    expect(rank(task,context,[a]).options).toHaveLength(0);
  });
  it('requires declared capabilities consistently with invitation validation',()=>{
    expect(rank({...stage,input:{...stage.input,requiredCapabilities:['react']}}).options).toHaveLength(0);
    expect(rank({...stage,input:{...stage.input,requiredCapabilities:['react']}},data,[{...active,tags:['react']}]).options).toHaveLength(1);
  });
  it('does not treat global success rate or endpoint latency as node evidence',()=>{
    const result=rank(stage,data,[{...active,successRate:100,responseTime:'1ms'}]).options[0];
    expect(result.sampleCount).toBe(0);expect(result.durationSeconds).toBe(360);expect(result.uncertainty).toBe(0.8);
  });
  it('blocks other accepted commitments and unresolved executions',()=>{
    expect(rank(stage,{...data,commitments:[{missionId:'other',stageId:'s',agentId:agent.id}]}).options).toHaveLength(0);
    expect(rank(stage,{...data,leases:[{runId:'r',agentId:agent.id,agentVersion:agent.version,missionId:'other',stageId:'s',pool:`developer:${agent.id}`,createdAt:now,expiresAt:now,status:'quarantined'}]}).options).toHaveLength(0);
  });
  it('validates semantic citations and keeps model results outside eligibility',()=>{
    const rows={'s':rank().options};const before=rows.s[0].score;
    expect(applySemanticAssessment(rows,JSON.stringify({assessments:[{stageId:'s',agentId:agent.id,fit:1,evidenceIds:['invented']}]}))).toBe(0);
    expect(rows.s[0].score).toBe(before);
    expect(applySemanticAssessment(rows,JSON.stringify({assessments:[{stageId:'s',agentId:agent.id,fit:1,evidenceIds:['e1']}]}))).toBe(1);
    expect(rows.s[0].score).toBeGreaterThan(before);
  });
});
const option=(agentId:string,durationSeconds:number,utility=0.8):MatchOption=>({agentId,ownerId:agentId,utility,score:utility*100,quote:40,durationSeconds,durationSource:'reviewed-estimate',evidenceIds:['e'],sampleCount:10,uncertainty:0.4,reasons:['verified'],pool:agentId,concurrency:1,poolConcurrency:1});
const s1={...stage,id:'s1',agentId:null};const s2={...stage,id:'s2',agentId:null};
const input={mission:{...mission,deadline:'2026-09-04T00:10:00.000Z'},stages:[s1,s2],edges:[],candidates:{s1:[option('A',360)],s2:[option('A',360),option('B',480,0.75)]},profiles:{s1:taskProfile(s1),s2:taskProfile(s2)},excluded:{},snapshotHash:'hash',now};
describe('whole workflow allocation',()=>{
  it('chooses a feasible team instead of independently selecting the same overloaded winner',()=>{
    const plan=allocateWorkflow(input);expect(plan.status).toBe('ready');
    expect(plan.assignments.find((row)=>row.stageId==='s1')?.agentId).toBe('A');
    expect(plan.assignments.find((row)=>row.stageId==='s2')?.agentId).toBe('B');
    expect(plan.makespanSeconds).toBe(480);expect(plan.totalQuote).toBe(80);
  });
  it('respects shared pools, locks, budget and deadlines without relaxing constraints',()=>{
    const shared={...input,candidates:{s1:[option('A',360)],s2:[{...option('B',480),pool:'A'}]}};
    expect(allocateWorkflow(shared).status).toBe('needs_review');
    expect(allocateWorkflow({...input,lockedAssignments:{s2:'A'}}).status).toBe('needs_review');
    expect(allocateWorkflow({...input,mission:{...input.mission,budget:60}}).status).toBe('needs_review');
  });
  it('uses precedence and independent review ownership',()=>{
    const edges=[{id:'edge',missionId:mission.id,sourceStageId:'s1',targetStageId:'s2',createdAt:now}];
    const plan=allocateWorkflow({...input,mission:{...mission,deadline:'2026-09-04T01:00:00Z'},edges,profiles:{...input.profiles,s2:{...input.profiles.s2,independentReview:true}}});
    expect(plan.assignments.find((row)=>row.stageId==='s2')?.agentId).toBe('B');
    expect(plan.assignments.find((row)=>row.stageId==='s2')?.startSeconds).toBe(360);
  });
  it('replays deterministically and exposes infeasible candidate sets',()=>{
    expect(allocateWorkflow(input).assignments).toEqual(allocateWorkflow(input).assignments);
    expect(allocateWorkflow({...input,candidates:{s1:[],s2:[]}})).toMatchObject({status:'needs_review',assignments:[],makespanSeconds:null});
  });
});
