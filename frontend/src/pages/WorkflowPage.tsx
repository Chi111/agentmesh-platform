import { ArrowLeft, ArrowRight, CheckCircle2, CircleDollarSign, Clock3, Database, GitBranch, LoaderCircle, LockKeyhole, RefreshCw, Send, Sparkles, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AgentAvatar } from '../components/ui/AgentCard';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useMission } from '../hooks/useMission';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount, isWeb3Payment, paymentToken } from '../utils/payments';

export function WorkflowPage() {
  const navigate = useNavigate();
  const mission = useMission();
  const missionId = mission?.id ?? '';
  const { onchainSettlement, depositEscrow, walletAddress, linkWallet } = useAuth();
  const agents = useAppStore((state) => state.agents);
  const storedStages = useAppStore((state) => state.missionStages[missionId]);
  const stages = storedStages ?? [];
  const detail = useAppStore((state) => state.missionDetails[missionId]);
  const selectedAgents = useAppStore((state) => state.selectedAgents);
  const confirmWorkflow = useAppStore((state) => state.confirmWorkflow);
  const startMission = useAppStore((state) => state.startMission);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const [mode, setMode] = useState<'overview' | 'contracts'>('overview');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const platformFee = (mission?.budget ?? 0) * 0.004;
  const web3PaymentMethod = mission && isWeb3Payment(mission.paymentMethod) ? mission.paymentMethod : null;
  const usesWeb3 = web3PaymentMethod !== null;
  const token = mission ? paymentToken(mission.paymentMethod) : 'CREDIT';

  useEffect(() => {
    if (!missionId || detail) return;
    void loadMissionDetail(missionId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : '工作流加载失败。'));
  }, [detail, loadMissionDetail, missionId]);

  if (!mission) {
    return <section className="panel py-16 text-center"><p className="text-sm font-semibold">正在加载任务，或任务不存在</p><Link className="btn-secondary mt-5" to="/missions">返回任务列表</Link></section>;
  }

  const refreshOffers = async () => {
    setRefreshing(true);
    setError('');
    try {
      await loadMissionDetail(mission.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '接单状态刷新失败。');
    } finally {
      setRefreshing(false);
    }
  };

  if (!detail) {
    return <div className="space-y-7"><PageHeader eyebrow="Plan → Contract" title="确认执行工作流" description="正在读取阶段分配与接单状态。" actions={<Link className="btn-secondary" to={`/missions/${mission.id}/team`}><ArrowLeft size={16} />返回候选团队</Link>} /><section className="panel py-16 text-center">{error ? <><p className="text-sm font-semibold text-danger" role="alert">{error}</p><button type="button" className="btn-secondary mt-5" onClick={() => void refreshOffers()} disabled={refreshing}>{refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}重试</button></> : <><LoaderCircle size={24} className="mx-auto animate-spin text-cyan" /><p className="mt-3 text-sm text-muted">正在同步当前工作流…</p></>}</section></div>;
  }

  const offers = detail.offers;
  const offerByStage = new Map(offers.map((offer) => [offer.stageId, offer]));
  const hasOffers = offers.length > 0;
  const assignmentsChanged = hasOffers && stages.some((stage) => {
    const selected = selectedAgents[stage.id];
    return Boolean(selected && selected !== stage.agentId);
  });
  const canReissue = assignmentsChanged || offers.some((offer) => offer.status === 'declined' || offer.status === 'expired');
  const allAccepted = stages.length > 0 && !assignmentsChanged && stages.every((stage) => offerByStage.get(stage.id)?.status === 'accepted');
  const acceptedCount = stages.filter((stage) => offerByStage.get(stage.id)?.status === 'accepted').length;
  const agentForStage = (stageId: string, assignedAgentId: string | null) => {
    const agentId = canReissue || !hasOffers ? selectedAgents[stageId] ?? assignedAgentId : assignedAgentId;
    return agents.find((item) => item.id === agentId);
  };

  const sendOffers = async () => {
    setSubmitting(true);
    setError('');
    try {
      await confirmWorkflow(mission.id);
      setConfirmOpen(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '阶段邀请发送失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmEscrow = async () => {
    setSubmitting(true);
    setError('');
    try {
      if (usesWeb3 && !onchainSettlement) {
        throw new Error('Sepolia 托管合约尚未配置，暂时不能启动该 Web3 任务。');
      }
      const recipients = web3PaymentMethod ? stages.map((stage) => {
        const wallet = agents.find((agent) => agent.id === stage.agentId)?.wallet;
        if (!wallet) throw new Error(`“${stage.name}”对应 Agent 尚未配置结算钱包。`);
        return { address: wallet, weight: stage.budget };
      }) : [];
      const depositTxHash = web3PaymentMethod
        ? await depositEscrow(mission.id, mission.budget, web3PaymentMethod, recipients)
        : null;
      await startMission(mission.id, depositTxHash);
      setConfirmOpen(false);
      navigate(`/missions/${mission.id}/execution`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '工作流启动失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Plan → Contract"
        title="确认执行工作流"
        description="平台已根据阶段输入输出契约连接 Agent。你可以使用推荐顺序，也可以在提交托管前调整。"
        actions={<Link className="btn-secondary" to={`/missions/${mission.id}/team`}><ArrowLeft size={16} />返回候选团队</Link>}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="mesh-grid rounded-2xl border border-white/10 bg-ink p-5 text-white md:p-7">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex items-center gap-2 text-cyan"><GitBranch size={18} /><span className="eyebrow !text-cyan">Live Mesh</span></div><h2 className="mt-2 text-lg font-semibold">TASK WORKFLOW / {mission.id}</h2></div>
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              <button type="button" className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === 'overview' ? 'bg-cyan text-ink' : 'text-white/50'}`} onClick={() => setMode('overview')}>执行顺序</button>
              <button type="button" className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === 'contracts' ? 'bg-cyan text-ink' : 'text-white/50'}`} onClick={() => setMode('contracts')}>接口契约</button>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {stages.map((stage, index) => {
              const agent = agentForStage(stage.id, stage.agentId) ?? agents[index];
              const offer = offerByStage.get(stage.id);
              if (!agent) return <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-white/45" key={stage.id}>“{stage.name}”尚未分配可用 Agent，请返回候选团队完成选择。</div>;
              return (
                <div className="relative" key={stage.id}>
                  <article className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full border border-cyan/30 bg-cyan/10 font-mono text-[9px] text-cyan">0{index + 1}</span>
                      <AgentAvatar agent={agent} />
                    </div>
                    <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{stage.name}</p>{assignmentsChanged && selectedAgents[stage.id] !== stage.agentId ? <StatusBadge tone="warning">待重发</StatusBadge> : offer ? <StatusBadge tone={offer.status === 'accepted' ? 'success' : offer.status === 'pending' ? 'info' : 'danger'}>{offer.status === 'accepted' ? '已接单' : offer.status === 'pending' ? '待响应' : offer.status === 'declined' ? '已拒绝' : '已过期'}</StatusBadge> : null}</div><p className="mt-1 text-xs leading-5 text-white/45">{agent.name} · {stage.purpose}</p><div className="mt-3 flex flex-wrap gap-2">{mode === 'contracts' ? <><span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] text-white/40">INPUT · JSON</span><span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] text-white/40">OUTPUT · SIGNED CALLBACK</span></> : <><span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] text-white/40">{stage.category.toUpperCase()}</span><span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] text-white/40">SEQUENTIAL</span></>}</div></div>
                    <div className="text-left md:text-right"><p className="font-mono text-sm font-semibold text-white">{formatPaymentAmount(stage.budget, mission.paymentMethod)}</p><p className="mt-1 text-[10px] text-white/35">上限 · {agent.responseTime}</p></div>
                  </article>
                  {index < stages.length - 1 ? <div className="ml-9 flex h-8 items-center border-l border-dashed border-cyan/35 pl-4 text-[9px] text-cyan/60">SIGNED OUTPUT → NEXT INPUT</div> : null}
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-lime/20 bg-lime/[0.06] p-4">
            <div className="flex gap-3"><Sparkles size={18} className="shrink-0 text-lime" /><div><p className="text-sm font-semibold">编排检查通过</p><p className="mt-1 text-xs leading-5 text-white/45">阶段输入输出兼容，失败重试预算已预留，最终交付物定义完整。</p></div></div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="panel p-5">
            <div className="flex items-center gap-2"><CircleDollarSign size={18} /><h2 className="font-semibold">执行合约</h2></div>
            <div className="mt-5 rounded-xl bg-canvas p-4 text-center"><p className="text-xs text-muted">任务托管总额</p><p className="mt-2 font-mono text-3xl font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</p></div>
            <dl className="mt-5 space-y-3 text-sm">
              {stages.map((stage) => <div className="flex justify-between" key={stage.id}><dt className="text-muted">{stage.name}</dt><dd className="font-mono text-xs font-semibold">{formatPaymentAmount(stage.budget, mission.paymentMethod)}</dd></div>)}
              <div className="flex justify-between border-t border-line pt-3"><dt className="text-muted">平台费 0.4%</dt><dd className="font-mono text-xs font-semibold">{formatPaymentAmount(platformFee, mission.paymentMethod)}</dd></div>
            </dl>
            <div className="mt-5 rounded-xl border border-cyan/20 bg-cyan/[0.06] p-3 text-xs leading-5 text-muted"><LockKeyhole size={14} className="mr-1.5 inline text-cyan" />资金按阶段验收释放；争议期间自动冻结。</div>
            {hasOffers && !canReissue ? <div className="mt-5 rounded-xl border border-line bg-canvas p-3 text-xs text-muted"><div><Clock3 size={14} className="mr-1.5 inline text-cyan" />已接单 {acceptedCount}/{stages.length}；全部接受后才可托管启动。</div>{!allAccepted ? <button type="button" className="mt-3 inline-flex items-center gap-1.5 font-semibold text-cyan" onClick={() => void refreshOffers()} disabled={refreshing}>{refreshing ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}刷新接单状态</button> : null}</div> : null}
            <button type="button" className="btn-primary mt-5 w-full" onClick={() => setConfirmOpen(true)} disabled={hasOffers && !canReissue && !allAccepted}>{allAccepted ? <>确认托管并启动 <ArrowRight size={16} /></> : hasOffers ? <><Send size={16} />重新发送阶段邀请</> : <><Send size={16} />发送阶段邀请</>}</button>
            {error && !confirmOpen ? <p className="mt-3 text-xs text-danger" role="alert">{error}</p> : null}
          </section>

          <section className="panel p-5"><p className="eyebrow">Contract Guardrails</p><ul className="mt-4 space-y-3 text-xs text-muted">{['超时自动进入重试队列', '每阶段输出包含签名证据', '失败预算不会自动释放', '全流程事件可导出审计'].map((item) => <li className="flex items-center gap-2" key={item}><CheckCircle2 size={14} className="text-cyan" />{item}</li>)}</ul></section>
        </aside>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={allAccepted ? '确认托管并启动执行' : '发送阶段接单邀请'} description={allAccepted ? usesWeb3 ? `钱包将把 ${token} 存入 Sepolia 托管合约，Worker 验证事件后启动执行。` : '将从 Web2 充值余额中锁定任务预算；余额不足时可前往测试充值页领取。' : '每个阶段的 Agent 将收到独立邀请，并在 24 小时内接受或拒绝；全部接受前不会锁定资金。'}>
        {!allAccepted ? <div className="space-y-2 rounded-xl border border-line bg-canvas p-4">{stages.map((stage) => { const agent = agentForStage(stage.id, stage.agentId); return <div className="flex items-center justify-between gap-3 text-sm" key={stage.id}><span>{stage.name}</span><span className="font-semibold">{agent?.name ?? '未选择 Agent'}</span></div>; })}</div> : null}
        {allAccepted ? <>
        <div className="rounded-xl border border-line bg-canvas p-4"><div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-sm font-semibold">{usesWeb3 ? <WalletCards size={17} /> : <Database size={17} />}{usesWeb3 ? walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : '需要关联 EVM 钱包' : 'Web2 充值余额'}</span><span className="mono-chip">{usesWeb3 ? 'SEPOLIA' : 'BALANCE'}</span></div><p className="mt-3 font-mono text-xl font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</p>{!usesWeb3 ? <Link className="mt-3 inline-flex text-xs font-semibold text-cyan" to="/wallet/test-funds">余额不足？领取测试充值</Link> : null}</div>
        </> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => setConfirmOpen(false)}>取消</button>
          {!allAccepted ? <button type="button" className="btn-primary" onClick={() => void sendOffers()} disabled={submitting}>{submitting ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}确认并发送</button> : usesWeb3 && !walletAddress ? <button type="button" className="btn-signal" onClick={() => void linkWallet()}>关联钱包</button> : <button type="button" className="btn-primary" onClick={() => void confirmEscrow()} disabled={submitting || (usesWeb3 && !onchainSettlement)}>{submitting ? <LoaderCircle size={16} className="animate-spin" /> : null}{usesWeb3 ? `托管 ${token} 并启动` : '余额扣款并启动'}</button>}
        </div>
        {error ? <p className="mt-3 rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      </Modal>
    </div>
  );
}
