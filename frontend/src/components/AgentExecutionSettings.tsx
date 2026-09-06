import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Agent } from '../types/domain';

export function AgentExecutionSettings({agent,admin}:{agent:Agent;admin:boolean}) {
  const [capacity,setCapacity]=useState(1), [poolCapacity,setPoolCapacity]=useState(1);
  const [pool,setPool]=useState(agent.id);
  const [data,setData]=useState<Awaited<ReturnType<typeof api.getExecutionProfile>>|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [evidence,setEvidence]=useState('');
  const reload=async()=>{const result=await api.getExecutionProfile(agent.id);setData(result); if(result.profile){setCapacity(result.profile.maxConcurrency);setPoolCapacity(result.profile.poolConcurrency);setPool(result.profile.pool);}};
  useEffect(()=>{void reload().catch(()=>setMessage('执行档案尚未就绪，请确认后端迁移已发布。'));},[agent.id]);
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();await reload();setMessage('已保存');}catch(error){setMessage(error instanceof Error?error.message:'保存失败');}finally{setBusy(false);}};
  return <section className="panel p-5" aria-label="执行容量与能力证据"><h2 className="font-semibold">执行容量与能力证据</h2><p className="mt-2 text-xs text-muted">填写真实并发上限。多个 Agent 共用执行服务时，使用相同资源池名；实际并发按池内最小声明上限控制。</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><label><span className="field-label">Agent 并发</span><input className="field" type="number" min="1" max="64" value={capacity} onChange={(event)=>setCapacity(Number(event.target.value))}/></label><label><span className="field-label">共享资源池</span><input className="field" value={pool} onChange={(event)=>setPool(event.target.value)}/></label><label><span className="field-label">资源池并发</span><input className="field" type="number" min="1" max="64" value={poolCapacity} onChange={(event)=>setPoolCapacity(Number(event.target.value))}/></label></div>
    <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void run(()=>api.saveExecutionProfile(agent.id,{maxConcurrency:capacity,pool,poolConcurrency:poolCapacity}))}>保存执行容量</button>
    <p className="mt-3 text-xs">已登记能力证据 {data?.evidence.length??0} 条。由平台审核员核对当前版本 Trial 与任务范围后登记；开发者标签不等于验证结果。</p>
    {data?.leases.map((lease)=><div className="mt-3 rounded-lg border border-line p-3 text-xs" key={lease.runId}><p>{lease.stageId} · {lease.status==='quarantined'?'远端状态待确认':'占用中'}</p>{lease.status==='quarantined'||Date.parse(lease.expiresAt)<=Date.now()?<button type="button" className="btn-secondary mt-2" disabled={busy} onClick={()=>{if(window.confirm('请先在你的 Agent 服务中确认该运行已停止。确认后平台将允许新任务占用此容量。')) void run(()=>api.releaseCapacity(agent.id,lease.runId));}}>确认远端已停止并释放</button>:null}</div>)}
    {admin?<details className="mt-4"><summary className="cursor-pointer text-xs font-semibold">审核登记能力证据</summary><p className="mt-2 text-xs text-muted">仅登记已人工核对的能力范围，sourceId 引用当前版本已通过的 Trial。</p><textarea className="field mt-2 min-h-40 font-mono text-xs" aria-label="能力证据 JSON" value={evidence} onChange={(event)=>setEvidence(event.target.value)} placeholder={'{"sourceId":"Trial ID","family":"前端工程","mode":"implement","taskDescription":"已验证的任务目标与交付范围，至少二十个字符","capabilities":["react"],"tools":[],"inputTypes":[],"outputTypes":[],"durationSeconds":600,"quality":80}'}/><button type="button" className="btn-secondary mt-2" disabled={busy} onClick={()=>void run(()=>api.attestMatchingEvidence(agent.id,JSON.parse(evidence)))}>登记审核证据</button></details>:null}
    {message?<p className="mt-3 text-xs" role="status">{message}</p>:null}
  </section>;
}
