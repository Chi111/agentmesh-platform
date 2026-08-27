import { AlertTriangle, ArrowLeft, Check, CircleDollarSign, Clock3, ExternalLink, FileCheck2, FileQuestion, Link2, LoaderCircle, LockKeyhole, MessageSquareText, Scale, ShieldCheck, Wrench } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useMission } from '../hooks/useMission';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount, isWeb3Payment, paymentToken } from '../utils/payments';
import { artifactBelongsToCurrentAttempt, deliveryReadiness, missionDeliverableBelongsToCurrentVersion } from '../utils/delivery';
import { missionStatusMeta } from '../utils/missionState';
import { api } from '../services/api';

function StageFeedbackCard({ missionId, stageId, stageName, agentName }: { missionId: string; stageId: string; stageName: string; agentName: string }) {
  const [deliveryQuality, setDeliveryQuality] = useState(5);
  const [requirementsFit, setRequirementsFit] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [onTime, setOnTime] = useState(true);
  const [reuse, setReuse] = useState(true);
  const [comment, setComment] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api.getAgentFeedback(missionId, stageId).then((feedback) => {
      if (cancelled || !feedback) return;
      setDeliveryQuality(feedback.deliveryQuality); setRequirementsFit(feedback.requirementsFit); setCommunication(feedback.communication);
      setOnTime(feedback.onTime); setReuse(feedback.reuse); setComment(feedback.comment); setVersion(feedback.version);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [missionId, stageId]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const result = await api.saveAgentFeedback(missionId, stageId, { deliveryQuality, requirementsFit, communication, onTime, reuse, comment });
      setVersion(result.feedback.version);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '反馈保存失败。');
    } finally { setBusy(false); }
  };

  return <article className="rounded-2xl border border-line bg-canvas/35 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{stageName}</p><p className="mt-1 text-xs text-muted">{agentName} · 仅已结算反馈进入信誉分</p></div>{version ? <StatusBadge tone="success">已保存 V{version}</StatusBadge> : <StatusBadge tone="neutral">待评价</StatusBadge>}</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[
    ['交付质量', deliveryQuality, setDeliveryQuality], ['需求符合度', requirementsFit, setRequirementsFit], ['沟通质量', communication, setCommunication],
  ].map(([label, value, setter]) => <label key={String(label)}><span className="field-label">{String(label)}</span><select className="field" value={Number(value)} onChange={(event) => (setter as (next: number) => void)(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((score) => <option value={score} key={score}>{score} / 5</option>)}</select></label>)}</div><div className="mt-4 flex flex-wrap gap-5 text-xs"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={onTime} onChange={(event) => setOnTime(event.target.checked)} />准时交付</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={reuse} onChange={(event) => setReuse(event.target.checked)} />愿意再次使用</label></div><label className="mt-4 block"><span className="field-label">公开说明（可选）</span><textarea className="field min-h-24" value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)} placeholder="说明交付亮点、偏差或改进建议；不要填写密钥和隐私信息。" /></label><div className="mt-4 flex items-center justify-between gap-3">{error ? <p className="text-xs text-danger">{error}</p> : <p className="text-[10px] text-muted">修改会生成新版本，旧版本保留在审计历史中。</p>}<button type="button" className="btn-secondary shrink-0" disabled={busy} onClick={() => void submit()}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <MessageSquareText size={14} />}{version ? '更新反馈' : '提交反馈'}</button></div></article>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function deliverableText(value: unknown, depth = 0): string | null {
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim();
    if (depth === 0 && text.startsWith('{') && text.endsWith('}')) {
      try {
        const extracted = deliverableText(JSON.parse(text) as unknown, depth + 1);
        if (extracted) return extracted;
      } catch {
        // A normal artifact may contain braces; keep it as plain text.
      }
    }
    return text;
  }
  const nested = objectValue(value);
  if (!nested) return null;
  for (const key of ['narrative', 'content', 'text', 'copy', 'script', 'body', 'markdown']) {
    const candidate = deliverableText(nested[key], depth + 1);
    if (candidate) return candidate;
  }
  return null;
}

export function AcceptancePage() {
  const { missionId: routeMissionId = '' } = useParams();
  const mission = useMission();
  const missionId = mission?.id ?? routeMissionId;
  const { freezeEscrow, onchainSettlement, releaseEscrow } = useAuth();
  const agents = useAppStore((state) => state.agents);
  const storedStages = useAppStore((state) => state.missionStages[missionId]);
  const stages = storedStages ?? [];
  const role = useAppStore((state) => state.role);
  const profile = useAppStore((state) => state.profile);
  const detail = useAppStore((state) => state.missionDetails[missionId]);
  const releasePayment = useAppStore((state) => state.releasePayment);
  const createDispute = useAppStore((state) => state.createDispute);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedDeliverableId, setSelectedDeliverableId] = useState('');
  const usesWeb3 = mission ? isWeb3Payment(mission.paymentMethod) : false;
  const token = mission ? paymentToken(mission.paymentMethod) : 'CREDIT';

  useEffect(() => {
    if (!missionId || detail) return;
    void loadMissionDetail(missionId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : '交付详情加载失败。'));
  }, [detail, loadMissionDetail, missionId]);

  const deliverables = detail?.deliverables ?? [];
  const changeRequests = detail?.changeRequests ?? [];
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const currentDeliverables = deliverables.filter((deliverable) => {
    if (deliverable.status === 'rejected') return false;
    if (!deliverable.stageId) return missionDeliverableBelongsToCurrentVersion(deliverable, changeRequests);
    const stage = stagesById.get(deliverable.stageId);
    return stage ? artifactBelongsToCurrentAttempt(stage, deliverable) : false;
  });
  const currentDeliverableIds = new Set(currentDeliverables.map((deliverable) => deliverable.id));
  const historicalDeliverables = deliverables.filter((deliverable) => !currentDeliverableIds.has(deliverable.id));
  const selectedDeliverable = currentDeliverables.find((item) => item.id === selectedDeliverableId)
    ?? currentDeliverables[currentDeliverables.length - 1]
    ?? null;
  const completedStageOutputs = stages.filter((stage) => stage.status === 'done' && stage.output && Object.keys(stage.output).length > 0);
  const finalStageOutput = completedStageOutputs[completedStageOutputs.length - 1]?.output ?? null;
  const finalStageResult = objectValue(finalStageOutput)?.result;
  const finalDeliverable = objectValue(finalStageResult)?.deliverable ?? finalStageOutput;
  const finalDeliverableText = deliverableText(finalDeliverable);
  const readiness = deliveryReadiness(stages, deliverables);
  const hasAcceptableOutput = readiness.ready;
  const evidenceCount = detail?.events.length ?? 0;
  const activeDispute = detail?.disputes.some((item) => item.status === 'open' || item.status === 'reviewing') ?? false;
  const canAccept = role === 'requester' && mission?.status === 'review' && hasAcceptableOutput;
  const canRequestRework = mission?.status === 'review' && profile?.role === 'requester' && mission.requesterId === profile.id;
  const isImage = selectedDeliverable?.mimeType.startsWith('image/');
  const isVideo = selectedDeliverable?.mimeType.startsWith('video/');

  if (!mission) {
    return <section className="panel py-16 text-center"><p className="text-sm font-semibold">正在加载任务，或任务不存在</p><Link className="btn-secondary mt-5" to="/missions">返回任务列表</Link></section>;
  }

  const statusDisplay = missionStatusMeta(mission);

  const submitDispute = async (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 20) return;
    setBusy(true);
    setError('');
    try {
      if (usesWeb3 && !onchainSettlement) throw new Error('Sepolia 托管合约尚未配置，无法冻结该 Web3 任务。');
      const freezeTxHash = usesWeb3 ? await freezeEscrow(mission.id) : null;
      await createDispute(mission.id, reason.trim(), freezeTxHash);
      setDisputeOpen(false);
      setReason('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '争议提交失败。');
    } finally {
      setBusy(false);
    }
  };

  const confirmRelease = async () => {
    setBusy(true);
    setError('');
    try {
      let releaseTxHash: string | null = null;
      if (usesWeb3) {
        if (!onchainSettlement) throw new Error('Sepolia 托管合约尚未配置，无法释放该 Web3 任务。');
        const weights = new Map<string, number>();
        const walletsByAgent = new Map(agents.map((agent) => [agent.id, agent.wallet]));
        for (const stage of stages) {
          const wallet = stage.agentId ? walletsByAgent.get(stage.agentId) : undefined;
          if (!wallet) throw new Error(`“${stage.name}”对应 Agent 尚未配置结算钱包。`);
          weights.set(wallet, (weights.get(wallet) ?? 0) + stage.budget);
        }
        releaseTxHash = await releaseEscrow(
          mission.id,
          [...weights].map(([address, weight]) => ({ address, weight })),
        );
      }
      await releasePayment(mission.id, releaseTxHash);
      setReleaseOpen(false);
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : '验收结算失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3"><Link to="/missions" className="mt-1 rounded-lg p-2 text-muted hover:bg-white hover:text-ink" aria-label="返回任务列表"><ArrowLeft size={18} /></Link><div><div className="flex flex-wrap items-center gap-2"><span className="mono-chip">{mission.id}</span><StatusBadge tone={statusDisplay.tone}>{statusDisplay.label}</StatusBadge></div><h1 className="mt-2 text-2xl font-semibold tracking-tight">{mission.title}</h1><p className="mt-2 text-sm text-muted">{mission.status === 'review' || mission.status === 'completed' ? '核对交付物、执行证据和分账计划后完成结算。' : '此页面仅展示已有交付证据；任务尚未达到验收条件。'}</p></div></div>
        <div className="flex flex-wrap gap-3">{canRequestRework ? <Link className="btn-secondary" to={`/missions/${mission.id}/execution`}><Wrench size={16} />查看执行与请求返工</Link> : null}<button type="button" className="btn-primary" onClick={() => setReleaseOpen(true)} disabled={mission.status === 'completed' || mission.status === 'cancelled' || !canAccept}><Check size={16} />{mission.status === 'completed' ? '已完成结算' : mission.status === 'cancelled' ? '任务已退款终止' : role !== 'requester' ? '仅任务方可确认验收' : mission.status !== 'review' ? '等待 Agent 完成执行' : !hasAcceptableOutput ? '等待可验收输出' : `确认交付并释放 ${formatPaymentAmount(mission.budget, mission.paymentMethod)}`}</button></div>
      </header>

      {mission.status !== 'review' && mission.status !== 'completed' && mission.status !== 'cancelled' ? <section className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold text-warning"><AlertTriangle size={16} />任务尚未进入验收阶段</p><p className="mt-1 text-xs leading-5 text-muted">缺失的工程制品必须由执行节点重新提交，分析文字不能替代可下载 artifact。</p></div><Link className="btn-secondary shrink-0" to={`/missions/${mission.id}/execution`}>返回执行页</Link></section> : null}

      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="border-b border-line bg-ink p-5 text-white lg:border-b-0 lg:border-r lg:border-line">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><FileCheck2 size={18} className="text-cyan" /><h2 className="font-semibold">{selectedDeliverable ? 'Proof of Work / 最终交付物' : 'Proof of Work / 交付证据'}</h2></div>{selectedDeliverable ? <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[9px]">{selectedDeliverable.mimeType.toUpperCase()}</span> : null}</div>
            {selectedDeliverable ? <div className="mesh-grid mt-5 flex min-h-[460px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/25">{isImage ? <img className="max-h-[520px] w-full object-contain" src={selectedDeliverable.uri} alt={selectedDeliverable.name} /> : isVideo ? <video className="max-h-[520px] w-full" src={selectedDeliverable.uri} controls preload="metadata" /> : <a className="flex max-w-sm flex-col items-center rounded-2xl border border-white/15 bg-white/[0.06] p-8 text-center transition hover:bg-white/10" href={selectedDeliverable.uri} target="_blank" rel="noreferrer"><FileQuestion size={34} className="text-cyan" /><span className="mt-4 text-sm font-semibold">{selectedDeliverable.name}</span><span className="mt-2 text-xs text-white/40">浏览器无法内嵌预览此格式，点击打开交付 URI</span><ExternalLink size={15} className="mt-4" /></a>}</div> : <div className="mesh-grid mt-5 flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-warning/30 bg-black/25 px-6 text-center"><FileQuestion size={34} className="text-warning/70" /><p className="mt-4 text-sm font-semibold">当前没有可下载工程制品</p><p className="mt-2 max-w-md text-xs leading-5 text-white/45">Agent 的文字说明和代码片段仅作为执行证据；Implement 节点必须提交带 URI、哈希和类型的真实 artifact 才能进入验收。</p></div>}
            {finalStageOutput && !selectedDeliverable ? <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-warning" />结构化阶段输出（仅证据，非交付物）</div>{finalDeliverableText ? <div className="mt-4 whitespace-pre-wrap break-words text-xs leading-6 text-white/65">{finalDeliverableText}</div> : <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-[11px] leading-6 text-white/60">{JSON.stringify(finalDeliverable, null, 2)}</pre>}</div> : null}
            <div className="mt-4 flex flex-wrap gap-3 font-mono text-[9px] text-white/35">{selectedDeliverable ? <><span>HASH {selectedDeliverable.contentHash}</span><span>STATUS {selectedDeliverable.status.toUpperCase()}</span><span>{selectedDeliverable.createdAt ? `SUBMITTED ${new Date(selectedDeliverable.createdAt).toLocaleString('zh-CN', { hour12: false })}` : null}</span></> : finalStageOutput ? <><span>NO DOWNLOADABLE ARTIFACT</span><span>{completedStageOutputs.length}/{stages.length} STAGE OUTPUTS VALID</span></> : <span>WAITING FOR AGENT OUTPUT</span>}</div>
            {currentDeliverables.length > 1 ? <div className="mt-4 flex flex-wrap gap-2">{currentDeliverables.map((item) => <button type="button" className={`rounded-lg border px-3 py-2 text-xs transition ${selectedDeliverable?.id === item.id ? 'border-cyan bg-cyan/10 text-white' : 'border-white/10 text-white/45 hover:text-white'}`} onClick={() => setSelectedDeliverableId(item.id)} key={item.id}>{item.name}</button>)}</div> : null}
            {historicalDeliverables.length > 0 ? <p className="mt-4 text-xs leading-5 text-white/45">{historicalDeliverables.length} 个历史 attempt 或已拒绝制品已保留，仅供审计，不参与当前验收。</p> : null}
            {readiness.missingArtifactStages.length > 0 ? <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning"><p className="font-semibold">缺少真实工程制品，暂不可验收</p><p className="mt-1 text-xs leading-5 text-white/55">以下 Implement 节点尚未提交可下载 artifact：{readiness.missingArtifactStages.map((stage) => stage.name).join('、')}</p></div> : null}
          </div>

          <aside className="p-5 md:p-6">
            <div className="flex items-center gap-2"><CircleDollarSign size={18} /><h2 className="font-semibold">验收与结算</h2></div>
            <div className="mt-5 rounded-xl bg-canvas p-5 text-center"><p className="text-xs text-muted">托管总额</p><p className="mt-2 font-mono text-3xl font-semibold text-cyan">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</p></div>
            <dl className="mt-5 space-y-3 text-sm">{stages.map((stage) => <div className="flex justify-between" key={stage.id}><dt className="text-muted">{stage.name}</dt><dd className="font-mono text-xs font-semibold">{formatPaymentAmount(stage.budget, mission.paymentMethod)}</dd></div>)}</dl>
            <div className="mt-5 rounded-xl border border-cyan/20 bg-cyan/[0.06] p-4"><p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={16} className="text-cyan" />{detail?.escrow?.status === 'released' ? '结算账本已释放' : detail?.escrow?.status === 'frozen' ? '争议期间账本冻结' : '等待验收确认'}</p><ul className="mt-3 space-y-2 text-xs text-muted"><li className="flex items-center gap-2"><Check size={13} />验收后生成分阶段账目</li><li className="flex items-center gap-2"><Check size={13} />URI、哈希和事件可追溯</li></ul></div>
            {mission.reviewDueAt && mission.status === 'review' ? <div className="mt-4 rounded-xl border border-warning/25 bg-warning/10 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-warning"><Clock3 size={16} />验收截止时间</p><p className="mt-2 font-mono text-xs">{new Date(mission.reviewDueAt).toLocaleString('zh-CN', { hour12: false })}</p><p className="mt-2 text-xs leading-5 text-muted">当前版本记录并展示 7 天验收窗口；到期不会自动释放链上资金，仍需任务方确认或发起争议。</p></div> : null}
            <button type="button" className="btn-secondary mt-5 w-full text-danger" onClick={() => setDisputeOpen(true)} disabled={mission.status === 'completed' || mission.status === 'cancelled' || activeDispute}><Scale size={16} />{activeDispute ? '已有争议处理中' : '发起争议'}</button>
          </aside>
        </div>
      </section>

      <section className="panel p-5 md:p-6">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Evidence Chain</h2><p className="mt-1 text-xs text-muted">每个阶段的状态、输出和可追溯执行事件。</p></div><StatusBadge tone={evidenceCount ? 'success' : 'neutral'}>{evidenceCount} 个事件</StatusBadge></div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">{stages.map((stage, index) => <article className="rounded-xl border border-line bg-canvas/40 p-4" key={stage.id}><div className="flex items-center justify-between"><span className={`flex size-8 items-center justify-center rounded-full ${stage.status === 'done' ? 'bg-lime/20 text-lime-700' : stage.status === 'running' ? 'bg-cyan/15 text-cyan' : stage.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-canvas text-muted'}`}><ShieldCheck size={16} /></span><StatusBadge tone={stage.status === 'done' ? 'success' : stage.status === 'running' ? 'info' : stage.status === 'failed' ? 'danger' : 'neutral'}>{stage.status === 'done' ? '完成' : stage.status === 'running' ? '执行中' : stage.status === 'failed' ? '失败' : '等待'}</StatusBadge></div><p className="mt-3 font-mono text-[9px] text-muted">STAGE {String(index + 1).padStart(2, '0')}</p><h3 className="mt-2 text-sm font-semibold">{stage.name}</h3><p className="mt-2 text-xs leading-5 text-muted">{stage.status === 'done' ? stage.output ? 'Agent 输出与阶段状态已写入证据链。' : '阶段已完成，等待或已提交最终交付。' : stage.status === 'running' ? 'Agent 正在执行，等待签名回调。' : stage.status === 'failed' ? '节点未产生有效交付，等待任务方处理后重试。' : '等待上游依赖满足后派发。'}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan"><Link2 size={13} />{detail?.events.filter((event) => event.stageId === stage.id).length ?? 0} 个阶段事件</span></article>)}</div>
      </section>

      {mission.status === 'completed' && role === 'requester' && !detail?.disputes.some((item) => item.status === 'resolved') ? <section className="panel p-5 md:p-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><MessageSquareText size={18} /></span><div><h2 className="font-semibold">Agent 结构化反馈</h2><p className="mt-1 text-xs text-muted">每个已结算任务节点可评价一次；更新会版本化，退款或有效争议不会进入信誉分。</p></div></div><div className="mt-5 grid gap-4 xl:grid-cols-2">{stages.filter((stage) => stage.nodeType === 'task' && stage.status === 'done' && stage.agentId).map((stage) => <StageFeedbackCard missionId={mission.id} stageId={stage.id} stageName={stage.name} agentName={agents.find((agent) => agent.id === stage.agentId)?.name ?? stage.agentId!} key={stage.id} />)}</div></section> : null}

      <Modal open={releaseOpen} onClose={() => setReleaseOpen(false)} title="确认交付并释放资金" description={usesWeb3 ? `钱包将调用 Sepolia 托管合约完成 ${token} 分账；Worker 验证释放事件后更新任务状态。` : '确认后会从 Web2 托管余额结算给开发者，并生成平台费账目。'}>
        <div className="rounded-xl border border-line bg-canvas p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted">释放总额</span><span className="font-mono text-lg font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</span></div><div className="mt-3 flex items-center gap-2 text-xs text-muted"><ShieldCheck size={14} className="text-lime" />{evidenceCount} 个事件 · {currentDeliverables.length} 个当前 attempt URI 交付物 · {completedStageOutputs.length} 个签名阶段输出</div></div>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setReleaseOpen(false)}>取消</button><button type="button" className="btn-primary" onClick={() => void confirmRelease()} disabled={busy || (usesWeb3 && !onchainSettlement)}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{usesWeb3 ? `链上释放 ${token}` : '余额结算并验收'}</button></div>
        {error ? <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="发起争议" description={usesWeb3 ? '钱包将先冻结 Sepolia 链上托管，Worker 核验后创建争议。' : '提交后 Web2 托管账本进入冻结状态，等待管理员裁决。'}>
        <form onSubmit={submitDispute}><label><span className="field-label">争议说明</span><textarea className="field min-h-28" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明未达到的验收标准，并引用具体证据…" /></label>{reason.length > 0 && reason.length < 20 ? <p className="mt-2 flex items-center gap-1 text-xs text-danger"><AlertTriangle size={13} />至少输入 20 个字</p> : null}<div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setDisputeOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy || reason.trim().length < 20}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}提交争议并冻结账本</button></div>{error ? <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}</form>
      </Modal>
    </div>
  );
}
