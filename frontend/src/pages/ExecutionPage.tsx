import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, ExternalLink, FileCheck2, LoaderCircle, Play, RefreshCw, Send, TerminalSquare, UploadCloud } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentAvatar } from '../components/ui/AgentCard';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useMission } from '../hooks/useMission';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount } from '../utils/payments';

const stageLabels = { done: '已交付', running: '执行中', queued: '等待执行', failed: '执行失败' } as const;

export function ExecutionPage() {
  const mission = useMission();
  const missionId = mission?.id ?? '';
  const agents = useAppStore((state) => state.agents);
  const role = useAppStore((state) => state.role);
  const profile = useAppStore((state) => state.profile);
  const stages = useAppStore((state) => state.missionStages[missionId]) ?? [];
  const detail = useAppStore((state) => state.missionDetails[missionId]);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const applyMissionDetail = useAppStore((state) => state.applyMissionDetail);
  const requestAssistance = useAppStore((state) => state.requestAssistance);
  const dispatchMission = useAppStore((state) => state.dispatchMission);
  const submitDeliverable = useAppStore((state) => state.submitDeliverable);
  const submitForReview = useAppStore((state) => state.submitForReview);
  const showToast = useAppStore((state) => state.showToast);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const [busy, setBusy] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [error, setError] = useState('');
  const [delivery, setDelivery] = useState({ stageId: '', name: '', uri: '', contentHash: '', mimeType: 'application/json' });

  useEffect(() => {
    if (!missionId) return;
    let active = true;
    let fallbackTimer: number | null = null;
    const refresh = async () => {
      try {
        if (active) setRefreshing(true);
        await loadMissionDetail(missionId);
      } catch (error) {
        if (active) showToast(error instanceof Error ? error.message : '任务状态同步失败。', 'error');
      } finally {
        if (active) setRefreshing(false);
      }
    };
    void refresh();
    const stop = api.subscribeMission(missionId, (nextDetail) => {
      if (active) applyMissionDetail(nextDetail);
    }, (state) => {
      if (!active) return;
      setRealtimeState(state);
      if (state === 'fallback' && fallbackTimer === null) {
        fallbackTimer = window.setInterval(() => { void refresh(); }, 8_000);
      }
      if (state === 'live' && fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    });
    return () => {
      active = false;
      stop();
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
    };
  }, [applyMissionDetail, loadMissionDetail, missionId, showToast]);

  const events = detail?.events ?? [];
  const currentStage = stages.find((stage) => stage.status === 'running') ?? stages.find((stage) => stage.status === 'failed') ?? stages.find((stage) => stage.status === 'queued') ?? stages[stages.length - 1];
  const currentAgent = agents.find((agent) => agent.id === currentStage?.agentId);
  const evidenceCount = events.length;
  const deliverables = detail?.deliverables ?? [];
  const hasRunningStage = stages.some((stage) => stage.status === 'running');
  const failedRunnableStage = stages.find((stage, index) => stage.status === 'failed' && stages.slice(0, index).every((previous) => previous.status === 'done'));
  const hasRunnableStage = stages.some((stage, index) => (stage.status === 'queued' || stage.status === 'failed') && stages.slice(0, index).every((previous) => previous.status === 'done'));
  const allStagesDone = stages.length > 0 && stages.every((stage) => stage.status === 'done');
  const deliverableStages = stages.filter((stage) => {
    const agent = agents.find((item) => item.id === stage.agentId);
    return profile?.role === 'admin' || agent?.ownerId === profile?.id;
  });

  if (!mission) {
    return <section className="panel py-16 text-center"><p className="text-sm font-semibold">正在加载任务，或任务不存在</p><Link className="btn-secondary mt-5" to="/missions">返回任务列表</Link></section>;
  }

  const runDispatch = async () => {
    setBusy(true);
    setError('');
    try {
      await dispatchMission(mission.id);
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : '阶段派发失败。');
    } finally {
      setBusy(false);
    }
  };

  const saveDeliverable = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await submitDeliverable(mission.id, { ...delivery, stageId: delivery.stageId || undefined });
      setDeliveryOpen(false);
      setDelivery({ stageId: '', name: '', uri: '', contentHash: '', mimeType: 'application/json' });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '交付物提交失败。');
    } finally {
      setBusy(false);
    }
  };

  const sendForReview = async () => {
    setBusy(true);
    setError('');
    try {
      await submitForReview(mission.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交验收失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/missions" className="mt-1 rounded-lg p-2 text-muted transition hover:bg-white hover:text-ink" aria-label="返回任务列表"><ArrowLeft size={18} /></Link>
          <div><div className="flex flex-wrap items-center gap-2"><span className="mono-chip">{mission.id}</span><StatusBadge tone={mission.status === 'completed' ? 'success' : mission.status === 'cancelled' ? 'neutral' : mission.status === 'review' ? 'warning' : 'info'}>{mission.status === 'completed' ? '已完成' : mission.status === 'cancelled' ? '已退款终止' : mission.status === 'review' ? '待验收' : '执行中'}</StatusBadge>{refreshing ? <span className="inline-flex items-center gap-1 text-[10px] text-muted"><LoaderCircle size={11} className="animate-spin" />同步中</span> : null}</div><h1 className="mt-2 text-2xl font-semibold tracking-tight">{mission.title}</h1><p className="mt-1 text-sm text-muted">{mission.currentStage}</p></div>
        </div>
        <div className="flex flex-wrap gap-3">
          {role === 'requester' ? <button type="button" className="btn-primary" onClick={() => void runDispatch()} disabled={busy || mission.status !== 'running' || !hasRunnableStage}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}{hasRunningStage ? '等待 Agent 回调' : failedRunnableStage ? '重试失败阶段' : '派发下一阶段'}</button> : <button type="button" className="btn-primary" onClick={() => setDeliveryOpen(true)} disabled={mission.status === 'completed' || mission.status === 'cancelled'}><UploadCloud size={16} />提交交付物</button>}
          <button type="button" className="btn-secondary" onClick={() => void requestAssistance(mission.id)}><Bot size={16} />申请人工协助</button>
        </div>
      </header>

      {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}

      <section className="panel p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_repeat(3,150px)] lg:items-center">
          <div><div className="flex items-center justify-between"><h2 className="font-semibold">Mission Status</h2><span className="font-mono text-2xl font-semibold text-cyan">{mission.progress}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-canvas"><span className="block h-full rounded-full bg-cyan" style={{ width: `${mission.progress}%` }} /></div></div>
          <div><p className="text-xs text-muted">工作流阶段</p><p className="mt-1 font-mono text-lg font-semibold">{stages.length}</p></div>
          <div><p className="text-xs text-muted">证据事件</p><p className="mt-1 font-mono text-lg font-semibold">{evidenceCount}</p></div>
          <div><p className="text-xs text-muted">托管账本</p><p className="mt-1 font-mono text-lg font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</p></div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="mesh-grid min-h-[570px] rounded-2xl border border-white/10 bg-ink p-5 text-white md:p-7">
          <div className="flex items-center justify-between border-b border-white/10 pb-4"><div className="flex items-center gap-2"><RefreshCw size={17} className={`text-cyan ${refreshing || realtimeState === 'connecting' ? 'animate-spin' : ''}`} /><h2 className="font-semibold">Live Agent Mesh</h2></div><span className="font-mono text-[9px] text-white/35">{realtimeState === 'live' ? 'SSE · LIVE' : realtimeState === 'fallback' ? 'POLLING FALLBACK · 8S' : 'CONNECTING STREAM'}</span></div>
          <div className="mt-12 grid gap-8 lg:grid-cols-3">
            {stages.map((stage, index) => {
              const agent = agents.find((item) => item.id === stage.agentId) ?? agents[index] ?? agents[0];
              const status = stage.status;
              if (!agent) return null;
              return (
                <article className="relative text-center" key={stage.id}>
                  {index < stages.length - 1 ? <span className="absolute left-[65%] top-10 hidden h-px w-[70%] bg-gradient-to-r from-cyan/60 to-white/10 lg:block" /> : null}
                  <div className={`relative mx-auto flex size-20 items-center justify-center rounded-full border-2 ${status === 'done' ? 'border-lime/50 bg-lime/10' : status === 'running' ? 'border-cyan bg-cyan/10 shadow-[0_0_30px_rgba(0,184,217,.18)]' : 'border-white/15 bg-white/5 opacity-55'}`}><AgentAvatar agent={agent} size="lg" /></div>
                  <h3 className="mt-4 text-sm font-semibold">{agent.name}</h3>
                  <p className={`mt-1 text-xs ${status === 'done' ? 'text-lime' : status === 'running' ? 'text-cyan' : 'text-white/35'}`}>{stageLabels[status]}</p>
                  <div className="mx-auto mt-4 max-w-[190px] rounded-lg border border-white/10 bg-white/[0.035] p-3 text-left font-mono text-[9px] leading-4 text-white/35">stage: {stage.id.slice(0, 18)}{stage.output ? '\noutput: signed' : '\noutput: pending'}</div>
                </article>
              );
            })}
          </div>
          <div className="mt-14 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-xs font-semibold"><TerminalSquare size={15} className="text-cyan" />执行证据流</div><div className="mt-3 grid gap-2 font-mono text-[10px] text-white/35 sm:grid-cols-2">{events.length ? events.slice(-4).reverse().map((event) => <span key={event.id}>{new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false })} {event.type} · {event.message}</span>) : <span>等待第一个执行事件…</span>}</div></div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-5"><h2 className="font-semibold">观测指标</h2><div className="mt-4 grid grid-cols-2 gap-3">{[['当前 Agent', currentAgent?.name ?? '等待分配'], ['当前阶段', currentStage?.name ?? '已完成'], ['任务进度', `${mission.progress}%`], ['证据事件', String(evidenceCount)]].map(([label, value]) => <div className="rounded-xl bg-canvas p-3" key={label}><p className="text-[10px] text-muted">{label}</p><p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p></div>)}</div><div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-xs"><span className="text-muted">阶段预算</span><span className="font-mono font-semibold">{formatPaymentAmount(currentStage?.budget ?? 0, mission.paymentMethod)}</span></div></section>
          <section className="panel p-5"><div className="flex items-center gap-2"><AlertTriangle size={17} className="text-warning" /><h2 className="font-semibold">System Guardrails</h2></div><div className="mt-4 rounded-xl border border-warning/20 bg-warning/[0.07] p-3"><p className="text-sm font-semibold">{realtimeState === 'live' ? '实时事件流已连接' : realtimeState === 'fallback' ? '自动降级轮询' : '正在建立事件流'}</p><p className="mt-1 text-xs text-muted">优先使用 Worker SSE；断线时自动回退 8 秒轮询，并从 D1 事件与阶段状态恢复。</p></div></section>
          <section className="panel p-5"><div className="flex items-center gap-2"><FileCheck2 size={17} /><h2 className="font-semibold">交付与证据</h2></div>{deliverables.length ? <div className="mt-4 space-y-2">{deliverables.slice(-3).reverse().map((item) => <a className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs transition hover:border-cyan/35" href={item.uri} target="_blank" rel="noreferrer" key={item.id}><span className="min-w-0"><span className="block truncate font-semibold">{item.name}</span><span className="mt-1 block truncate font-mono text-[9px] text-muted">{item.mimeType}</span></span><ExternalLink size={14} className="shrink-0 text-muted" /></a>)}</div> : <ul className="mt-4 space-y-3">{['任务包与阶段分配可追溯', 'Agent 回调使用阶段级签名', '交付物保存 URI 与内容哈希'].map((item) => <li className="flex items-center gap-2 text-xs text-muted" key={item}><CheckCircle2 size={14} className="text-lime" />{item}</li>)}</ul>}{role === 'developer' && deliverables.length ? <button type="button" className="btn-primary mt-5 w-full" onClick={() => void sendForReview()} disabled={busy || !allStagesDone || mission.status === 'review' || mission.status === 'completed'}><Send size={16} />{mission.status === 'review' ? '已提交验收' : allStagesDone ? '提交任务方验收' : '等待全部阶段完成'}</button> : <Link className="btn-primary mt-5 w-full" to={`/missions/${mission.id}/acceptance`}>查看交付与验收</Link>}</section>
        </aside>
      </div>

      <Modal open={deliveryOpen} onClose={() => setDeliveryOpen(false)} title="提交可验证交付物" description="平台保存可访问 URI、内容哈希和 MIME 类型；文件本体可位于 IPFS、对象存储或你的 HTTPS 服务。">
        <form onSubmit={saveDeliverable} className="space-y-4">
          <label><span className="field-label">所属阶段</span><select className="field" value={delivery.stageId} onChange={(event) => setDelivery((value) => ({ ...value, stageId: event.target.value }))}><option value="">任务级最终交付</option>{deliverableStages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>
          <label><span className="field-label">交付名称</span><input className="field" required minLength={2} maxLength={180} value={delivery.name} onChange={(event) => setDelivery((value) => ({ ...value, name: event.target.value }))} placeholder="例如：最终视频 / 研究报告 / 数据包" /></label>
          <label><span className="field-label">可访问 URI</span><input className="field" required minLength={8} value={delivery.uri} onChange={(event) => setDelivery((value) => ({ ...value, uri: event.target.value }))} placeholder="https://… 或 ipfs://…" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">内容哈希</span><input className="field font-mono" required minLength={8} value={delivery.contentHash} onChange={(event) => setDelivery((value) => ({ ...value, contentHash: event.target.value }))} placeholder="sha256:…" /></label><label><span className="field-label">MIME 类型</span><input className="field font-mono" required minLength={3} value={delivery.mimeType} onChange={(event) => setDelivery((value) => ({ ...value, mimeType: event.target.value }))} placeholder="video/mp4" /></label></div>
          <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-secondary" onClick={() => setDeliveryOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <UploadCloud size={16} />}写入交付证据</button></div>
          {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
        </form>
      </Modal>
    </div>
  );
}
