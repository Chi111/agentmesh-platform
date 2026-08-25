import { ArrowLeft, ArrowRight, CheckCircle2, Database, LoaderCircle, LockKeyhole, RefreshCw, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { WorkflowGraphEditor } from '../components/workflow/WorkflowGraphEditor';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useMission } from '../hooks/useMission';
import { useAppStore } from '../store/useAppStore';
import type { WorkflowEdge, WorkflowStage, WorkflowViewport } from '../types/domain';
import { formatPaymentAmount, isWeb3Payment, paymentToken } from '../utils/payments';

export function WorkflowPage() {
  const navigate = useNavigate();
  const { missionId: routeMissionId = '' } = useParams();
  const mission = useMission();
  const missionId = mission?.id ?? routeMissionId;
  const { onchainSettlement, depositEscrow, linkedWalletAddress, walletAddress, linkWallet } = useAuth();
  const agents = useAppStore((state) => state.agents);
  const candidateMatches = useAppStore((state) => state.candidateMatches[missionId]) ?? [];
  const detail = useAppStore((state) => state.missionDetails[missionId]);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const loadCandidates = useAppStore((state) => state.loadCandidates);
  const compileWorkflow = useAppStore((state) => state.compileWorkflow);
  const saveWorkflowDraft = useAppStore((state) => state.saveWorkflowDraft);
  const confirmWorkflow = useAppStore((state) => state.confirmWorkflow);
  const startMission = useAppStore((state) => state.startMission);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!missionId) return;
    if (!detail) void loadMissionDetail(missionId).catch((reason) => setError(reason instanceof Error ? reason.message : '工作流加载失败。'));
    void loadCandidates(missionId).catch(() => undefined);
  }, [detail, loadCandidates, loadMissionDetail, missionId]);

  if (!mission) {
    return <section className="panel py-16 text-center"><p className="text-sm font-semibold">正在加载任务，或任务不存在</p><Link className="btn-secondary mt-5" to="/missions">返回任务列表</Link></section>;
  }

  if (!detail) {
    return <div className="space-y-7"><PageHeader eyebrow="Visual Orchestration" title="DAG 工作流编排" description="正在读取节点、连线与候选 Agent。" /><section className="panel py-16 text-center">{error ? <p className="text-sm text-danger">{error}</p> : <><LoaderCircle size={24} className="mx-auto animate-spin text-cyan" /><p className="mt-3 text-sm text-muted">同步工作流中…</p></>}</section></div>;
  }

  const taskStages = detail.stages.filter((stage) => stage.nodeType === 'task');
  const offerByStage = new Map(detail.offers.map((offer) => [offer.stageId, offer]));
  const allAccepted = taskStages.length > 0 && taskStages.every((stage) => offerByStage.get(stage.id)?.status === 'accepted');
  const acceptedCount = taskStages.filter((stage) => offerByStage.get(stage.id)?.status === 'accepted').length;
  const locked = detail.escrow?.status !== 'pending' || !['draft', 'matching'].includes(mission.status);
  const web3PaymentMethod = isWeb3Payment(mission.paymentMethod) ? mission.paymentMethod : null;
  const usesWeb3 = web3PaymentMethod !== null;
  const token = paymentToken(mission.paymentMethod);

  const execute = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await action(); } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请稍后重试。');
      throw reason;
    } finally { setBusy(false); }
  };

  const refresh = async () => {
    setRefreshing(true);
    setError('');
    try { await loadMissionDetail(mission.id); } catch (reason) { setError(reason instanceof Error ? reason.message : '刷新失败。'); } finally { setRefreshing(false); }
  };

  const save = (stages: WorkflowStage[], edges: WorkflowEdge[], viewport: WorkflowViewport) => execute(() => saveWorkflowDraft(mission.id, stages, edges, viewport));
  const compile = () => execute(() => compileWorkflow(mission.id));
  const confirm = () => execute(() => confirmWorkflow(mission.id));

  const confirmEscrow = async () => {
    await execute(async () => {
      if (usesWeb3 && !onchainSettlement) throw new Error('Sepolia 托管合约尚未配置，暂时不能启动该 Web3 任务。');
      const recipients = web3PaymentMethod ? taskStages.map((stage) => {
        const wallet = agents.find((agent) => agent.id === stage.agentId)?.wallet;
        if (!wallet) throw new Error(`“${stage.name}”对应 Agent 尚未配置结算钱包。`);
        return { address: wallet, weight: stage.budget };
      }) : [];
      const depositTxHash = web3PaymentMethod
        ? await depositEscrow(mission.id, mission.budget, web3PaymentMethod, recipients)
        : null;
      await startMission(mission.id, depositTxHash);
      setStartOpen(false);
      navigate(`/missions/${mission.id}/execution`);
    });
  };

  const openWalletLink = () => {
    setError('');
    flushSync(() => setStartOpen(false));
    void linkWallet().catch((reason) => setError(reason instanceof Error ? reason.message : '钱包连接失败。'));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="panel flex shrink-0 items-center gap-3 px-3 py-2.5 sm:px-4">
        <Link className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:bg-canvas hover:text-ink" to="/missions" aria-label="返回任务列表"><ArrowLeft size={17} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink sm:text-lg">DAG 工作流编排</h1>
            <span className="mono-chip hidden sm:inline-flex">DAG v{mission.workflowVersion}</span>
            {locked ? <StatusBadge tone="info">已锁定</StatusBadge> : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted"><span className="font-semibold text-ink">{mission.title}</span><span className="mx-1.5 text-line">/</span>拖拽连接依赖，手动分配 Agent</p>
        </div>
        <div className="hidden items-center gap-2 lg:flex"><span className="rounded-lg bg-canvas px-3 py-2 text-[10px] text-muted">画布拖动 · 按钮缩放 · 托管后锁图</span></div>
      </header>

      {error ? <p className="shrink-0 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">{error}</p> : null}

      <div className="min-h-0 flex-1">
        <WorkflowGraphEditor
          mission={mission}
          stages={detail.stages}
          edges={detail.edges}
          agents={agents}
          candidateMatches={candidateMatches}
          offers={detail.offers}
          locked={locked}
          busy={busy}
          onCompile={compile}
          onSave={save}
          onConfirm={confirm}
        />
      </div>

      <section className="panel flex shrink-0 items-center gap-3 px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h2 className="text-xs font-semibold sm:text-sm">邀请与托管</h2><StatusBadge tone={allAccepted ? 'success' : detail.offers.length ? 'warning' : 'neutral'}>{allAccepted ? '全部接单' : detail.offers.length ? `已接单 ${acceptedCount}/${taskStages.length}` : '尚未发送'}</StatusBadge></div>
          <p className="mt-1 truncate text-[10px] text-muted sm:text-xs">任务节点预算 {formatPaymentAmount(mission.budget, mission.paymentMethod)}；Gate 不参与分账，任务 Agent 接单后启动并行调度。</p>
        </div>
        {detail.offers.length && !allAccepted ? <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-canvas hover:text-ink" aria-label="刷新接单状态" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button> : null}
        <button type="button" className="btn-primary !min-h-9 shrink-0 !px-3 !py-1.5 !text-xs" disabled={!allAccepted || locked} onClick={() => setStartOpen(true)}><span className="hidden sm:inline">确认托管并启动</span><span className="sm:hidden">启动</span><ArrowRight size={15} /></button>
      </section>

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title="确认托管并启动 DAG" description={usesWeb3 ? `钱包将把 ${token} 存入 Sepolia 托管合约；根节点会并行派发。` : '平台将锁定 Web2 余额；所有就绪根节点会写入派发队列。'}>
        <div className="rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-sm font-semibold">{usesWeb3 ? <WalletCards size={17} /> : <Database size={17} />}{usesWeb3 ? walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : linkedWalletAddress ? '钱包连接已中断' : '需要关联 EVM 钱包' : 'Web2 充值余额'}</span><span className="mono-chip">{usesWeb3 ? 'SEPOLIA' : 'BALANCE'}</span></div>
          <p className="mt-3 font-mono text-xl font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</p>
          <p className="mt-3 text-xs leading-5 text-muted"><LockKeyhole size={14} className="mr-1.5 inline text-cyan" />启动后节点、连线、预算和 Agent 全部锁定。</p>
          {!usesWeb3 ? <Link className="mt-3 inline-flex text-xs font-semibold text-cyan" to="/wallet/test-funds">余额不足？领取测试充值</Link> : null}
        </div>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setStartOpen(false)}>取消</button>{usesWeb3 && !walletAddress && !linkedWalletAddress ? <button type="button" className="btn-signal" onClick={openWalletLink}>关联钱包</button> : <button type="button" className="btn-primary" onClick={() => void confirmEscrow().catch(() => undefined)} disabled={busy || (usesWeb3 && !onchainSettlement)}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{usesWeb3 ? `托管 ${token} 并启动` : '余额扣款并启动'}</button>}</div>
      </Modal>
    </div>
  );
}
