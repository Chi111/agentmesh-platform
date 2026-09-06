import { expect, test } from '@playwright/test';
test.use({ timezoneId:'Asia/Shanghai' });
for(const width of [1280,390]) test(`pending mission deadline edit refreshes the plan at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.addInitScript(()=>window.sessionStorage.setItem('agentmesh:e2e-auth','true'));
  const profile={id:'requester',role:'requester',displayName:'任务方',email:'requester@example.test'};
  const mission={id:'m',requesterId:'requester',title:'可改期的待接单任务',description:'任务描述',category:'研究',tags:[],budget:30,paymentMethod:'web2_balance',deadline:'2026-09-01',status:'matching',progress:0,currentStage:'等待组队',team:[],workflowVersion:1,workflowViewport:{x:0,y:0,zoom:1}};
  const writes:unknown[]=[];
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const fulfill=(data:unknown)=>route.fulfill({json:{data}});
    if(path==='/api/bootstrap')return fulfill({profile,missions:[mission],agents:[],notifications:[]});
    if(path==='/api/missions/m')return fulfill({mission,stages:[],edges:[],offers:[],events:[],deliverables:[],disputes:[],escrow:{status:'pending',amount:30,platformFeeRate:.004}});
    if(path==='/api/missions/m/deadline'){
      const body=route.request().postDataJSON();writes.push(body);mission.deadline=body.deadline;mission.workflowVersion++;return fulfill(mission);
    }
    if(path.endsWith('/match-plan'))return fulfill({status:'needs_review',assignments:[],candidates:{},warnings:['请补充节点'],workflowVersion:mission.workflowVersion});
    return fulfill([]);
  });
  await page.goto('/#/agents');
  await page.evaluate(async({profile,mission})=>{
    const [{setApiTokenProvider},{useAppStore}]=await Promise.all([import('/src/services/api.ts'),import('/src/store/useAppStore.ts')]);
    setApiTokenProvider(async()=> 'test-reschedule-token');useAppStore.setState({profile,role:'requester',missions:[mission],agents:[]});window.location.hash='#/missions/m/workflow';
  },{profile,mission});
  await page.getByRole('button',{name:'修改截止时间'}).click();
  await expect(page.getByText('改期会使旧邀请和推荐方案失效',{exact:false})).toBeVisible();
  await page.getByLabel('新的截止时间',{exact:false}).fill('2099-10-01T18:30');
  await page.getByRole('button',{name:'保存改期并重新组队'}).click();
  await expect(page.getByRole('button',{name:'保存改期并重新组队'})).toHaveCount(0);
  expect(writes).toEqual([{deadline:'2099-10-01T10:30:00.000Z',workflowVersion:1}]);
  await page.getByRole('button',{name:'修改截止时间'}).click();
  await expect(page.getByLabel('新的截止时间',{exact:false})).toHaveValue('2099-10-01T18:30');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
