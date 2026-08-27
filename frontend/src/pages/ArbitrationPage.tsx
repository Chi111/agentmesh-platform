import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileSearch,
  Gavel,
  History,
  LoaderCircle,
  Scale,
  ShieldCheck,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import type { ArbitrationProposalStatus, DisputeAction, DisputeGovernance, DisputeVoteChoice } from '../types/domain';
import { formatPaymentAmount, isWeb3Payment } from '../utils/payments';

const caseStatusMeta = {
  open: { label: '待发起提案', tone: 'warning' as const },
  reviewing: { label: '治理中', tone: 'info' as const },
  resolved: { label: '已退款', tone: 'success' as const },
  rejected: { label: '已驳回', tone: 'neutral' as const },
};

const proposalStatusMeta: Record<ArbitrationProposalStatus, { label: string; description: string; className: string }> = {
  active: { label: '投票进行中', description: '委员会成员正在对提案表决', className: 'bg-cyan/15 text-cyan' },
  succeeded: { label: '退款提案通过', description: '等待管理员执行退款裁决', className: 'bg-lime/20 text-ink' },
  defeated: { label: '争议被驳回', description: '等待管理员执行解冻裁决', className: 'bg-warning/15 text-warning' },
  inconclusive: { label: '未形成多数', description: '平票或全部弃权，不授权资金操作', className: 'bg-warning/15 text-warning' },
  quorum_failed: { label: '未达到法定人数', description: '托管继续冻结，等待后续治理处理', className: 'bg-danger/10 text-danger' },
  executed: { label: '裁决已执行', description: '提案结果已经写入托管结算', className: 'bg-ink text-white' },
};

const voteOptions: Array<{ choice: DisputeVoteChoice; title: string; detail: string; activeClass: string }> = [
  { choice: 'support_refund', title: '支持争议方', detail: '退款给任务方并终止任务', activeClass: 'border-cyan bg-cyan/[0.06]' },
  { choice: 'oppose_refund', title: '驳回争议', detail: '解冻托管并恢复正常验收', activeClass: 'border-warning bg-warning/[0.07]' },
  { choice: 'abstain', title: '弃权', detail: '计入法定人数，不参与多数判断', activeClass: 'border-ink bg-ink/[0.04]' },
];

const voteLabel: Record<DisputeVoteChoice, string> = {
  support_refund: '支持退款',
  oppose_refund: '反对退款',
  abstain: '弃权',
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function percent(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
}

function actionLabel(action: DisputeAction['action']) {
  if (action === 'review_started') return 'DAO 首轮提案已创建';
  if (action === 'appeal_created') return '上诉提案已创建';
  if (action === 'execution_queued') return '最终裁决已进入执行队列';
  if (action === 'execution_executed') return '执行队列已封存';
  return action === 'resolved' ? '退款裁决已执行' : '驳回裁决已执行';
}

export function ArbitrationPage() {
  const { onchainSettlement, refundEscrow, unfreezeEscrow } = useAuth();
  const disputes = useAppStore((state) => state.disputes);
  const missions = useAppStore((state) => state.missions);
  const profile = useAppStore((state) => state.profile);
  const startDisputeReview = useAppStore((state) => state.startDisputeReview);
  const resolveDispute = useAppStore((state) => state.resolveDispute);
  const showToast = useAppStore((state) => state.showToast);
  const [selectedId, setSelectedId] = useState(disputes[0]?.id ?? '');
  const [governance, setGovernance] = useState<DisputeGovernance | null>(null);
  const [actions, setActions] = useState<DisputeAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voteChoice, setVoteChoice] = useState<DisputeVoteChoice>('support_refund');
  const [voteReason, setVoteReason] = useState('');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [rationale, setRationale] = useState('');
  const [weightMode, setWeightMode] = useState<'one_person_one_vote' | 'power'>('one_person_one_vote');
  const [appealReason, setAppealReason] = useState('');

  const selectedCase = disputes.find((item) => item.id === selectedId) ?? disputes[0] ?? null;
  const selectedMission = useMemo(
    () => missions.find((mission) => mission.id === selectedCase?.missionId) ?? null,
    [missions, selectedCase?.missionId],
  );
  const proposal = governance?.proposal ?? null;
  const canAdminister = profile?.role === 'admin';
  const decision = proposal?.status === 'succeeded' ? 'resolved' as const : 'rejected' as const;
  const canExecute = canAdminister && selectedCase?.status === 'reviewing'
    && governance?.executionReady === true && governance.execution?.status !== 'executed';
  const legacyClosed = !proposal && Boolean(selectedCase && ['resolved', 'rejected'].includes(selectedCase.status));
  const votingEnded = proposal ? Date.now() >= Date.parse(proposal.votingEndsAt) : false;
  const openCount = disputes.filter((item) => item.status === 'open' || item.status === 'reviewing').length;
  const votingCount = disputes.filter((item) => item.status === 'reviewing').length;
  const resolvedCount = disputes.filter((item) => item.status === 'resolved' || item.status === 'rejected').length;
  const metrics: Array<{ Icon: LucideIcon; value: number; label: string }> = [
    { Icon: Scale, value: openCount, label: '开放案件' },
    { Icon: Vote, value: votingCount, label: '投票中' },
    { Icon: ShieldCheck, value: resolvedCount, label: '已执行' },
  ];

  useEffect(() => {
    let cancelled = false;
    if (!selectedCase) {
      setGovernance(null);
      setActions([]);
      return () => { cancelled = true; };
    }
    setLoading(true);
    setError('');
    void Promise.all([
      api.getDisputeGovernance(selectedCase.id),
      api.listDisputeActions(selectedCase.id),
    ]).then(([nextGovernance, nextActions]) => {
      if (cancelled) return;
      setGovernance(nextGovernance);
      setActions(nextActions);
    }).catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : '仲裁提案加载失败。');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedCase?.id]);

  const refreshGovernance = async () => {
    if (!selectedCase) return;
    const [nextGovernance, nextActions] = await Promise.all([
      api.getDisputeGovernance(selectedCase.id),
      api.listDisputeActions(selectedCase.id),
    ]);
    setGovernance(nextGovernance);
    setActions(nextActions);
  };

  const beginReview = async () => {
    if (!selectedCase || !canAdminister) return;
    setBusy(true);
    setError('');
    try {
      await startDisputeReview(selectedCase.id, weightMode);
      await refreshGovernance();
      showToast('仲裁提案已创建，投票成员与 Power 已完成快照。', 'success');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '提案创建失败。');
    } finally {
      setBusy(false);
    }
  };

  const castVote = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCase || voteReason.trim().length < 12) return;
    setBusy(true);
    setError('');
    try {
      setGovernance(await api.castDisputeVote(selectedCase.id, voteChoice, voteReason.trim()));
      setVoteReason('');
      showToast('投票已写入不可变提案记录。', 'success');
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : '投票提交失败。');
    } finally {
      setBusy(false);
    }
  };

  const finalizeVote = async () => {
    if (!selectedCase) return;
    setBusy(true);
    setError('');
    try {
      setGovernance(await api.finalizeDisputeVote(selectedCase.id));
      showToast('投票结果已定案。', 'success');
    } catch (finalizeError) {
      setError(finalizeError instanceof Error ? finalizeError.message : '投票尚不能定案。');
    } finally {
      setBusy(false);
    }
  };

  const submitAppeal = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCase || !governance?.appeal.canAppeal || appealReason.trim().length < 20) return;
    setBusy(true);
    setError('');
    try {
      setGovernance(await api.createDisputeAppeal(selectedCase.id, appealReason.trim()));
      setAppealReason('');
      await refreshGovernance();
      showToast('上诉提案已创建，原提案与投票保持不可变。', 'success');
    } catch (appealError) {
      setError(appealError instanceof Error ? appealError.message : '上诉创建失败。');
    } finally {
      setBusy(false);
    }
  };

  const submitResolution = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCase || !canExecute || rationale.trim().length < 20) return;
    setBusy(true);
    setError('');
    try {
      const usesWeb3 = selectedMission ? isWeb3Payment(selectedMission.paymentMethod) : false;
      if (usesWeb3 && !onchainSettlement) throw new Error('Sepolia 托管合约尚未配置，无法提交链上裁决。');
      setGovernance(await api.queueDisputeExecution(selectedCase.id));
      const resolutionTxHash = usesWeb3
        ? decision === 'resolved'
          ? await refundEscrow(selectedCase.missionId)
          : await unfreezeEscrow(selectedCase.missionId)
        : null;
      await resolveDispute(selectedCase.id, rationale.trim(), decision, resolutionTxHash);
      await refreshGovernance();
      setResolveOpen(false);
      setRationale('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '裁决执行失败。');
    } finally {
      setBusy(false);
    }
  };

  const participated = proposal ? proposal.supportVotes + proposal.opposeVotes + proposal.abstainVotes : 0;
  const proposalMeta = proposal ? proposalStatusMeta[proposal.status] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="DAO Resolution"
        title="仲裁治理"
        description="案件支持显式一人一票或 Power 加权快照、至多一轮扩大委员上诉；最终裁决先入队，资金执行继续经过托管与链上核验。"
        actions={<span className="mono-chip">SNAPSHOT · APPEAL · QUEUE</span>}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {metrics.map(({ Icon, value, label }) => (
          <article className="panel flex items-center gap-4 p-4" key={label}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Icon size={18} /></span>
            <div><p className="font-mono text-xl font-semibold">{value}</p><p className="mt-0.5 text-xs text-muted">{label}</p></div>
          </article>
        ))}
      </section>

      {error && !resolveOpen ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger" role="alert">{error}</p> : null}

      {selectedCase ? <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-line bg-white xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-canvas/65 xl:border-b-0 xl:border-r">
          <div className="border-b border-line p-5"><h2 className="font-semibold">治理提案</h2><p className="mt-1 text-xs text-muted">仅显示当前账户可访问的案件</p></div>
          <div className="divide-y divide-line">
            {disputes.map((item) => {
              const mission = missions.find((candidate) => candidate.id === item.missionId);
              const meta = caseStatusMeta[item.status];
              return <button type="button" className={`w-full p-5 text-left transition ${selectedCase.id === item.id ? 'bg-white shadow-[inset_3px_0_0_#00b8d9]' : 'hover:bg-white/70'}`} onClick={() => setSelectedId(item.id)} key={item.id}>
                <div className="flex items-center justify-between gap-3"><span className="font-mono text-[9px] text-muted">{item.id}</span><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div>
                <p className="mt-3 line-clamp-2 text-sm font-semibold leading-5">{mission?.title ?? item.missionId}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-muted"><span>{item.evidence.length} 项证据</span><span className="font-mono">{mission ? formatPaymentAmount(mission.budget, mission.paymentMethod) : '—'}</span></div>
              </button>;
            })}
          </div>
        </aside>

        <main className="min-w-0 p-5 sm:p-7">
          <section className="mesh-grid rounded-2xl bg-ink p-6 text-white sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="font-mono text-[10px] uppercase tracking-[.15em] text-white/35">Proposal · {proposal?.id ?? 'not-created'}</p><h2 className="mt-3 max-w-2xl text-xl font-semibold sm:text-2xl">{selectedMission?.title ?? selectedCase.missionId}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-white/50">{selectedCase.reason}</p></div>
              {proposalMeta ? <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${proposalMeta.className}`}>{proposalMeta.label}</span> : <span className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning">等待创建提案</span>}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-[9px] uppercase tracking-wider text-white/30">Frozen value</p><p className="mt-2 font-mono text-base">{selectedMission ? formatPaymentAmount(selectedMission.budget, selectedMission.paymentMethod) : '—'}</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-[9px] uppercase tracking-wider text-white/30">Electorate</p><p className="mt-2 font-mono text-base">{proposal?.eligibleWeight ?? 0} VOTES</p></div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-[9px] uppercase tracking-wider text-white/30">Voting deadline</p><p className="mt-2 text-xs font-semibold">{proposal ? formatDate(proposal.votingEndsAt) : '提案创建后 72 小时'}</p></div>
            </div>
          </section>

          {loading ? <div className="flex min-h-72 items-center justify-center text-sm text-muted"><LoaderCircle className="mr-2 animate-spin" size={18} />同步治理状态…</div> : !proposal ? <section className="mt-5 rounded-2xl border border-dashed border-line bg-canvas/40 p-8 text-center"><Gavel className="mx-auto text-cyan" size={25} /><h3 className="mt-4 font-semibold">{legacyClosed ? '历史裁决记录' : '该案件尚未进入委员会投票'}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">{legacyClosed ? selectedCase.resolution ?? '该案件在 DAO 仲裁上线前已经关闭，保留原处理轨迹且不会补造投票记录。' : '管理员发起提案后，系统会排除利益相关方并冻结当前委员会名单。已有提案的成员变更不会追溯影响本案。'}</p>{!legacyClosed && canAdminister ? <div className="mx-auto mt-5 max-w-sm text-left"><label><span className="field-label">首轮票权模式</span><select className="field" value={weightMode} onChange={(event) => setWeightMode(event.target.value as typeof weightMode)}><option value="one_person_one_vote">一人一票 · v1</option><option value="power">Power 加权 · v1</option></select></label><p className="mt-2 text-xs leading-5 text-muted">模式和委员 Power 会在创建时冻结，之后不可修改。</p><button type="button" className="btn-primary mt-4 w-full" disabled={busy || !['open', 'reviewing'].includes(selectedCase.status)} onClick={() => void beginReview()}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Vote size={15} />}创建仲裁提案</button></div> : !legacyClosed ? <p className="mt-5 text-xs font-semibold text-warning">等待平台管理员发起治理提案</p> : null}</section> : <>
            <section className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
              <article className="rounded-2xl border border-line p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{proposal.round === 0 ? '首轮' : '上诉轮'}实时计票</h3><p className="mt-1 text-xs text-muted">弃权计入法定人数，但不决定多数方向</p></div><span className="font-mono text-[10px] text-muted">{proposal.weightMode === 'one_person_one_vote' ? '1 MEMBER = 1 VOTE' : 'POWER WEIGHTED'} · {proposal.weightVersion}</span></div>
                <div className="mt-6 space-y-5">
                  {[
                    ['支持退款', proposal.supportVotes, 'bg-cyan'],
                    ['反对退款', proposal.opposeVotes, 'bg-warning'],
                    ['弃权', proposal.abstainVotes, 'bg-muted'],
                  ].map(([label, value, color]) => <div key={String(label)}><div className="flex items-center justify-between text-xs"><span className="font-semibold">{String(label)}</span><span className="font-mono">{Number(value)} · {percent(Number(value), proposal.eligibleWeight)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas"><div className={`h-full rounded-full ${String(color)}`} style={{ width: `${percent(Number(value), proposal.eligibleWeight)}%` }} /></div></div>)}
                </div>
                <div className="mt-6 rounded-xl bg-canvas p-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold">法定人数进度</span><span className="font-mono">{participated} / {proposal.quorumRequired}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-lime" style={{ width: `${percent(participated, proposal.quorumRequired)}%` }} /></div><p className="mt-2 text-[10px] leading-4 text-muted">快照总票权 {proposal.eligibleWeight}，法定人数按 60% 向上取整。</p></div>
                {proposalMeta ? <div className="mt-5 flex items-start gap-3 rounded-xl border border-line p-4"><CheckCircle2 className="mt-0.5 shrink-0 text-cyan" size={17} /><div><p className="text-sm font-semibold">{proposalMeta.label}</p><p className="mt-1 text-xs leading-5 text-muted">{proposalMeta.description}</p></div></div> : null}
              </article>

              <article className="rounded-2xl border border-line p-5 sm:p-6">
                <div className="flex items-center gap-2"><Vote className="text-cyan" size={18} /><h3 className="font-semibold">投出你的票</h3></div>
                {governance?.currentUser.canVote ? <form className="mt-5" onSubmit={castVote}><fieldset><legend className="sr-only">投票选项</legend><div className="space-y-2">{voteOptions.map((option) => <label className={`block cursor-pointer rounded-xl border p-3.5 transition ${voteChoice === option.choice ? option.activeClass : 'border-line hover:bg-canvas/60'}`} key={option.choice}><input className="sr-only" type="radio" name="vote" checked={voteChoice === option.choice} onChange={() => setVoteChoice(option.choice)} /><span className="text-sm font-semibold">{option.title}</span><span className="mt-1 block text-xs text-muted">{option.detail}</span></label>)}</div></fieldset><label className="mt-4 block"><span className="field-label">投票理由</span><textarea className="field min-h-24" value={voteReason} onChange={(event) => setVoteReason(event.target.value)} placeholder="引用任务规格、交付证据或执行事件，至少 12 个字…" /></label><button className="btn-primary mt-4 w-full" type="submit" disabled={busy || voteReason.trim().length < 12}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Vote size={15} />}确认投票 · 提交后不可修改</button></form> : <div className="mt-5 rounded-xl bg-canvas p-5 text-center"><ShieldCheck className="mx-auto text-cyan" size={22} /><p className="mt-3 text-sm font-semibold">{governance?.currentUser.hasVoted ? `你已投：${governance.currentUser.choice ? voteLabel[governance.currentUser.choice] : ''}` : governance?.currentUser.eligible ? '当前投票已结束' : '你不在本提案投票快照中'}</p><p className="mt-2 text-xs leading-5 text-muted">利益相关方会被自动排除；委员会变更不影响已创建提案。</p></div>}
                {canAdminister && proposal.status === 'active' ? <button type="button" className="btn-secondary mt-4 w-full" disabled={busy || !votingEnded} onClick={() => void finalizeVote()}><Clock3 size={15} />{votingEnded ? '结束到期投票' : '截止后可手动定案'}</button> : null}
                {canExecute ? <button type="button" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white" onClick={() => setResolveOpen(true)}><Gavel size={16} />{governance?.execution ? '继续执行队列裁决' : '入队并执行最终裁决'}</button> : null}
                {proposal.status !== 'active' && !governance?.executionReady && governance?.appeal.deadlineAt ? <p className="mt-4 rounded-xl bg-warning/10 p-3 text-xs leading-5 text-warning">上诉窗口开放至 {formatDate(governance.appeal.deadlineAt)}；窗口关闭前不能执行资金动作。</p> : null}
              </article>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-2">
              <article className="rounded-2xl border border-line p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Users size={17} /><h3 className="font-semibold">委员会快照</h3></div><span className="font-mono text-[9px] text-muted">POWER SNAPSHOT</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{governance?.electorate.map((elector) => { const vote = governance.votes.find((item) => item.voterId === elector.userId); return <div className="rounded-xl bg-canvas p-3" key={elector.userId}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold">{elector.displayName}</span><span className={`size-2 rounded-full ${vote ? 'bg-lime' : 'bg-muted/35'}`} /></div><p className="mt-1 font-mono text-[9px] text-muted">票权 {elector.voteWeight} · Power {elector.powerSnapshot}</p></div>; })}</div></article>
              <article className="rounded-2xl border border-line p-5"><div className="flex items-center gap-2"><History size={17} /><h3 className="font-semibold">公开投票记录</h3></div>{governance?.votes.length ? <div className="mt-4 space-y-3">{governance.votes.map((vote) => <div className="rounded-xl border border-line p-3.5" key={vote.id}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{vote.voterDisplayName}</p><span className="rounded-full bg-canvas px-2 py-1 text-[10px] font-semibold">{voteLabel[vote.choice]}</span></div><p className="mt-2 text-xs leading-5 text-muted">{vote.reason}</p><p className="mt-2 font-mono text-[9px] text-muted/70">{formatDate(vote.createdAt)}</p></div>)}</div> : <p className="mt-5 text-xs text-muted">尚无投票记录。</p>}</article>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-2">
              <article className="rounded-2xl border border-line p-5"><div className="flex items-center gap-2"><Scale size={17} /><h3 className="font-semibold">一次上诉</h3></div>{governance?.appeal.canAppeal ? <form className="mt-4" onSubmit={submitAppeal}><p className="text-xs leading-5 text-muted">上诉会保留首轮记录，并要求至少新增一名无利益冲突委员。</p><label className="mt-3 block"><span className="field-label">上诉理由</span><textarea className="field min-h-24" value={appealReason} onChange={(event) => setAppealReason(event.target.value)} placeholder="说明首轮裁决需要复核的事实或程序问题，至少 20 个字…" /></label><button className="btn-secondary mt-3 w-full" type="submit" disabled={busy || appealReason.trim().length < 20}>创建扩大委员上诉提案</button></form> : <div className="mt-4 rounded-xl bg-canvas p-4 text-xs leading-5 text-muted">{governance?.appeal.used ? `本案已使用上诉：${governance.appeal.reason ?? '已创建上诉提案'}` : governance?.appeal.deadlineAt ? `上诉期限：${formatDate(governance.appeal.deadlineAt)}` : '首轮定案后开放 72 小时上诉窗口。'}</div>}</article>
              <article className="rounded-2xl border border-line p-5"><div className="flex items-center gap-2"><History size={17} /><h3 className="font-semibold">不可变轮次历史</h3></div><div className="mt-4 space-y-3">{governance?.rounds.map((round) => <div className="rounded-xl border border-line p-3.5" key={round.proposal.id}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold">{round.proposal.round === 0 ? '首轮提案' : '上诉提案'}</p><span className="font-mono text-[9px] text-muted">{round.proposal.weightVersion}</span></div><p className="mt-2 text-xs text-muted">委员 {round.electorate.length} · 总票权 {round.proposal.eligibleWeight} · 已投 {round.votes.length}</p>{round.proposal.appealReason ? <p className="mt-2 text-xs leading-5 text-muted">{round.proposal.appealReason}</p> : null}</div>)}</div>{governance?.execution ? <div className="mt-4 rounded-xl border border-cyan/25 bg-cyan/[0.06] p-3"><p className="text-xs font-semibold text-cyan">执行队列 · {governance.execution.status}</p><p className="mt-1 break-all font-mono text-[9px] text-muted">{governance.execution.payloadHash}</p></div> : null}</article>
            </section>
          </>}

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <article className="rounded-2xl border border-line p-5"><div className="flex items-center gap-2"><FileSearch size={17} /><h3 className="font-semibold">案件证据</h3></div>{selectedCase.evidence.length ? <ul className="mt-4 space-y-2">{selectedCase.evidence.map((item) => <li key={`${item.label}-${item.uri}`}><a className="flex items-center gap-2 text-xs text-muted hover:text-cyan" href={item.uri} target="_blank" rel="noreferrer"><CheckCircle2 size={14} className="text-cyan" />{item.label}</a></li>)}</ul> : <p className="mt-4 text-xs leading-5 text-muted">没有外部附件；可在关联任务中核对规格、执行事件和交付哈希。</p>}<Link className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan" to={`/missions/${selectedCase.missionId}/acceptance`}>查看任务与交付 <ArrowRight size={13} /></Link></article>
            <article className="rounded-2xl border border-line p-5"><div className="flex items-center gap-2"><History size={17} /><h3 className="font-semibold">执行轨迹</h3></div>{actions.length ? <ol className="mt-4 space-y-4 border-l border-line pl-4">{actions.map((item) => <li className="relative" key={item.id}><span className="absolute -left-[21px] top-1 size-2 rounded-full bg-cyan" /><p className="text-xs font-semibold">{actionLabel(item.action)}</p><p className="mt-1 font-mono text-[9px] text-muted">{item.actorId} · {formatDate(item.createdAt)}</p>{item.note ? <p className="mt-2 text-xs leading-5 text-muted">{item.note}</p> : null}</li>)}</ol> : <p className="mt-4 text-xs text-muted">尚无治理执行记录。</p>}</article>
          </section>
        </main>
      </div> : <section className="panel py-16 text-center"><Scale className="mx-auto text-cyan" size={25} /><h2 className="mt-5 text-lg font-semibold">当前没有争议提案</h2><p className="mt-2 text-sm text-muted">从任务验收页发起争议后，冻结状态和治理提案会出现在这里。</p></section>}

      {selectedCase && canExecute ? <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title={`执行裁决 · ${selectedCase.id}`} description={selectedMission && isWeb3Payment(selectedMission.paymentMethod) ? '提案已经定案；管理员钱包将执行链上交易，Worker 核验后更新案件。' : '提案已经定案；Web2 结算会原子更新托管账本。'}><form onSubmit={submitResolution}><div className="rounded-xl border border-cyan/25 bg-cyan/[0.06] p-4"><p className="text-xs font-semibold text-cyan">DAO 授权结果</p><p className="mt-2 text-sm font-semibold">{decision === 'resolved' ? '支持争议方退款' : '驳回争议并恢复任务'}</p><p className="mt-1 text-xs leading-5 text-muted">执行结果已锁定，不能在此更改投票裁决。</p></div><label className="mt-5 block"><span className="field-label">执行说明</span><textarea className="field min-h-28" value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="引用提案结果和关键证据，至少 20 个字…" /></label>{rationale.length > 0 && rationale.trim().length < 20 ? <p className="mt-2 flex items-center gap-1 text-xs text-danger"><AlertTriangle size={13} />至少输入 20 个字</p> : null}<div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setResolveOpen(false)}>取消</button><button type="submit" className="btn-primary" disabled={busy || rationale.trim().length < 20}>{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Gavel size={15} />}{selectedMission && isWeb3Payment(selectedMission.paymentMethod) ? decision === 'resolved' ? '链上退款并结案' : '链上解冻并驳回' : '执行余额裁决'}</button></div>{error ? <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}</form></Modal> : null}
    </div>
  );
}
