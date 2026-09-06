import { CollaborationPanel } from '../components/CollaborationPanel';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, ExternalLink, FileCheck2, LoaderCircle, Pause, Play, RefreshCw, RotateCcw, Send, UploadCloud, Wrench } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { WorkflowExecutionGraph } from '../components/workflow/WorkflowExecutionGraph';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { BRAND } from '../constants/brand';
import { useMission } from '../hooks/useMission';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { artifactBelongsToCurrentAttempt, isClientReadyArtifact, missionDeliverableBelongsToCurrentVersion } from '../utils/delivery';
import { formatPaymentAmount } from '../utils/payments';
import type { IpfsEvidenceContext } from '../types/domain';

function canonicalManifestJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalManifestJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalManifestJson(record[key])}`).join(',')}}`;
}

async function canonicalManifestSha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalManifestJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function ExecutionPage() {
  const { missionId: routeMissionId = '' } = useParams();
  const mission = useMission();
  const missionId = mission?.id ?? routeMissionId;
  const agents = useAppStore((state) => state.agents);
  const role = useAppStore((state) => state.role);
  const profile = useAppStore((state) => state.profile);
  const stages = useAppStore((state) => state.missionStages[missionId]) ?? [];
  const detail = useAppStore((state) => state.missionDetails[missionId]);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const applyMissionDetail = useAppStore((state) => state.applyMissionDetail);
  const requestAssistance = useAppStore((state) => state.requestAssistance);
  const dispatchMission = useAppStore((state) => state.dispatchMission);
  const pauseMission = useAppStore((state) => state.pauseMission);
  const resumeMission = useAppStore((state) => state.resumeMission);
  const createMissionChangeRequest = useAppStore((state) => state.createMissionChangeRequest);
  const decideGate = useAppStore((state) => state.decideGate);
  const retryNode = useAppStore((state) => state.retryNode);
  const submitDeliverable = useAppStore((state) => state.submitDeliverable);
  const submitForReview = useAppStore((state) => state.submitForReview);
  const showToast = useAppStore((state) => state.showToast);
  const [refreshing, setRefreshing] = useState(false);
  const [autoDispatching, setAutoDispatching] = useState(false);
  const lastAutoDispatchSignature = useRef('');
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'fallback'>('connecting');
  const [busy, setBusy] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [error, setError] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'pinme' | 'legacy'>('pinme');
  const [evidenceContext, setEvidenceContext] = useState<IpfsEvidenceContext | null>(null);
  const [delivery, setDelivery] = useState({
    stageId: '', name: '', uri: '', contentHash: '', mimeType: 'application/json',
    rootCid: '', manifestSha256: '', manifestJson: '', visibility: 'public' as 'public' | 'encrypted',
  });
  const [pauseReason, setPauseReason] = useState('');
  const [changeRequest, setChangeRequest] = useState({ targetStageIds: [] as string[], reason: '', acceptanceCriteria: '' });

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
  const runningTasks = stages.filter((stage) => stage.nodeType === 'task' && stage.status === 'running');
  const waitingGates = stages.filter((stage) => stage.nodeType === 'approval' && stage.status === 'running');
  const activeAgentNames = runningTasks.flatMap((stage) => {
    const agent = agents.find((candidate) => candidate.id === stage.agentId);
    return agent ? [agent.name] : [];
  });
  const activeAgentLabel = activeAgentNames.length === 0
    ? waitingGates.length ? '等待任务方审批' : '无节点执行中'
    : activeAgentNames.length === 1 ? activeAgentNames[0] : `${activeAgentNames.length} 个 Agent 并行`;
  const activeBudget = runningTasks.reduce((sum, stage) => sum + stage.budget, 0);
  const evidenceCount = events.length;
  const deliverables = detail?.deliverables ?? [];
  const edges = detail?.edges ?? [];
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const changeRequests = detail?.changeRequests ?? [];
  const visibleDeliverables = deliverables.filter((deliverable) => {
    if (!isClientReadyArtifact(deliverable)) return false;
    if (!deliverable.stageId) return missionDeliverableBelongsToCurrentVersion(deliverable, changeRequests);
    const stage = stageById.get(deliverable.stageId);
    return stage ? artifactBelongsToCurrentAttempt(stage, deliverable) : false;
  });
  const runnableStages = stages.filter((stage) => stage.nodeType === 'task' && stage.status === 'queued' && edges.filter((edge) => edge.targetStageId === stage.id).every((edge) => stageById.get(edge.sourceStageId)?.status === 'done'));
  const hasRunnableStage = runnableStages.length > 0;
  const recoverableOfficialStages = runningTasks.filter((stage) => {
    const assignedAgent = agents.find((candidate) => candidate.id === stage.agentId);
    const updatedAt = Date.parse(stage.updatedAt ?? stage.attemptCreatedAt ?? '');
    return assignedAgent?.official && Number.isFinite(updatedAt) && Date.now() - updatedAt >= 2 * 60_000;
  });
  const autoDispatchSignature = hasRunnableStage
    ? `ready:${runnableStages.map((stage) => `${stage.id}:${stage.attemptNo}`).sort().join(',')}`
    : recoverableOfficialStages.length
      ? `recover:${recoverableOfficialStages.map((stage) => `${stage.id}:${stage.attemptNo}`).sort().join(',')}`
      : '';
  const allStagesDone = stages.length > 0 && stages.every((stage) => stage.status === 'done');
  const deliverableStages = stages.filter((stage) => stage.nodeType === 'task').filter((stage) => {
    const agent = agents.find((item) => item.id === stage.agentId);
    return profile?.role === 'admin' || agent?.ownerId === profile?.id;
  });
  const changeTargets = stages.filter((stage) => stage.nodeType === 'task' && (stage.status === 'done' || stage.status === 'failed'));
  const isRequester = profile?.role === 'requester' && (!mission?.requesterId || mission.requesterId === profile.id);
  const isAdmin = profile?.role === 'admin';
  const canRetryFailedNode = (profile?.role === 'requester' || profile?.role === 'admin')
    && (!mission?.requesterId || mission.requesterId === profile.id);
  const canPause = mission?.status === 'running' && (isRequester || isAdmin);
  const canEscalatePause = isAdmin && mission?.status === 'paused' && mission.pauseMode === 'requester';
  const canResume = mission?.status === 'paused' && ((mission.pauseMode === 'emergency' && isAdmin) || (mission.pauseMode === 'requester' && isRequester));
  const canRequestChange = (isRequester || isAdmin)
    && (!mission?.requesterId || mission.requesterId === profile?.id)
    && (mission?.status === 'paused' || mission?.status === 'review')
    && changeTargets.length > 0;

  useEffect(() => {
    if (!mission || role !== 'requester' || mission.status !== 'running' || busy || autoDispatching || !autoDispatchSignature) return;
    if (lastAutoDispatchSignature.current === autoDispatchSignature) return;
    lastAutoDispatchSignature.current = autoDispatchSignature;
    setAutoDispatching(true);
    setError('');
    void dispatchMission(mission.id)
      .catch((reason) => setError(reason instanceof Error ? reason.message : '自动派发失败，可手动重试。'))
      .finally(() => setAutoDispatching(false));
  }, [autoDispatchSignature, autoDispatching, busy, dispatchMission, mission, role]);

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

  const runGateDecision = async (gateId: string, decision: 'approved' | 'rejected', feedback: string, reworkNodeIds: string[] = []) => {
    setBusy(true);
    setError('');
    try { await decideGate(mission.id, gateId, decision, feedback, reworkNodeIds); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '审批操作失败。'); }
    finally { setBusy(false); }
  };

  const runRetryNode = async (nodeId: string) => {
    setBusy(true);
    setError('');
    try { await retryNode(mission.id, nodeId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '节点重试失败。'); }
    finally { setBusy(false); }
  };

  const savePause = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await pauseMission(mission.id, pauseReason);
      setPauseReason('');
      setPauseOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '暂停失败。');
    } finally { setBusy(false); }
  };

  const runResume = async () => {
    setBusy(true);
    setError('');
    try { await resumeMission(mission.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '恢复失败。'); }
    finally { setBusy(false); }
  };

  const saveChangeRequest = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createMissionChangeRequest(mission.id, changeRequest);
      setChangeRequest({ targetStageIds: [], reason: '', acceptanceCriteria: '' });
      setChangeOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '返工请求创建失败。');
    } finally { setBusy(false); }
  };

  const saveDeliverable = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (deliveryMode === 'pinme') {
        const context = await api.getIpfsEvidenceContext(mission.id, delivery.stageId || undefined);
        const manifest = JSON.parse(delivery.manifestJson) as IpfsEvidenceContext['manifestTemplate'];
        const computedManifestSha256 = await canonicalManifestSha256(manifest);
        if (computedManifestSha256 !== delivery.manifestSha256.trim().toLowerCase()) {
          throw new Error('Manifest 已变化，请重新计算 canonical SHA-256 后再提交。');
        }
        await submitDeliverable(mission.id, {
          stageId: delivery.stageId || undefined,
          name: delivery.name,
          ipfsEvidence: {
            rootCid: delivery.rootCid,
            manifestSha256: delivery.manifestSha256,
            manifest,
            visibility: delivery.visibility,
            supersedesDeliverableId: context.supersedesDeliverableId,
          },
        });
      } else {
        await submitDeliverable(mission.id, {
          stageId: delivery.stageId || undefined, name: delivery.name, uri: delivery.uri,
          contentHash: delivery.contentHash, mimeType: delivery.mimeType,
        });
      }
      setDeliveryOpen(false);
      setEvidenceContext(null);
      setDelivery({
        stageId: '', name: '', uri: '', contentHash: '', mimeType: 'application/json',
        rootCid: '', manifestSha256: '', manifestJson: '', visibility: 'public',
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '交付物提交失败。');
    } finally {
      setBusy(false);
    }
  };

  const loadManifestTemplate = async () => {
    setBusy(true);
    setError('');
    try {
      const context = await api.getIpfsEvidenceContext(mission.id, delivery.stageId || undefined);
      setEvidenceContext(context);
      setDelivery((value) => ({
        ...value,
        manifestJson: JSON.stringify({ ...context.manifestTemplate, logicalName: value.name }, null, 2),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Manifest 模板加载失败。');
    } finally { setBusy(false); }
  };

  const calculateManifestHash = async () => {
    setError('');
    try {
      const manifest = JSON.parse(delivery.manifestJson) as unknown;
      const manifestSha256 = await canonicalManifestSha256(manifest);
      setDelivery((value) => ({ ...value, manifestSha256 }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Manifest JSON 无法计算 SHA-256。');
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
    <div className="space-y-5 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:gap-4 xl:space-y-0" data-testid="execution-workspace">
      <header className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/missions" className="mt-1 rounded-lg p-2 text-muted transition hover:bg-white hover:text-ink" aria-label="返回任务列表"><ArrowLeft size={18} /></Link>
          <div><div className="flex flex-wrap items-center gap-2"><span className="mono-chip">{mission.id}</span><StatusBadge tone={mission.status === 'completed' ? 'success' : mission.status === 'cancelled' ? 'neutral' : mission.status === 'review' || mission.status === 'paused' ? 'warning' : 'info'}>{mission.status === 'completed' ? '已完成' : mission.status === 'cancelled' ? '已退款终止' : mission.status === 'review' ? '待验收' : mission.status === 'paused' ? '已暂停' : '执行中'}</StatusBadge>{refreshing ? <span className="inline-flex items-center gap-1 text-[10px] text-muted"><LoaderCircle size={11} className="animate-spin" />同步中</span> : null}</div><h1 className="mt-2 text-2xl font-semibold tracking-tight">{mission.title}</h1><p className="mt-1 text-sm text-muted">{mission.currentStage}</p></div>
        </div>
        <div className="flex flex-wrap gap-3">
          {canPause || canEscalatePause ? <button type="button" className="btn-secondary" onClick={() => setPauseOpen(true)} disabled={busy}><Pause size={16} />{canEscalatePause ? '提升为紧急暂停' : isAdmin ? '紧急暂停' : '暂停任务'}</button> : null}
          {canResume ? <button type="button" className="btn-primary" onClick={() => void runResume()} disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCcw size={16} />}恢复任务</button> : null}
          {canRequestChange ? <button type="button" className="btn-secondary" onClick={() => setChangeOpen(true)} disabled={busy}><Wrench size={16} />请求返工</button> : null}
          {role === 'requester' ? <button type="button" className="btn-primary" onClick={() => void runDispatch()} disabled={busy || autoDispatching || mission.status !== 'running' || (!hasRunnableStage && recoverableOfficialStages.length === 0)}>{busy || autoDispatching ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}{autoDispatching ? '自动派发中' : recoverableOfficialStages.length && !hasRunnableStage ? '恢复官方 Agent 调度' : '派发所有就绪节点'}</button> : <Link className="btn-primary" to={`/missions/${mission.id}/acceptance`}><UploadCloud size={16} />查看自动交付</Link>}
          <button type="button" className="btn-secondary" onClick={() => void requestAssistance(mission.id)}><Bot size={16} />申请人工协助</button>
        </div>
      </header>

      {error ? <p className="shrink-0 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      {mission.status === 'paused' ? <section className="shrink-0 rounded-xl border border-warning/30 bg-warning/[0.08] p-4" aria-live="polite"><div className="flex items-start gap-3"><Pause size={18} className="mt-0.5 shrink-0 text-warning" /><div><p className="text-sm font-semibold">{mission.pauseMode === 'emergency' ? '管理员紧急暂停' : '任务方暂停'}</p><p className="mt-1 text-xs leading-5 text-muted">{mission.pauseReason} · 暂停后不会产生新派发；已在途的终态回调仍会写入证据，但不会触发后继节点。</p></div></div></section> : null}

      <section className="panel shrink-0 p-5 xl:p-4">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_repeat(3,150px)] lg:items-center">
          <div><div className="flex items-center justify-between"><h2 className="font-semibold">Mission Status</h2><span className="font-mono text-2xl font-semibold text-cyan">{mission.progress}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-canvas"><span className="block h-full rounded-full bg-cyan" style={{ width: `${mission.progress}%` }} /></div></div>
          <div><p className="text-xs text-muted">工作流阶段</p><p className="mt-1 font-mono text-lg font-semibold">{stages.length}</p></div>
          <div><p className="text-xs text-muted">证据事件</p><p className="mt-1 font-mono text-lg font-semibold">{evidenceCount}</p></div>
          <div><p className="text-xs text-muted">实际托管</p><p className="mt-1 font-mono text-lg font-semibold">{formatPaymentAmount(detail?.escrow?.amount ?? mission.budget, mission.paymentMethod)}</p></div>
        </div>
      </section>

      <div className="grid gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <WorkflowExecutionGraph stages={stages} edges={edges} agents={agents} events={events} deliverables={visibleDeliverables} transitions={detail?.transitions ?? []} canApprove={(isRequester || isAdmin) && mission.status !== 'paused'} canRework={(isRequester || isAdmin) && mission.status !== 'paused'} canRetry={canRetryFailedNode && mission.status !== 'paused'} canRecoverRunning={isAdmin && (!mission.requesterId || mission.requesterId === profile?.id) && mission.status !== 'paused'} busy={busy || mission.status === 'paused'} onApprove={(gateId, feedback) => runGateDecision(gateId, 'approved', feedback)} onReject={(gateId, feedback, reworkIds) => runGateDecision(gateId, 'rejected', feedback, reworkIds)} onRetry={runRetryNode} />

        <aside className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1 xl:[scrollbar-color:rgba(102,112,120,0.32)_transparent] xl:[scrollbar-width:thin]" aria-label="执行观测与交付信息">
          <details className="panel p-4"><summary className="cursor-pointer text-sm font-semibold">问题反馈与双边协作</summary><div className="mt-4"><CollaborationPanel missionId={mission.id}/></div></details>
          <section className="panel p-5"><h2 className="font-semibold">观测指标</h2><div className="mt-4 grid grid-cols-2 gap-3">{[['活跃执行者', activeAgentLabel], ['聚合状态', mission.currentStage], ['任务进度', `${mission.progress}%`], ['证据事件', String(evidenceCount)]].map(([label, value]) => <div className="rounded-xl bg-canvas p-3" key={label}><p className="text-[10px] text-muted">{label}</p><p className="mt-1 truncate font-mono text-sm font-semibold" title={value}>{value}</p></div>)}</div><div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-xs"><span className="text-muted">执行中预算</span><span className="font-mono font-semibold">{formatPaymentAmount(activeBudget, mission.paymentMethod)}</span></div></section>
          <section className="panel p-5"><div className="flex items-center gap-2"><AlertTriangle size={17} className="text-warning" /><h2 className="font-semibold">System Guardrails</h2></div><div className="mt-4 rounded-xl border border-warning/20 bg-warning/[0.07] p-3"><p className="text-sm font-semibold">{realtimeState === 'live' ? '实时事件流已连接' : realtimeState === 'fallback' ? '自动降级轮询' : '正在建立事件流'}</p><p className="mt-1 text-xs text-muted">优先使用 Worker SSE；断线时自动回退 8 秒轮询，并从 D1 事件与阶段状态恢复。</p></div></section>
          <section className="panel p-5"><div className="flex items-center gap-2"><RotateCcw size={17} /><h2 className="font-semibold">运行版本</h2></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-canvas p-3"><p className="text-[10px] text-muted">调度 revision</p><p className="mt-1 font-mono text-sm font-semibold">{mission.schedulerRevision ?? 0}</p></div><div className="rounded-xl bg-canvas p-3"><p className="text-[10px] text-muted">返工版本</p><p className="mt-1 font-mono text-sm font-semibold">{detail?.changeRequests?.[0]?.version ?? 0}</p></div></div>{detail?.changeRequests?.length ? <ol className="mt-3 space-y-2">{detail.changeRequests.slice(0, 3).map((item) => <li className="rounded-xl border border-line p-3 text-xs" key={item.id}><div className="flex items-center justify-between gap-2"><span className="font-semibold">返工 v{item.version}</span><span className="font-mono text-[9px] text-muted">{item.resetStageIds.length} nodes</span></div><p className="mt-1 line-clamp-2 text-muted">{item.reason}</p></li>)}</ol> : <p className="mt-3 text-xs text-muted">尚无版本化返工记录。</p>}</section>
          <section className="panel p-5"><div className="flex items-center gap-2"><FileCheck2 size={17} /><h2 className="font-semibold">交付与证据</h2></div>{visibleDeliverables.length ? <div className="mt-4 space-y-2">{visibleDeliverables.slice(-3).reverse().map((item) => <a className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs transition hover:border-cyan/35" href={item.uri} target="_blank" rel="noreferrer" key={item.id}><span className="min-w-0"><span className="block truncate font-semibold">{item.name}</span><span className="mt-1 block truncate font-mono text-[9px] text-muted">{item.ipfsEvidence ? `${BRAND.evidence.badgeLabel} · V${item.ipfsEvidence.versionNo} · ${item.ipfsEvidence.verificationStatus}` : item.mimeType}</span></span><ExternalLink size={14} className="shrink-0 text-muted" /></a>)}</div> : <ul className="mt-4 space-y-3">{['任务包与阶段分配可追溯', 'Agent 回调使用阶段级签名', `${BRAND.evidence.compactLabel} CID 可形成不可覆盖版本链`].map((item) => <li className="flex items-center gap-2 text-xs text-muted" key={item}><CheckCircle2 size={14} className="text-lime" />{item}</li>)}</ul>}{role === 'developer' && visibleDeliverables.length ? <button type="button" className="btn-primary mt-5 w-full" onClick={() => void sendForReview()} disabled={busy || !allStagesDone || mission.status !== 'running'}><Send size={16} />{mission.status === 'review' ? '已提交验收' : allStagesDone ? '提交任务方验收' : '等待全部阶段完成'}</button> : <Link className="btn-primary mt-5 w-full" to={`/missions/${mission.id}/acceptance`}>查看交付与验收</Link>}</section>
        </aside>
      </div>

      <Modal open={pauseOpen} onClose={() => setPauseOpen(false)} title={canEscalatePause ? '提升为管理员紧急暂停' : isAdmin ? '紧急暂停任务' : '暂停任务'} description={canEscalatePause ? '提升后只有管理员可恢复调度，原任务方暂停原因仍保留在审计历史中。' : '暂停以数据库调度门禁为准。已 claim 的在途执行可提交终态，但不会继续级联。'}>
        <form onSubmit={savePause} className="space-y-4">
          <label><span className="field-label">暂停原因</span><textarea className="field min-h-28 resize-y" required minLength={5} maxLength={1000} value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} placeholder="说明暂停原因，供执行历史和恢复决策审计。" /></label>
          <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setPauseOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Pause size={16} />}{canEscalatePause ? '确认提升为紧急暂停' : '确认暂停'}</button></div>
        </form>
      </Modal>

      <Modal open={changeOpen} onClose={() => setChangeOpen(false)} title="创建版本化返工" description="只创建新的执行 attempt；Agent、预算、权重与托管结算计划保持不变。">
        <form onSubmit={saveChangeRequest} className="space-y-4">
          <fieldset className="space-y-2"><legend className="field-label">返工节点</legend>{changeTargets.map((stage) => <label className="flex items-start gap-3 rounded-xl border border-line p-3" key={stage.id}><input className="mt-0.5" type="checkbox" checked={changeRequest.targetStageIds.includes(stage.id)} onChange={(event) => setChangeRequest((value) => ({ ...value, targetStageIds: event.target.checked ? [...value.targetStageIds, stage.id] : value.targetStageIds.filter((id) => id !== stage.id) }))} /><span><span className="block text-sm font-semibold">{stage.name}</span><span className="mt-1 block font-mono text-[10px] text-muted">attempt {stage.attemptNo ?? 1} · {stage.status}</span></span></label>)}</fieldset>
          <label><span className="field-label">返工原因</span><textarea className="field min-h-24 resize-y" required minLength={5} maxLength={2000} value={changeRequest.reason} onChange={(event) => setChangeRequest((value) => ({ ...value, reason: event.target.value }))} /></label>
          <label><span className="field-label">独立验收标准</span><textarea className="field min-h-24 resize-y" required minLength={5} maxLength={4000} value={changeRequest.acceptanceCriteria} onChange={(event) => setChangeRequest((value) => ({ ...value, acceptanceCriteria: event.target.value }))} /></label>
          <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setChangeOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy || changeRequest.targetStageIds.length === 0}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Wrench size={16} />}创建返工版本</button></div>
        </form>
      </Modal>

      <Modal open={deliveryOpen} onClose={() => setDeliveryOpen(false)} title="兼容交付登记" description="仅用于迁移旧版 Agent 产物。新版 Agent 应在回调中直接提交 PinMe CID 与 Manifest；平台内置 Agent 会自动生成成品并发布，不需要人工上传。">
        <form onSubmit={saveDeliverable} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-1"><button type="button" className={deliveryMode === 'pinme' ? 'rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white' : 'rounded-lg px-3 py-2 text-xs font-semibold text-muted'} onClick={() => setDeliveryMode('pinme')}>PinMe / IPFS</button><button type="button" className={deliveryMode === 'legacy' ? 'rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white' : 'rounded-lg px-3 py-2 text-xs font-semibold text-muted'} onClick={() => setDeliveryMode('legacy')}>Legacy URI</button></div>
          <label><span className="field-label">所属阶段</span><select className="field" value={delivery.stageId} onChange={(event) => setDelivery((value) => ({ ...value, stageId: event.target.value }))}><option value="">任务级最终交付</option>{deliverableStages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label>
          <label><span className="field-label">交付名称</span><input className="field" required minLength={2} maxLength={180} value={delivery.name} onChange={(event) => setDelivery((value) => ({ ...value, name: event.target.value }))} placeholder="例如：最终视频 / 研究报告 / 数据包" /></label>
          {deliveryMode === 'pinme' ? <>
            <div className="rounded-xl border border-cyan/25 bg-cyan/[0.06] p-4 text-xs leading-6 text-muted"><strong className="text-ink">旧版迁移：</strong>这里只登记已经由外部 Agent 发布完成的 CID 与 Manifest，不是正常客户交付流程。公开 IPFS 不可承诺删除；敏感内容必须先在 Agent 端加密。</div>
            <button type="button" className="btn-secondary w-full" onClick={() => void loadManifestTemplate()} disabled={busy || delivery.name.length < 2}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}加载当前验收标准与版本模板</button>
            {evidenceContext ? <div className="grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-canvas p-3"><p className="text-muted">下一版本</p><p className="mt-1 font-mono font-semibold">v{evidenceContext.nextVersionNo}</p></div><div className="rounded-xl bg-canvas p-3"><p className="text-muted">验收标准 hash</p><p className="mt-1 truncate font-mono text-[9px]" title={evidenceContext.acceptanceCriteriaSha256}>{evidenceContext.acceptanceCriteriaSha256}</p></div></div> : null}
            <label><span className="field-label">Manifest JSON</span><textarea className="field min-h-52 resize-y font-mono text-[10px] leading-5" required value={delivery.manifestJson} onChange={(event) => setDelivery((value) => ({ ...value, manifestJson: event.target.value }))} placeholder="先加载模板，再填写 files 数组并发布目录。" /></label>
            <label><span className="field-label">PinMe 返回的根 CID</span><input className="field font-mono" required minLength={10} value={delivery.rootCid} onChange={(event) => setDelivery((value) => ({ ...value, rootCid: event.target.value }))} placeholder="bafy…" /></label>
            <label><span className="field-label">Canonical Manifest SHA-256</span><div className="flex flex-col gap-2 sm:flex-row"><input className="field flex-1 font-mono" required minLength={71} value={delivery.manifestSha256} onChange={(event) => setDelivery((value) => ({ ...value, manifestSha256: event.target.value }))} placeholder="sha256:…" /><button type="button" className="btn-secondary shrink-0" disabled={!delivery.manifestJson.trim()} onClick={() => void calculateManifestHash()}>从 Manifest 计算</button></div></label>
            <fieldset><legend className="field-label">IPFS 可见性</legend><div className="grid grid-cols-2 gap-3">{(['public', 'encrypted'] as const).map((visibility) => <label className="rounded-xl border border-line p-3 text-xs" key={visibility}><input className="mr-2" type="radio" checked={delivery.visibility === visibility} onChange={() => setDelivery((value) => ({ ...value, visibility }))} />{visibility === 'public' ? '公开内容' : '上传前已加密'}</label>)}</div>{delivery.visibility === 'encrypted' ? <p className="mt-2 rounded-lg bg-warning/10 p-3 text-xs leading-5 text-warning">请把 Manifest 模板中的 <code>encryptionKeyFingerprint</code> 填成密钥的 `sha256:` 指纹；只登记指纹，绝不能粘贴密钥或口令。</p> : null}</fieldset>
          </> : <>
            <label><span className="field-label">可访问 URI</span><input className="field" required minLength={8} value={delivery.uri} onChange={(event) => setDelivery((value) => ({ ...value, uri: event.target.value }))} placeholder="https://… 或 ipfs://…" /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">内容哈希</span><input className="field font-mono" required minLength={8} value={delivery.contentHash} onChange={(event) => setDelivery((value) => ({ ...value, contentHash: event.target.value }))} placeholder="sha256:…" /></label><label><span className="field-label">MIME 类型</span><input className="field font-mono" required minLength={3} value={delivery.mimeType} onChange={(event) => setDelivery((value) => ({ ...value, mimeType: event.target.value }))} placeholder="video/mp4" /></label></div>
          </>}
          <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn-secondary" onClick={() => setDeliveryOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <UploadCloud size={16} />}写入交付证据</button></div>
          {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
        </form>
      </Modal>
    </div>
  );
}
