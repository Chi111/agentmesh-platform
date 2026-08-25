import { ArrowRight, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Agent } from '../../types/domain';
import { StatusBadge } from './StatusBadge';

const accentStyles = {
  cyan: 'bg-cyan/15 text-cyan border-cyan/25',
  lime: 'bg-lime/20 text-ink border-lime/40',
  amber: 'bg-warning/10 text-warning border-warning/20',
};

export function AgentAvatar({ agent, size = 'md' }: { agent: Agent; size?: 'sm' | 'md' | 'lg' }) {
  const sizing = size === 'sm' ? 'size-9 text-xs rounded-lg' : size === 'lg' ? 'size-16 text-xl rounded-2xl' : 'size-12 text-sm rounded-xl';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center border font-mono font-semibold ${sizing} ${accentStyles[agent.accent]}`} aria-hidden="true">
      {agent.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function AgentCard({ agent, compact = false }: { agent: Agent; compact?: boolean }) {
  const quality = agent.quality;
  const settledSuccessRate = quality?.settledJobs
    ? Math.round((quality.successfulJobs / quality.settledJobs) * 100)
    : null;
  const marketLabel = quality?.marketplaceStatus === 'listed' ? '已准入'
    : quality?.marketplaceStatus === 'degraded' ? '已降级'
      : quality?.marketplaceStatus === 'suspended' ? '已暂停'
        : quality?.gateMode === 'shadow' && quality.eligible ? '影子接单' : quality?.trialPassed ? '观察期' : agent.status === 'active' ? '接单中' : '试炼中';
  const marketTone = quality?.marketplaceStatus === 'listed' ? 'success'
    : quality?.marketplaceStatus === 'suspended' ? 'danger' : 'warning';
  return (
    <article className="panel agent-card group flex h-full flex-col p-5 transition duration-200 hover:-translate-y-1 hover:border-cyan/35 hover:shadow-float">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar agent={agent} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">{agent.name}</h3>
              {agent.official ? <ShieldCheck size={15} className="shrink-0 text-cyan" aria-label="官方认证" /> : null}
            </div>
            <p className="mt-1 text-xs text-muted">{agent.category} · {agent.version}</p>
          </div>
        </div>
        <StatusBadge tone={marketTone}>{marketLabel}</StatusBadge>
      </div>

      <p className={`mt-4 text-sm leading-6 text-muted ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>{agent.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {quality?.premium ? <span className="mono-chip !border-lime/40 !bg-lime/15">高质量</span> : null}
        {quality?.newAgent ? <span className="mono-chip">NEW · 限量曝光</span> : null}
        {quality?.gateMode === 'shadow' && !quality.wouldBeEligible ? <span className="mono-chip !border-warning/30 !bg-warning/10">SHADOW</span> : null}
        {quality?.trialPassed ? <span className="mono-chip">TRIAL ✓</span> : null}
        {agent.tags.slice(0, 3).map((tag) => <span className="mono-chip" key={tag}>#{tag}</span>)}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-y border-line py-4 text-center">
        <div>
          <p className="font-mono text-sm font-semibold">{quality?.reputation ?? '—'}</p>
          <p className="mt-1 text-[10px] text-muted">信誉 / 100</p>
        </div>
        <div>
          <p className="font-mono text-sm font-semibold">{quality ? quality.confidence.toUpperCase() : '—'}</p>
          <p className="mt-1 text-[10px] text-muted">置信度</p>
        </div>
        <div>
          <p className="font-mono text-sm font-semibold">{agent.price}</p>
          <p className="mt-1 text-[10px] text-muted">USDC / 次</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-4">
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} />{quality?.settledJobs ?? agent.jobs} 单</span>
          {settledSuccessRate === null ? null : <span>{settledSuccessRate}% 履约</span>}
          <span className="inline-flex items-center gap-1"><Clock3 size={13} />{quality ? quality.endpointHealthy ? '健康' : '待检查' : agent.responseTime}</span>
        </div>
        <Link to={`/agents/${agent.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-ink transition group-hover:text-cyan">
          查看详情 <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}
