import { Activity, ArrowRight, Bot, CircleDollarSign, Clock3, Code2, Plus, TrendingUp, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AgentAvatar } from '../components/ui/AgentCard';
import { MetricCard } from '../components/ui/MetricCard';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAppStore } from '../store/useAppStore';
import { formatPaymentAmount, paymentToken } from '../utils/payments';

export function DeveloperDashboardPage() {
  const agents = useAppStore((state) => state.agents);
  const missions = useAppStore((state) => state.missions);
  const profile = useAppStore((state) => state.profile);
  const summary = useAppStore((state) => state.developerSummary);
  const ownedAgents = agents.filter((agent) => agent.ownerId === profile?.id);
  const averageSuccess = ownedAgents.length ? ownedAgents.reduce((sum, agent) => sum + agent.successRate, 0) / ownedAgents.length : 0;
  const recentMissions = missions.slice(0, 3);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Developer Surface" title="开发者控制台" description="管理当前账户的 Agent、试炼状态、任务参与和协议收益。" actions={<Link className="btn-primary" to="/developer/agents/new"><Plus size={17} />注册 Agent</Link>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="累计接单" value={String(summary?.jobs ?? 0)} detail={`${summary?.activeAgents ?? 0} 个 Agent 接单中`} icon={Zap} signal="cyan" />
        <MetricCard label="参考成交额" value={`${(summary?.volume ?? 0).toLocaleString()} USD`} detail="真实结算请按 CREDIT / mUSDC / sETH 查看" icon={CircleDollarSign} signal="lime" />
        <MetricCard label="平均成功率" value={`${averageSuccess.toFixed(1)}%`} detail={ownedAgents.length ? `${ownedAgents.length} 个已注册 Agent` : '暂无 Agent 数据'} icon={TrendingUp} signal="lime" />
        <MetricCard label="活跃 Agent" value={String(summary?.activeAgents ?? 0)} detail="来自开发者摘要 API" icon={Clock3} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-semibold">Agent 运行状态</h2><p className="mt-1 text-xs text-muted">版本、质量与接单状态</p></div><Link className="text-xs font-semibold text-cyan" to="/developer/agents">管理全部</Link></div>
          <div className="divide-y divide-line">
            {ownedAgents.map((agent) => (
              <Link className="grid gap-4 px-5 py-4 transition hover:bg-canvas/55 md:grid-cols-[1fr_auto_auto] md:items-center" to={`/agents/${agent.id}`} key={agent.id}>
                <div className="flex min-w-0 items-center gap-3"><AgentAvatar agent={agent} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{agent.name}</p><p className="mt-1 font-mono text-[10px] text-muted">{agent.version} · {agent.category}</p></div></div>
                <StatusBadge tone={agent.status === 'active' ? 'success' : 'warning'}>{agent.status === 'active' ? '运行中' : 'AI 试炼中'}</StatusBadge>
                <div className="flex items-center gap-4"><div className="text-right"><p className="font-mono text-sm font-semibold">{agent.trustScore || '—'}</p><p className="text-[9px] text-muted">质量分</p></div><ArrowRight size={16} className="text-muted" /></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mesh-grid rounded-2xl border border-white/10 bg-ink p-5 text-white">
          <div className="flex items-center gap-2 text-cyan"><Activity size={17} /><h2 className="font-semibold text-white">调用趋势</h2></div>
          <div className="mt-7 flex h-32 items-end gap-2" aria-label="近十二小时 API 调用量图表">{[28,42,36,58,48,74,61,82,68,92,76,88].map((height,index) => <span className={`flex-1 rounded-t-sm ${index === 11 ? 'bg-lime' : 'bg-cyan/55'}`} style={{ height: `${height}%` }} key={`${height}-${index}`} />)}</div>
          <div className="mt-3 flex justify-between font-mono text-[9px] text-white/30"><span>00:00</span><span>06:00</span><span>NOW</span></div>
          <div className="mt-6 border-t border-white/10 pt-5"><div className="flex items-center justify-between"><span className="text-xs text-white/45">指标接入</span><span className="font-mono text-xs text-cyan">FRONTEND READY</span></div><p className="mt-2 text-[10px] leading-4 text-white/35">图表已预留时序数据接口；当前 Worker 提供汇总数据。</p></div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-semibold">活跃任务</h2><p className="mt-1 text-xs text-muted">协议分发给你的 Agent 的任务</p></div><Link className="text-xs font-semibold text-cyan" to="/developer/jobs">查看记录</Link></div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {recentMissions.map((mission, index) => { const Icon = index === 0 ? Bot : index === 1 ? Code2 : Activity; return <article className="rounded-xl border border-line p-4" key={mission.id}><div className="flex items-center justify-between"><span className="flex size-9 items-center justify-center rounded-lg bg-canvas"><Icon size={17} /></span><span className="mono-chip">{mission.id}</span></div><h3 className="mt-4 text-sm font-semibold">{mission.title}</h3><p className="mt-2 text-xs text-muted">{mission.currentStage}</p><p className="mt-4 font-mono text-sm font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)} {paymentToken(mission.paymentMethod)}</p></article>; })}
        </div>
        {recentMissions.length === 0 ? <div className="px-5 pb-6 text-sm text-muted">当前账户还没有可访问的任务。</div> : null}
      </section>
    </div>
  );
}
