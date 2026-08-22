import { ArrowLeft, ArrowRight, Check, Info, LoaderCircle, RefreshCw, Scale, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgentAvatar } from '../components/ui/AgentCard';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useMission } from '../hooks/useMission';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount } from '../utils/payments';

export function TeamAssemblyPage() {
  const navigate = useNavigate();
  const mission = useMission();
  const missionId = mission?.id ?? '';
  const stages = useAppStore((state) => state.missionStages[missionId]) ?? [];
  const matches = useAppStore((state) => state.candidateMatches[missionId]) ?? [];
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const loadCandidates = useAppStore((state) => state.loadCandidates);
  const showToast = useAppStore((state) => state.showToast);
  const dismissToast = useAppStore((state) => state.dismissToast);
  const selectedAgents = useAppStore((state) => state.selectedAgents);
  const selectAgent = useAppStore((state) => state.selectAgent);
  const [loading, setLoading] = useState(false);
  const teamReady = stages.length > 0 && stages.every((stage) => matches.some((match) => match.stageId === stage.id && match.candidates.length > 0));

  useEffect(() => {
    if (!missionId) return;
    let active = true;
    setLoading(true);
    Promise.all([loadMissionDetail(missionId), loadCandidates(missionId)])
      .catch((loadError) => { if (active) showToast(loadError instanceof Error ? loadError.message : '候选团队加载失败。', 'error'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadCandidates, loadMissionDetail, missionId, showToast]);

  if (!mission) {
    return <section className="panel py-16 text-center"><p className="text-sm font-semibold">正在加载任务，或任务不存在</p><Link className="btn-secondary mt-5" to="/missions">返回任务列表</Link></section>;
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Discovery → Matching"
        title="AI 已生成候选执行团队"
        description={`“${mission.title}” 被拆解为 ${stages.length} 个专业阶段。候选结果综合分类、语义相似度、信任表现与公平曝光。`}
        actions={<Link className="btn-secondary" to="/missions/new"><ArrowLeft size={16} />修改任务</Link>}
      />

      <section className="grid gap-3 rounded-2xl border border-cyan/25 bg-cyan/[0.06] p-4 md:grid-cols-3">
        {[
          ['V0 硬匹配', '分类与标签必须满足任务约束'],
          ['V1 语义召回', '描述向量相似度进入 Top-K'],
          ['公平洗牌', '新 Agent 获得受控曝光机会'],
        ].map(([title, detail], index) => (
          <div className="flex gap-3" key={title}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white font-mono text-[10px] font-semibold text-cyan shadow-sm">0{index + 1}</span>
            <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted">{detail}</p></div>
          </div>
        ))}
      </section>

      <div className="space-y-5">
        {loading ? <section className="panel flex items-center justify-center gap-3 py-16 text-sm text-muted"><LoaderCircle size={18} className="animate-spin text-cyan" />正在从匹配引擎加载候选团队…</section> : null}
        {stages.map((stage, stageIndex) => {
          const liveMatch = matches.find((match) => match.stageId === stage.id);
          const visibleCandidates = liveMatch?.candidates.map((candidate) => candidate.agent) ?? [];
          const selectedId = selectedAgents[stage.id] ?? stage.agentId ?? visibleCandidates[0]?.id;

          return (
            <section className="panel overflow-hidden" key={stage.id}>
              <div className="flex flex-col gap-4 border-b border-line bg-canvas/45 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-ink font-mono text-[10px] text-white">0{stageIndex + 1}</span>
                  <div><h2 className="font-semibold">{stage.name}</h2><p className="mt-1 text-xs text-muted">{stage.purpose}</p></div>
                </div>
                <div className="flex items-center gap-2"><StatusBadge tone="info">{stage.category}</StatusBadge><span className="mono-chip">预算 {formatPaymentAmount(stage.budget, mission.paymentMethod)}</span></div>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-3">
                {visibleCandidates.map((agent, candidateIndex) => {
                  const selected = selectedId === agent.id;
                  const semanticScore = Math.round(liveMatch?.candidates.find((candidate) => candidate.agent.id === agent.id)?.score ?? 0);
                  return (
                    <button type="button" className={`relative rounded-2xl border p-4 text-left transition ${selected ? 'border-cyan bg-cyan/[0.06] shadow-[0_0_0_1px_rgba(0,184,217,.25)]' : 'border-line bg-white hover:border-cyan/40'}`} onClick={() => selectAgent(stage.id, agent.id)} key={agent.id}>
                      {selected ? <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-cyan text-ink"><Check size={14} /></span> : null}
                      <div className="flex items-center gap-3"><AgentAvatar agent={agent} /><div><h3 className="font-semibold">{agent.name}</h3><p className="mt-1 text-xs text-muted">{agent.author}</p></div></div>
                      <p className="mt-4 line-clamp-2 text-xs leading-5 text-muted">{agent.summary}</p>
                      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                        <div><p className="font-mono text-sm font-semibold">{semanticScore}%</p><p className="mt-1 text-[9px] text-muted">语义匹配</p></div>
                        <div><p className="font-mono text-sm font-semibold">{agent.trustScore}</p><p className="mt-1 text-[9px] text-muted">信任分</p></div>
                        <div><p className="font-mono text-sm font-semibold">{agent.price}</p><p className="mt-1 text-[9px] text-muted">USDC</p></div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-muted"><span className="inline-flex items-center gap-1"><ShieldCheck size={12} />质量试炼通过</span><span>曝光位 #{candidateIndex + 1}</span></div>
                    </button>
                  );
                })}
                {visibleCandidates.length === 0 ? <div className="py-8 text-center text-sm text-muted lg:col-span-3">当前阶段没有通过硬约束的真实候选 Agent。请调整任务分类或先在市场注册并激活对应 Agent。</div> : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lime/20"><Scale size={18} /></span>
          <div><p className="text-sm font-semibold">公平性说明</p><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">候选顺序已进行可复现洗牌。评分决定候选池权重，但不会让新 Agent 永久失去曝光。</p></div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => { dismissToast(); setLoading(true); void loadCandidates(mission.id).catch((loadError) => showToast(loadError instanceof Error ? loadError.message : '重新匹配失败。', 'error')).finally(() => setLoading(false)); }}><RefreshCw size={16} />重新匹配</button>
          <button type="button" className="btn-primary" disabled={!teamReady || loading} onClick={() => navigate(`/missions/${mission.id}/workflow`)}>确认团队并编排 <ArrowRight size={16} /></button>
        </div>
      </section>

      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted"><Info size={14} />选择的是专业类别内的执行者，不支持绕过平台直接调用 Agent。</p>
    </div>
  );
}
