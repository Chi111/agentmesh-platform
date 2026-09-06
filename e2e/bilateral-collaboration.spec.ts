import { expect, test } from '@playwright/test';
import type { CollaborationView } from '../shared/collaboration';
for (const width of [1280,390]) test(`developer can raise issues and submit a sealed review at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.addInitScript(()=>window.sessionStorage.setItem('agentmesh:e2e-auth','true'));
  const profile={id:'developer',role:'developer',displayName:'测试开发者',email:'developer@example.test',walletAddress:null};
  const mission={id:'m',requesterId:'requester',title:'双边协作验收任务',description:'测试任务',category:'软件开发',tags:[],budget:10,paymentMethod:'web2_balance',deadline:'2026-12-31',status:'completed',progress:100,currentStage:'已结算',team:[],createdAt:'2026-09-05T10:00:00.000Z'};
  const view:CollaborationView={issues:[],messages:[],reviews:[],pairs:[{developerId:'developer',name:'测试开发者',stageIds:['s'],stageNames:['交付节点'],submitted:false,counterpartSubmitted:false}],reviewEndsAt:'2099-09-12T10:00:00.000Z',canReview:true,role:'developer',requesterReputation:{count:0,score:null,confidence:'low'}};
  const mutations:Array<{path:string;body:Record<string,unknown>}>=[];
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;const fulfill=(data:unknown,status=200)=>route.fulfill({status,json:{data}});
    if(path==='/api/agents'||path==='/api/disputes')return fulfill([]);
    if(path==='/api/bootstrap')return fulfill({profile,missions:[mission],agents:[],notifications:[],developer:{jobs:1,activeAgents:0,volume:0,pending:0}});
    if(path==='/api/missions/m')return fulfill({mission,stages:[],edges:[],offers:[],events:[],deliverables:[],escrow:{status:'released'},disputes:[]});
    if(path==='/api/missions/m/collaboration')return fulfill(view);
    if(req.method()==='POST'){
      const body=req.postDataJSON();mutations.push({path,body});
      if(path.endsWith('/issues')){view.issues.push({id:'issue1',missionId:'m',developerId:'developer',authorId:'developer',stageIds:['s'],category:body.category,title:body.title,body:body.body,status:'open',createdAt:'2026-09-05T10:00:00.000Z',updatedAt:'2026-09-05T10:00:00.000Z',dueAt:'2099-09-07T10:00:00.000Z',resolution:null,disputeId:null});return fulfill(view.issues[0],201);}
      if(path.endsWith('/reviews')){view.pairs[0].submitted=true;view.reviews.push({id:'r1',missionId:'m',developerId:'developer',authorId:'developer',direction:'developer',ratings:body.ratings,comment:body.comment,createdAt:'2026-09-05T10:00:00.000Z',revealAt:view.reviewEndsAt!,publishedAt:null,stageIds:['s'],eligible:true,caseStatus:'completed'});return fulfill(view,201);}
    }
    return route.fulfill({status:404,json:{error:{message:'Unexpected test route'}}});
  });
  await page.goto('/#/agents');await page.evaluate(async({profile,mission})=>{
    const [{setApiTokenProvider},{useAppStore}]=await Promise.all([import('/src/services/api.ts'),import('/src/store/useAppStore.ts')]);
    setApiTokenProvider(async()=> 'test-collaboration-token');useAppStore.setState({profile,role:'developer',missions:[mission],agents:[]});
  },{profile,mission});await page.evaluate(()=>{window.location.hash='/developer/jobs';});
  await page.getByLabel('开发者反馈 / 合作评价').selectOption('m');
  await expect(page.getByRole('heading',{name:'双边协作与反馈'})).toBeVisible();
  await page.getByText('提交问题 / 申请评价复核',{exact:true}).click();
  await page.getByLabel('问题类型').selectOption('scope_change');await page.getByLabel('标题',{exact:true}).fill('原约定之外的新增需求');await page.getByLabel('事实、涉及节点和期望处理方式').fill('交付已完成，希望先确认新增需求的范围和验收标准。');
  await page.getByRole('button',{name:'提交问题',exact:true}).click();await expect(page.getByRole('heading',{name:'原约定之外的新增需求'})).toBeVisible();
  await expect(page.getByRole('button',{name:'申请协调 / 仲裁审核',exact:true})).toBeDisabled();
  await page.getByLabel('需求清晰度').selectOption('4');await page.getByLabel('合作评价（公开后可见）').fill('本次合作按原约定完成，建议今后尽早确认资料和验收要求。');await page.getByRole('button',{name:'密封提交评价'}).click();
  await expect(page.getByText('你的评价已提交。等待对方提交或窗口到期。')).toBeVisible();await expect(page.getByText(/仅你可见 · 密封中/)).toBeVisible();await expect(page.getByRole('button',{name:'密封提交评价'})).toHaveCount(0);
  expect(mutations.map(x=>x.path)).toEqual(['/api/missions/m/collaboration/issues','/api/missions/m/collaboration/reviews']);
  expect(mutations[0].body.stageIds).toEqual(['s']);expect(mutations[1].body.ratings).toEqual([4,5,5,5,5]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/agentmesh-bilateral-${width}.png`,fullPage:true});
});

test('administrator can configure a capped arbitration fee without moving funds',async({page})=>{
  await page.addInitScript(()=>window.sessionStorage.setItem('agentmesh:e2e-auth','true'));
  const profile={id:'admin',role:'admin',displayName:'管理员',email:'admin@example.test',walletAddress:null};
  const pools:unknown[]=[];const mutations:string[]=[];
  await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;const fulfill=(data:unknown)=>route.fulfill({json:{data}});
    if(path==='/api/agents'||path==='/api/disputes'||path==='/api/collaboration/issues')return fulfill([]);
    if(path==='/api/arbitration/reward-pools'){if(route.request().method()==='POST'){mutations.push(path);const input=route.request().postDataJSON();pools.push({...input,id:'pool',reservedMicros:0});return fulfill(pools[0]);}return fulfill(pools);}
    return fulfill({});});
  await page.goto('/#/agents');await page.evaluate(async profile=>{const [{setApiTokenProvider},{useAppStore}]=await Promise.all([import('/src/services/api.ts'),import('/src/store/useAppStore.ts')]);setApiTokenProvider(async()=> 'test-admin-token');useAppStore.setState({profile,role:'requester',missions:[],agents:[],disputes:[]});},profile);
  await page.evaluate(()=>{window.location.hash='/arbitration';});await page.getByText('配置固定审案报酬',{exact:true}).click();
  await page.getByLabel('开始日期（UTC）').fill('2099-09-01');await page.getByLabel('结束日期（不含，UTC）').fill('2099-10-01');await page.getByLabel('预算上限 PM').fill('100');await page.getByLabel('每轮审案 PM').fill('5');await page.getByRole('button',{name:'保存周期预算'}).click();
  await expect(page.getByText('2099-09-01—2099-10-01 · 每轮 5 PM · 已预留 0 / 100 PM')).toBeVisible();expect(mutations).toEqual(['/api/arbitration/reward-pools']);
});
