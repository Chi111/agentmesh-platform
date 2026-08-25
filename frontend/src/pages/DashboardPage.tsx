import { Activity, ArrowRight, Bot, CircleDollarSign, Clock3, GitBranch, Plus, ShieldCheck, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAppStore } from '../store/useAppStore';
import { missionStatusMeta, routeForMission } from '../utils/missionState';
import { formatPaymentAmount, paymentToken } from '../utils/payments';

export function DashboardPage() {
  const missions = useAppStore((state) => state.missions);
  const agents = useAppStore((state) => state.agents);
  const activeMission = missions.find((mission) => mission.status === 'running') ?? missions[0] ?? null;
  const storedStages = useAppStore((state) => activeMission ? state.missionStages[activeMission.id] : undefined);
  const detail = useAppStore((state) => activeMission ? state.missionDetails[activeMission.id] : undefined);
  const loadMissionDetail = useAppStore((state) => state.loadMissionDetail);
  const running = missions.filter((mission) => mission.status === 'running').length;
  const review = missions.filter((mission) => mission.status === 'review').length;
  const budgetTokens = [...new Set(missions.map((mission) => paymentToken(mission.paymentMethod)))];
  const averageSuccess = agents.length ? agents.reduce((total, agent) => total + agent.successRate, 0) / agents.length : 0;
  const stages = storedStages ?? [];
  const edges = detail?.edges ?? [];
  const rootCount = stages.filter((stage) => !edges.some((edge) => edge.targetStageId === stage.id)).length;
  const evidenceCount = detail?.events.length ?? 0;

  useEffect(() => {
    if (!activeMission || detail) return;
    void loadMissionDetail(activeMission.id).catch(() => undefined);
  }, [activeMission, detail, loadMissionDetail]);

  const activeRoute = activeMission ? routeForMission(activeMission) : '/missions';
  const activeStatus = activeMission ? missionStatusMeta(activeMission) : null;
  const trustItems = [
    ['工作流状态', stages.length ? `${stages.filter((stage) => stage.status === 'done').length} / ${stages.length} 阶段完成` : '等待任务编排', stages.some((stage) => stage.status === 'done') ? 'lime' : 'muted'],
    ['执行证据', `${evidenceCount} 个真实事件`, evidenceCount ? 'cyan' : 'muted'],
    ['托管账本', detail?.escrow ? `${detail.escrow.amount} ${detail.escrow.token} · ${detail.escrow.status}` : '等待创建托管记录', detail?.escrow?.status === 'released' ? 'lime' : 'muted'],
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Mission Control / 任务方"
        title="把复杂目标交给一支 AI 专家团队"
        description="描述结果，AgentMesh 负责任务拆解、可信组队、执行监控与合约结算。你始终保留关键确认权。"
        actions={
          <>
            <Link className="btn-secondary" to="/agents"><Bot size={17} />浏览 Agent</Link>
            <Link className="btn-primary" to="/missions/new"><Plus size={17} />发布新任务</Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="关键指标">
        <MetricCard label="执行中" value={String(running)} detail="1 个阶段需要关注" icon={Activity} signal="cyan" />
        <MetricCard label="待验收" value={String(review)} detail="交付证据已就绪" icon={ShieldCheck} signal="lime" />
        <MetricCard label="任务预算" value={`${missions.length} 笔`} detail={budgetTokens.length ? `使用 ${budgetTokens.join(' / ')}` : '暂无托管预算'} icon={CircleDollarSign} />
        <MetricCard label="Agent 成功率" value={`${averageSuccess.toFixed(1)}%`} detail={`基于 ${agents.length} 个市场 Agent`} icon={TrendingUp} signal="lime" />
      </section>

      {activeMission ? <section className="mesh-grid relative overflow-hidden rounded-2xl border border-white/10 bg-ink p-5 text-white shadow-card md:p-7">
        <div className="absolute right-[-80px] top-[-100px] size-72 rounded-full bg-cyan/10 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-cyan/25 bg-cyan/10 px-2 py-1 font-mono text-[10px] text-cyan">{activeMission.id}</span>
                <span className="inline-flex items-center gap-2 text-xs text-white/65"><span className="size-1.5 rounded-full bg-cyan shadow-[0_0_10px_rgba(0,184,217,.8)]" />{activeStatus?.label}</span>
              </div>
              <h2 className="mt-3 max-w-3xl text-xl font-semibold tracking-tight md:text-2xl">{activeMission.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">{activeMission.currentStage}</p>
            </div>
            <Link className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold transition hover:bg-white/10" to={activeRoute}>
              进入任务控制台 <ArrowRight size={16} />
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-white/40"><span className="inline-flex items-center gap-1.5"><GitBranch size={13} />DAG · {stages.length} NODES · {edges.length} DEPENDENCIES</span><span>{rootCount} ROOTS</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stages.slice(0, 6).map((stage, index) => (
              <article className="relative rounded-xl border border-white/10 bg-white/[0.035] p-4" key={stage.id}>
                <div className="flex items-center justify-between">
                  <span className={`flex size-8 items-center justify-center rounded-full border ${stage.status === 'done' ? 'border-lime/50 bg-lime/15 text-lime' : stage.status === 'running' ? 'border-cyan/50 bg-cyan/15 text-cyan' : 'border-white/15 bg-white/5 text-white/35'}`}>
                    {stage.nodeType === 'approval' ? <ShieldCheck size={16} /> : stage.status === 'running' ? <Sparkles size={16} /> : <Clock3 size={16} />}
                  </span>
                  <span className="font-mono text-[10px] text-white/35">{stage.nodeType === 'approval' ? 'GATE' : `TASK · ${index + 1}`}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold">{stage.name}</h3>
                <p className="mt-1 text-xs text-white/40">{stage.status === 'done' ? '节点完成' : stage.nodeType === 'approval' && stage.status === 'running' ? '等待任务方审批' : stage.status === 'running' ? 'Agent 执行中' : stage.status === 'failed' ? '执行失败，等待显式处理' : edges.some((edge) => edge.targetStageId === stage.id) ? '等待依赖满足' : '根节点等待派发'}</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                  <span className={`block h-full rounded-full ${stage.status === 'done' ? 'w-full bg-lime' : stage.status === 'running' ? 'w-1/2 bg-cyan' : 'w-0'}`} />
                </div>
              </article>
            ))}
          </div>
          {stages.length > 6 ? <p className="text-xs text-white/40">控制台仅预览前 6 个拓扑节点；进入任务可查看完整 {stages.length} 节点 DAG。</p> : null}

          {stages.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 p-5 text-center text-xs text-white/40">工作流尚未确认；进入任务继续选择 Agent 和执行顺序。</div> : null}
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 font-mono text-[10px] text-white/40">
            <span>ESCROW · {formatPaymentAmount(activeMission.budget, activeMission.paymentMethod)}</span>
            <span>DEADLINE · {activeMission.deadline}</span>
            <span>EVIDENCE · {evidenceCount} EVENTS</span>
          </div>
        </div>
      </section> : <section className="mesh-grid rounded-2xl border border-white/10 bg-ink px-6 py-14 text-center text-white"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-cyan/30 bg-cyan/10 text-cyan"><Sparkles size={21} /></span><h2 className="mt-5 text-xl font-semibold">真实工作区已准备好</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/45">当前账户还没有任务。创建第一个目标后，这里会显示实时阶段、证据事件和托管账本状态。</p><Link className="btn-signal mt-6" to="/missions/new"><Plus size={16} />发布第一个任务</Link></section>}

      <div className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-semibold">最近任务</h2>
              <p className="mt-1 text-xs text-muted">任务状态、团队与资金一目了然</p>
            </div>
            <Link to="/missions" className="text-xs font-semibold text-cyan">查看全部</Link>
          </div>
          <div className="divide-y divide-line">
            {missions.slice(0, 3).map((mission) => {
              const statusDisplay = missionStatusMeta(mission);
              return <Link to={routeForMission(mission)} className="grid gap-3 px-5 py-4 transition hover:bg-canvas/60 md:grid-cols-[1fr_auto_auto] md:items-center" key={mission.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{mission.title}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted">{mission.id} · {mission.team.length} AGENTS</p>
                </div>
                <StatusBadge tone={statusDisplay.tone}>{statusDisplay.label}</StatusBadge>
                <span className="font-mono text-xs font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</span>
              </Link>;
            })}
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <Target size={18} />
            <h2 className="font-semibold">Trust Pulse</h2>
          </div>
          <div className="mt-5 space-y-5">
            {trustItems.map(([title, detailText, color]) => (
              <div className="flex gap-3" key={title}>
                <span className={`mt-1 size-2.5 shrink-0 rounded-full ${color === 'lime' ? 'bg-lime' : color === 'cyan' ? 'bg-cyan' : 'bg-line'}`} />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted">{detailText}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
