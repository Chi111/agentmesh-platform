import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileSearch, History, LoaderCircle, Scale, ShieldAlert, Users } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount, isWeb3Payment } from '../utils/payments';
import type { DisputeAction } from '../types/domain';

const statusMeta = {
  open: { label: '待处理', tone: 'warning' as const },
  reviewing: { label: '审核中', tone: 'info' as const },
  resolved: { label: '已解决', tone: 'success' as const },
  rejected: { label: '已驳回', tone: 'neutral' as const },
};

export function ArbitrationPage() {
  const { onchainSettlement, refundEscrow, unfreezeEscrow } = useAuth();
  const disputes = useAppStore((state) => state.disputes);
  const missions = useAppStore((state) => state.missions);
  const profile = useAppStore((state) => state.profile);
  const startDisputeReview = useAppStore((state) => state.startDisputeReview);
  const resolveDispute = useAppStore((state) => state.resolveDispute);
  const showToast = useAppStore((state) => state.showToast);
  const [selectedId, setSelectedId] = useState(disputes[0]?.id ?? '');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [decision, setDecision] = useState<'resolved' | 'rejected'>('resolved');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actions, setActions] = useState<DisputeAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const selectedCase = disputes.find((item) => item.id === selectedId) ?? disputes[0] ?? null;
  const openCount = disputes.filter((item) => item.status === 'open' || item.status === 'reviewing').length;
  const resolvedCount = disputes.filter((item) => item.status === 'resolved' || item.status === 'rejected').length;
  const evidenceCount = disputes.reduce((total, item) => total + item.evidence.length, 0);
  const resolutionRate = disputes.length ? Math.round((resolvedCount / disputes.length) * 100) : 0;
  const selectedMission = useMemo(() => missions.find((mission) => mission.id === selectedCase?.missionId) ?? null, [missions, selectedCase?.missionId]);
  const canResolve = profile?.role === 'admin';
  const caseClosed = selectedCase?.status === 'resolved' || selectedCase?.status === 'rejected';
  const primaryLabel = !canResolve
    ? selectedCase?.status === 'open' ? '等待管理员接单' : '等待管理员裁决'
    : selectedCase?.status === 'open' ? '接手并开始审核'
      : '提交管理员裁决';

  useEffect(() => {
    let cancelled = false;
    if (!selectedCase) {
      setActions([]);
      return () => { cancelled = true; };
    }
    setActionsLoading(true);
    setHistoryError('');
    void api.listDisputeActions(selectedCase.id)
      .then((next) => { if (!cancelled) setActions(next); })
      .catch((loadError) => { if (!cancelled) setHistoryError(loadError instanceof Error ? loadError.message : '审计轨迹加载失败。'); })
      .finally(() => { if (!cancelled) setActionsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCase]);

  const beginReview = async () => {
    if (!selectedCase) return;
    if (!canResolve) {
      showToast('当前账户可查看案件，但只有平台管理员可以接手审核。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await startDisputeReview(selectedCase.id);
      setActions(await api.listDisputeActions(selectedCase.id));
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '案件接单失败。');
    } finally {
      setBusy(false);
    }
  };

  const submitResolution = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCase || rationale.trim().length < 20) return;
    setBusy(true);
    setError('');
    try {
      const usesWeb3 = selectedMission ? isWeb3Payment(selectedMission.paymentMethod) : false;
      if (usesWeb3 && !onchainSettlement) throw new Error('Sepolia 托管合约尚未配置，无法提交链上裁决。');
      const resolutionTxHash = usesWeb3
        ? decision === 'resolved'
          ? await refundEscrow(selectedCase.missionId)
          : await unfreezeEscrow(selectedCase.missionId)
        : null;
      await resolveDispute(selectedCase.id, rationale.trim(), decision, resolutionTxHash);
      setActions(await api.listDisputeActions(selectedCase.id));
      setResolveOpen(false);
      setRationale('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '裁决提交失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Trust & Resolution" title="争议与仲裁" description="争议创建时同步冻结托管；Web3 裁决必须由仲裁钱包执行链上退款或解冻，Worker 核验交易后才更新案件。" />
      <section className="grid gap-4 md:grid-cols-3">
        {[[ShieldAlert, String(openCount), '待处理案件'], [Users, String(disputes.length), '可访问案件'], [Scale, `${resolutionRate}%`, '案件解决率']].map(([Icon, value, label]) => <article className="panel flex items-center gap-4 p-5" key={String(label)}><span className="flex size-11 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Icon size={20} /></span><div><p className="font-mono text-2xl font-semibold">{String(value)}</p><p className="mt-1 text-xs text-muted">{String(label)}</p></div></article>)}
      </section>

      {error && !resolveOpen ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger" role="alert">{error}</p> : null}

      {selectedCase ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="panel overflow-hidden"><div className="border-b border-line px-5 py-4"><h2 className="font-semibold">案件队列</h2><p className="mt-1 text-xs text-muted">按当前账户权限过滤；管理员可接手、审核并形成审计轨迹</p></div><div className="divide-y divide-line">{disputes.map((item) => {
          const mission = missions.find((candidate) => candidate.id === item.missionId);
          const meta = statusMeta[item.status];
          return <button type="button" className={`grid w-full gap-4 px-5 py-5 text-left transition lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center ${selectedCase.id === item.id ? 'bg-cyan/[0.045]' : 'hover:bg-canvas/50'}`} onClick={() => setSelectedId(item.id)} key={item.id}><div><div className="flex flex-wrap items-center gap-2"><span className="mono-chip">{item.id}</span><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div><p className="mt-3 line-clamp-2 text-sm font-semibold">{item.reason}</p><p className="mt-2 font-mono text-[10px] text-muted">{item.missionId} · {item.evidence.length} EVIDENCE</p></div><div><p className="text-[10px] text-muted">冻结金额</p><p className="mt-1 font-mono text-sm font-semibold">{mission ? formatPaymentAmount(mission.budget, mission.paymentMethod) : '—'}</p></div><ArrowRight size={17} className="text-muted" /></button>;
        })}</div></section>

        <aside className="space-y-4">
          <section className="mesh-grid rounded-2xl border border-white/10 bg-ink p-5 text-white"><div className="flex items-center justify-between"><span className="mono-chip !border-white/10 !bg-white/5 !text-white/45">{selectedCase.id}</span><span className="flex items-center gap-1 font-mono text-[10px] text-warning"><Clock3 size={13} />{new Date(selectedCase.createdAt).toLocaleString('zh-CN', { hour12: false })}</span></div><h2 className="mt-5 text-lg font-semibold">{selectedMission?.title ?? selectedCase.missionId}</h2><p className="mt-3 text-xs leading-5 text-white/45">{selectedCase.reason}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/5 p-3"><p className="text-[9px] text-white/35">FROZEN</p><p className="mt-2 font-mono text-sm">{selectedMission ? formatPaymentAmount(selectedMission.budget, selectedMission.paymentMethod) : '—'}</p></div><div className="rounded-xl bg-white/5 p-3"><p className="text-[9px] text-white/35">EVIDENCE</p><p className="mt-2 font-mono text-sm">{selectedCase.evidence.length} ITEMS</p></div></div>{selectedCase.resolution ? <div className="mt-5 rounded-xl border border-lime/20 bg-lime/10 p-3 text-xs leading-5 text-white/65"><strong className="block text-lime">裁决结果</strong><span className="mt-1 block">{selectedCase.resolution}</span></div> : null}<button type="button" className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 text-sm font-semibold text-ink disabled:opacity-40" onClick={() => selectedCase.status === 'open' ? void beginReview() : canResolve ? setResolveOpen(true) : showToast('当前账户可查看案件，但只有平台管理员可以提交真实裁决。')} disabled={caseClosed || busy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Scale size={16} />}{caseClosed ? '案件已关闭' : primaryLabel}</button><Link className="mt-3 flex justify-center text-xs font-semibold text-cyan" to={`/missions/${selectedCase.missionId}/acceptance`}>查看关联任务与交付</Link></section>
          <section className="panel p-5"><div className="flex items-center gap-2"><FileSearch size={17} /><h2 className="font-semibold">证据清单</h2></div>{selectedCase.evidence.length ? <ul className="mt-4 space-y-3">{selectedCase.evidence.map((item) => <li key={`${item.label}-${item.uri}`}><a className="flex items-center gap-2 text-xs text-muted transition hover:text-cyan" href={item.uri} target="_blank" rel="noreferrer"><CheckCircle2 size={14} className="text-cyan" />{item.label}</a></li>)}</ul> : <p className="mt-4 text-xs leading-5 text-muted">尚未附加外部证据；任务规格、执行事件和交付哈希仍可在关联任务中核对。</p>}<p className="mt-4 border-t border-line pt-4 font-mono text-[9px] text-muted">WORKSPACE EVIDENCE · {evidenceCount} ITEMS</p></section>
          <section className="panel p-5"><div className="flex items-center gap-2"><History size={17} /><h2 className="font-semibold">处理轨迹</h2>{actionsLoading ? <LoaderCircle className="ml-auto animate-spin text-muted" size={15} /> : null}</div>{historyError ? <p className="mt-4 text-xs text-danger" role="alert">{historyError}</p> : actions.length ? <ol className="mt-4 space-y-4 border-l border-line pl-4">{actions.map((item) => <li className="relative" key={item.id}><span className="absolute -left-[21px] top-1 size-2 rounded-full bg-cyan" /><p className="text-xs font-semibold">{item.action === 'review_started' ? '管理员开始审核' : item.action === 'resolved' ? '支持争议方并结案' : '驳回争议并结案'}</p><p className="mt-1 font-mono text-[9px] text-muted">{item.actorId} · {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</p>{item.note ? <p className="mt-2 text-xs leading-5 text-muted">{item.note}</p> : null}</li>)}</ol> : !actionsLoading ? <p className="mt-4 text-xs leading-5 text-muted">案件尚未被管理员接手。开始审核后，每次关键动作都会追加到 D1 审计轨迹。</p> : null}</section>
        </aside>
      </div> : <section className="panel py-16 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-cyan/10 text-cyan"><Scale size={21} /></span><h2 className="mt-5 text-lg font-semibold">当前没有争议案件</h2><p className="mt-2 text-sm text-muted">从任务验收页发起争议后，案件和冻结状态会出现在这里。</p></section>}

      {selectedCase ? <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title={`裁决 · ${selectedCase.id}`} description={selectedMission && isWeb3Payment(selectedMission.paymentMethod) ? '管理员钱包将执行链上退款或解冻；Worker 核验后写入 D1。' : 'Web2 裁决会原子更新托管账本与退款余额。'}><form onSubmit={submitResolution}><fieldset><legend className="field-label">裁决结果</legend><div className="grid grid-cols-2 gap-3"><label className={`cursor-pointer rounded-xl border p-4 ${decision === 'resolved' ? 'border-cyan bg-cyan/[0.06]' : 'border-line'}`}><input className="sr-only" type="radio" name="decision" value="resolved" checked={decision === 'resolved'} onChange={() => setDecision('resolved')} /><span className="text-sm font-semibold">支持争议方</span><span className="mt-1 block text-xs text-muted">退款给任务方并结案</span></label><label className={`cursor-pointer rounded-xl border p-4 ${decision === 'rejected' ? 'border-cyan bg-cyan/[0.06]' : 'border-line'}`}><input className="sr-only" type="radio" name="decision" value="rejected" checked={decision === 'rejected'} onChange={() => setDecision('rejected')} /><span className="text-sm font-semibold">驳回争议</span><span className="mt-1 block text-xs text-muted">解冻后恢复正常验收</span></label></div></fieldset><label className="mt-5 block"><span className="field-label">裁决依据</span><textarea className="field min-h-28" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="引用任务规格、事件或交付证据，至少 20 个字…" /></label>{rationale.length > 0 && rationale.trim().length < 20 ? <p className="mt-2 flex items-center gap-1 text-xs text-danger"><AlertTriangle size={13} />至少输入 20 个字</p> : null}<div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setResolveOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy || rationale.trim().length < 20}>{busy ? '提交中…' : selectedMission && isWeb3Payment(selectedMission.paymentMethod) ? decision === 'resolved' ? '链上退款并结案' : '链上解冻并驳回' : '执行余额裁决'}</button></div>{error ? <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}</form></Modal> : null}
    </div>
  );
}
