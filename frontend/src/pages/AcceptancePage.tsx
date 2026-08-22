import { AlertTriangle, ArrowLeft, Check, CircleDollarSign, Clock3, ExternalLink, FileCheck2, FileQuestion, Link2, LoaderCircle, LockKeyhole, Scale, ShieldCheck } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useMission } from '../hooks/useMission';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount, isWeb3Payment, paymentToken } from '../utils/payments';

export function AcceptancePage() {
  const mission = useMission();
  const missionId = mission?.id ?? '';
  const { freezeEscrow, onchainSettlement, releaseEscrow } = useAuth();
  const agents = useAppStore((state) => state.agents);
  const storedStages = useAppStore((state) => state.missionStages[missionId]);
  const stages = storedStages ?? [];
  const role = useAppStore((state) => state.role);
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
  const selectedDeliverable = deliverables.find((item) => item.id === selectedDeliverableId) ?? deliverables[0] ?? null;
  const evidenceCount = detail?.events.length ?? 0;
  const canAccept = role === 'requester' && mission?.status === 'review' && deliverables.length > 0;
  const isImage = selectedDeliverable?.mimeType.startsWith('image/');
  const isVideo = selectedDeliverable?.mimeType.startsWith('video/');

  if (!mission) {
    return <section className="panel py-16 text-center"><p className="text-sm font-semibold">正在加载任务，或任务不存在</p><Link className="btn-secondary mt-5" to="/missions">返回任务列表</Link></section>;
  }

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
        <div className="flex items-start gap-3"><Link to="/missions" className="mt-1 rounded-lg p-2 text-muted hover:bg-white hover:text-ink" aria-label="返回任务列表"><ArrowLeft size={18} /></Link><div><div className="flex flex-wrap items-center gap-2"><span className="mono-chip">{mission.id}</span><StatusBadge tone={mission.status === 'completed' ? 'success' : mission.status === 'cancelled' ? 'neutral' : 'warning'}>{mission.status === 'completed' ? '已结算' : mission.status === 'cancelled' ? '已退款终止' : '待验收'}</StatusBadge></div><h1 className="mt-2 text-2xl font-semibold tracking-tight">{mission.title}</h1><p className="mt-2 text-sm text-muted">核对交付物、执行证据和分账计划后完成结算。</p></div></div>
        <div className="flex gap-3"><button type="button" className="btn-primary" onClick={() => setReleaseOpen(true)} disabled={mission.status === 'completed' || mission.status === 'cancelled' || !canAccept}><Check size={16} />{mission.status === 'completed' ? '已完成结算' : mission.status === 'cancelled' ? '任务已退款终止' : role !== 'requester' ? '仅任务方可确认验收' : mission.status !== 'review' ? '等待开发者提交验收' : deliverables.length === 0 ? '等待真实交付物' : `确认交付并释放 ${formatPaymentAmount(mission.budget, mission.paymentMethod)}`}</button></div>
      </header>

      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="border-b border-line bg-ink p-5 text-white lg:border-b-0 lg:border-r lg:border-line">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><FileCheck2 size={18} className="text-cyan" /><h2 className="font-semibold">Proof of Work / 最终交付物</h2></div>{selectedDeliverable ? <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[9px]">{selectedDeliverable.mimeType.toUpperCase()}</span> : null}</div>
            {selectedDeliverable ? <div className="mesh-grid mt-5 flex min-h-[460px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/25">{isImage ? <img className="max-h-[520px] w-full object-contain" src={selectedDeliverable.uri} alt={selectedDeliverable.name} /> : isVideo ? <video className="max-h-[520px] w-full" src={selectedDeliverable.uri} controls preload="metadata" /> : <a className="flex max-w-sm flex-col items-center rounded-2xl border border-white/15 bg-white/[0.06] p-8 text-center transition hover:bg-white/10" href={selectedDeliverable.uri} target="_blank" rel="noreferrer"><FileQuestion size={34} className="text-cyan" /><span className="mt-4 text-sm font-semibold">{selectedDeliverable.name}</span><span className="mt-2 text-xs text-white/40">浏览器无法内嵌预览此格式，点击打开交付 URI</span><ExternalLink size={15} className="mt-4" /></a>}</div> : <div className="mesh-grid mt-5 flex min-h-[460px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/25 text-center"><FileQuestion size={34} className="text-white/25" /><p className="mt-4 text-sm font-semibold">尚无真实交付物</p><p className="mt-2 max-w-sm text-xs leading-5 text-white/40">开发者提交 URI、内容哈希与 MIME 类型后，这里会显示实际资产。</p></div>}
            <div className="mt-4 flex flex-wrap gap-3 font-mono text-[9px] text-white/35">{selectedDeliverable ? <><span>HASH {selectedDeliverable.contentHash}</span><span>STATUS {selectedDeliverable.status.toUpperCase()}</span><span>{selectedDeliverable.createdAt ? `SUBMITTED ${new Date(selectedDeliverable.createdAt).toLocaleString('zh-CN', { hour12: false })}` : null}</span></> : <span>WAITING FOR DEVELOPER SUBMISSION</span>}</div>
            {deliverables.length > 1 ? <div className="mt-4 flex flex-wrap gap-2">{deliverables.map((item) => <button type="button" className={`rounded-lg border px-3 py-2 text-xs transition ${selectedDeliverable?.id === item.id ? 'border-cyan bg-cyan/10 text-white' : 'border-white/10 text-white/45 hover:text-white'}`} onClick={() => setSelectedDeliverableId(item.id)} key={item.id}>{item.name}</button>)}</div> : null}
          </div>

          <aside className="p-5 md:p-6">
            <div className="flex items-center gap-2"><CircleDollarSign size={18} /><h2 className="font-semibold">验收与结算</h2></div>
            <div className="mt-5 rounded-xl bg-canvas p-5 text-center"><p className="text-xs text-muted">托管总额</p><p className="mt-2 font-mono text-3xl font-semibold text-cyan">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</p></div>
            <dl className="mt-5 space-y-3 text-sm">{stages.map((stage) => <div className="flex justify-between" key={stage.id}><dt className="text-muted">{stage.name}</dt><dd className="font-mono text-xs font-semibold">{formatPaymentAmount(stage.budget, mission.paymentMethod)}</dd></div>)}</dl>
            <div className="mt-5 rounded-xl border border-cyan/20 bg-cyan/[0.06] p-4"><p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={16} className="text-cyan" />{detail?.escrow?.status === 'released' ? '结算账本已释放' : detail?.escrow?.status === 'frozen' ? '争议期间账本冻结' : '等待验收确认'}</p><ul className="mt-3 space-y-2 text-xs text-muted"><li className="flex items-center gap-2"><Check size={13} />验收后生成分阶段账目</li><li className="flex items-center gap-2"><Check size={13} />URI、哈希和事件可追溯</li></ul></div>
            {mission.reviewDueAt && mission.status === 'review' ? <div className="mt-4 rounded-xl border border-warning/25 bg-warning/10 p-4"><p className="flex items-center gap-2 text-sm font-semibold text-warning"><Clock3 size={16} />验收截止时间</p><p className="mt-2 font-mono text-xs">{new Date(mission.reviewDueAt).toLocaleString('zh-CN', { hour12: false })}</p><p className="mt-2 text-xs leading-5 text-muted">当前版本记录并展示 7 天验收窗口；到期不会自动释放链上资金，仍需任务方确认或发起争议。</p></div> : null}
            <button type="button" className="btn-secondary mt-5 w-full text-danger" onClick={() => setDisputeOpen(true)} disabled={mission.status === 'completed' || mission.status === 'cancelled'}><Scale size={16} />发起争议</button>
          </aside>
        </div>
      </section>

      <section className="panel p-5 md:p-6">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Evidence Chain</h2><p className="mt-1 text-xs text-muted">每个阶段的状态、输出和可追溯执行事件。</p></div><StatusBadge tone={evidenceCount ? 'success' : 'neutral'}>{evidenceCount} 个事件</StatusBadge></div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">{stages.map((stage, index) => <article className="rounded-xl border border-line bg-canvas/40 p-4" key={stage.id}><div className="flex items-center justify-between"><span className={`flex size-8 items-center justify-center rounded-full ${stage.status === 'done' ? 'bg-lime/20' : stage.status === 'running' ? 'bg-cyan/15 text-cyan' : 'bg-canvas text-muted'}`}><ShieldCheck size={16} /></span><span className="font-mono text-[9px] text-muted">STAGE 0{index + 1}</span></div><h3 className="mt-4 text-sm font-semibold">{stage.name}</h3><p className="mt-2 text-xs leading-5 text-muted">{stage.status === 'done' ? stage.output ? 'Agent 输出与阶段状态已写入证据链。' : '阶段已完成，等待或已提交最终交付。' : stage.status === 'running' ? 'Agent 正在执行，等待签名回调。' : '等待上游阶段完成后派发。'}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan"><Link2 size={13} />{detail?.events.filter((event) => event.stageId === stage.id).length ?? 0} 个阶段事件</span></article>)}</div>
      </section>

      <Modal open={releaseOpen} onClose={() => setReleaseOpen(false)} title="确认交付并释放资金" description={usesWeb3 ? `钱包将调用 Sepolia 托管合约完成 ${token} 分账；Worker 验证释放事件后更新任务状态。` : '确认后会从 Web2 托管余额结算给开发者，并生成平台费账目。'}>
        <div className="rounded-xl border border-line bg-canvas p-4"><div className="flex items-center justify-between"><span className="text-sm text-muted">释放总额</span><span className="font-mono text-lg font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</span></div><div className="mt-3 flex items-center gap-2 text-xs text-muted"><ShieldCheck size={14} className="text-lime" />{evidenceCount} 个事件 · {deliverables.length} 个真实交付物</div></div>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setReleaseOpen(false)}>取消</button><button type="button" className="btn-primary" onClick={() => void confirmRelease()} disabled={busy || (usesWeb3 && !onchainSettlement)}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{usesWeb3 ? `链上释放 ${token}` : '余额结算并验收'}</button></div>
        {error ? <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="发起争议" description={usesWeb3 ? '钱包将先冻结 Sepolia 链上托管，Worker 核验后创建争议。' : '提交后 Web2 托管账本进入冻结状态，等待管理员裁决。'}>
        <form onSubmit={submitDispute}><label><span className="field-label">争议说明</span><textarea className="field min-h-28" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明未达到的验收标准，并引用具体证据…" /></label>{reason.length > 0 && reason.length < 20 ? <p className="mt-2 flex items-center gap-1 text-xs text-danger"><AlertTriangle size={13} />至少输入 20 个字</p> : null}<div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setDisputeOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy || reason.trim().length < 20}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}提交争议并冻结账本</button></div>{error ? <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}</form>
      </Modal>
    </div>
  );
}
