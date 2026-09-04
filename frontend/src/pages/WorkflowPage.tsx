import { ArrowLeft, ArrowRight, CheckCircle2, Database, Library, LoaderCircle, LockKeyhole, RefreshCw, WalletCards } from 'lucide-react';
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
import { api } from '../services/api';
import { shortWalletAddress } from '../services/ens';
import type { WorkflowEdge, WorkflowStage, WorkflowTemplateDetail, WorkflowViewport } from '../types/domain';
import { formatPaymentAmount, isWeb3Payment, paymentToken } from '../utils/payments';

export function WorkflowPage() {
  const navigate = useNavigate();
  const { missionId: routeMissionId = '' } = useParams();
  const mission = useMission();
  const missionId = mission?.id ?? routeMissionId;
  const { onchainSettlement, depositEscrow, linkedWalletAddress, walletAddress, ensName, linkWallet } = useAuth();
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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplateDetail[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateIterations, setTemplateIterations] = useState(1);
  const [templateBudget, setTemplateBudget] = useState('');
  const [templateMode, setTemplateMode] = useState<'replace' | 'attach'>('replace');
  const [attachAfterStageId, setAttachAfterStageId] = useState('');
  const [attachBeforeStageId, setAttachBeforeStageId] = useState('');
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
  const fundingAmount = detail.escrow?.amount ?? mission.budget;
  const platformFeeRate = detail.escrow?.platformFeeRate ?? 0.004;
  const quoteTotal = Number(detail.offers.reduce((sum, offer) => {
    const stage = taskStages.find((candidate) => candidate.id === offer.stageId);
    return sum + ((offer.quote?.amount ?? 0) > 0 ? offer.quote!.amount : stage?.budget ?? 0);
  }, 0).toFixed(mission.paymentMethod === 'web3_seth' ? 6 : 2));

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

  const openTemplates = async () => {
    setTemplatesOpen(true);
    setTemplateBudget(String(mission.budget));
    try {
      const available = await api.listWorkflowTemplates();
      setTemplates(available);
      setSelectedTemplateId((current) => current || available[0]?.template.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模板加载失败。');
    }
  };

  const saveTemplate = () => execute(async () => {
    if (templateName.trim().length < 2) throw new Error('模板名称至少需要 2 个字符。');
    const saved = await api.saveWorkflowTemplate({
      missionId: mission.id,
      name: templateName.trim(),
      description: templateDescription.trim(),
    });
    const available = await api.listWorkflowTemplates();
    setTemplates(available);
    setSelectedTemplateId(saved.template.id);
    setTemplateName('');
    setTemplateDescription('');
  });

  const expandTemplate = () => execute(async () => {
    if (!selectedTemplateId) throw new Error('请先选择一个模板。');
    const budget = Number(templateBudget);
    if (!Number.isFinite(budget) || budget <= 0) throw new Error('请输入有效的模板预算。');
    if (templateMode === 'attach' && !attachAfterStageId && !attachBeforeStageId) throw new Error('插入模式至少选择一个连接节点。');
    await api.expandWorkflowTemplate(mission.id, {
      templateId: selectedTemplateId,
      iterations: templateIterations,
      budget,
      workflowVersion: mission.workflowVersion,
      replace: templateMode === 'replace',
      ...(templateMode === 'attach' && attachAfterStageId ? { attachAfterStageId } : {}),
      ...(templateMode === 'attach' && attachBeforeStageId ? { attachBeforeStageId } : {}),
    });
    await Promise.all([loadMissionDetail(mission.id), loadCandidates(mission.id)]);
    setTemplatesOpen(false);
  });

  const confirmEscrow = async () => {
    await execute(async () => {
      if (usesWeb3 && !onchainSettlement) throw new Error('Sepolia 托管合约尚未配置，暂时不能启动该 Web3 任务。');
      const recipients = web3PaymentMethod ? taskStages.map((stage) => {
        const wallet = agents.find((agent) => agent.id === stage.agentId)?.wallet;
        if (!wallet) throw new Error(`“${stage.name}”对应 Agent 尚未配置结算钱包。`);
        const quote = offerByStage.get(stage.id)?.quote?.amount;
        return { address: wallet, weight: quote && quote > 0 ? quote : stage.budget };
      }) : [];
      const depositTxHash = web3PaymentMethod
        ? await depositEscrow(mission.id, fundingAmount, web3PaymentMethod, recipients)
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
        <button type="button" className="btn-secondary !min-h-9 shrink-0 !px-3 !py-1.5 !text-xs" onClick={() => void openTemplates()} disabled={locked || busy}><Library size={14} /><span className="hidden sm:inline">模板与循环</span></button>
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
          <p className="mt-1 truncate text-[10px] text-muted sm:text-xs">预算上限 {formatPaymentAmount(mission.budget, mission.paymentMethod)}{detail.offers.length ? `；当前锁定报价 ${formatPaymentAmount(quoteTotal, mission.paymentMethod)}` : '；确认邀请后锁定动态报价'}。</p>
        </div>
        {detail.offers.length && !allAccepted ? <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-canvas hover:text-ink" aria-label="刷新接单状态" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button> : null}
        <button type="button" className="btn-primary !min-h-9 shrink-0 !px-3 !py-1.5 !text-xs" disabled={!allAccepted || locked} onClick={() => setStartOpen(true)}><span className="hidden sm:inline">确认托管并启动</span><span className="sm:hidden">启动</span><ArrowRight size={15} /></button>
      </section>

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title="确认托管并启动 DAG" description={usesWeb3 ? `钱包将把 ${token} 存入 Sepolia 托管合约；根节点会并行派发。` : '平台将锁定 Web2 余额；所有就绪根节点会写入派发队列。'}>
        <div className="rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-center justify-between"><span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold">{usesWeb3 ? <WalletCards className="shrink-0" size={17} /> : <Database className="shrink-0" size={17} />}<span className="truncate">{usesWeb3 ? walletAddress ? ensName ?? shortWalletAddress(walletAddress) : linkedWalletAddress ? ensName ? `${ensName} · 钱包连接已中断` : '钱包连接已中断' : '需要关联 EVM 钱包' : 'Web2 充值余额'}</span></span><span className="mono-chip">{usesWeb3 ? 'SEPOLIA' : 'BALANCE'}</span></div>
          <p className="mt-3 font-mono text-xl font-semibold">{formatPaymentAmount(fundingAmount, mission.paymentMethod)}</p>
          <dl className="mt-3 space-y-2 border-t border-line pt-3 text-xs"><div className="flex justify-between"><dt className="text-muted">原预算上限</dt><dd className="font-mono">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</dd></div><div className="flex justify-between"><dt className="text-muted">内含协议费</dt><dd className="font-mono">{formatPaymentAmount(fundingAmount * platformFeeRate, mission.paymentMethod)}</dd></div><div className="flex justify-between"><dt className="text-muted">未锁定余额</dt><dd className="font-mono">{formatPaymentAmount(Math.max(0, mission.budget - fundingAmount), mission.paymentMethod)}</dd></div></dl>
          <p className="mt-3 text-xs leading-5 text-muted"><LockKeyhole size={14} className="mr-1.5 inline text-cyan" />只锁定已接受报价；启动后节点、报价版本、预算和 Agent 全部固定。</p>
          {!usesWeb3 ? <Link className="mt-3 inline-flex text-xs font-semibold text-cyan" to="/wallet/test-funds">余额不足？领取测试充值</Link> : null}
        </div>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setStartOpen(false)}>取消</button>{usesWeb3 && !walletAddress && !linkedWalletAddress ? <button type="button" className="btn-signal" onClick={openWalletLink}>关联钱包</button> : <button type="button" className="btn-primary" onClick={() => void confirmEscrow().catch(() => undefined)} disabled={busy || (usesWeb3 && !onchainSettlement)}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{usesWeb3 ? `托管 ${token} 并启动` : '余额扣款并启动'}</button>}</div>
      </Modal>

      <Modal open={templatesOpen} onClose={() => setTemplatesOpen(false)} title="工作流模板与静态循环" description="保存当前已落盘的 DAG，或在托管前把模板静态展开 1–5 次。">
        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-canvas/50 p-4">
            <h3 className="text-sm font-semibold">保存当前版本</h3>
            <p className="mt-1 text-[10px] leading-4 text-muted">同名且内容变化时创建新版本；完全相同的内容不会重复写入。</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="field-label">模板名称</span><input className="field" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如：研究交付链" /></label><label><span className="field-label">说明</span><input className="field" value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="适用场景与约束" /></label></div>
            <button type="button" className="btn-secondary mt-3 !text-xs" onClick={() => void saveTemplate().catch(() => undefined)} disabled={busy}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Library size={14} />}保存私有模板</button>
          </section>

          <section className="rounded-xl border border-line p-4">
            <h3 className="text-sm font-semibold">展开模板</h3>
            {templates.length ? <div className="mt-3 space-y-3">
              <label><span className="field-label">模板</span><select className="field" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>{templates.map((detail) => <option value={detail.template.id} key={detail.template.id}>{detail.template.name} · v{detail.version.version} · {detail.version.nodes.length} 节点</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3"><label><span className="field-label">静态次数</span><select className="field" value={templateIterations} onChange={(event) => setTemplateIterations(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} 次</option>)}</select></label><label><span className="field-label">模板预算</span><input className="field font-mono" type="number" min="0" step="0.01" value={templateBudget} onChange={(event) => setTemplateBudget(event.target.value)} /></label></div>
              <div><span className="field-label">模式</span><div className="grid grid-cols-2 gap-2"><button type="button" className={`rounded-xl border p-3 text-left text-xs ${templateMode === 'replace' ? 'border-cyan bg-cyan/5' : 'border-line'}`} onClick={() => setTemplateMode('replace')}><strong className="block">替换画布</strong><span className="mt-1 block text-[10px] text-muted">模板使用全部任务预算</span></button><button type="button" className={`rounded-xl border p-3 text-left text-xs ${templateMode === 'attach' ? 'border-cyan bg-cyan/5' : 'border-line'}`} onClick={() => setTemplateMode('attach')}><strong className="block">插入现有 DAG</strong><span className="mt-1 block text-[10px] text-muted">原节点预算自动按比例调整</span></button></div></div>
              {templateMode === 'attach' ? <div className="grid gap-3 sm:grid-cols-2"><label><span className="field-label">接在节点之后（可选）</span><select className="field" value={attachAfterStageId} onChange={(event) => setAttachAfterStageId(event.target.value)}><option value="">不设置</option>{detail.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label><label><span className="field-label">接在节点之前（可选）</span><select className="field" value={attachBeforeStageId} onChange={(event) => setAttachBeforeStageId(event.target.value)}><option value="">不设置</option>{detail.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></label></div> : null}
              <p className="rounded-xl bg-canvas p-3 text-[10px] leading-4 text-muted">展开会生成独立节点 ID、模板来源信息和固定预算；运行时不会动态新增节点。</p>
            </div> : <p className="mt-3 text-xs text-muted">尚无私有模板，请先保存当前工作流。</p>}
          </section>
        </div>
        <div className="mt-5 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setTemplatesOpen(false)}>取消</button><button type="button" className="btn-primary" onClick={() => void expandTemplate().catch(() => undefined)} disabled={busy || !templates.length}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}展开到画布</button></div>
      </Modal>
    </div>
  );
}
