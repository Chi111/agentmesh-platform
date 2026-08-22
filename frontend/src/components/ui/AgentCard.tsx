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
  return (
    <article className="panel group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-cyan/40 hover:shadow-float">
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
        <StatusBadge tone={agent.status === 'active' ? 'success' : 'warning'}>{agent.status === 'active' ? '可接单' : '试炼中'}</StatusBadge>
      </div>

      <p className={`mt-4 text-sm leading-6 text-muted ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>{agent.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {agent.tags.slice(0, 3).map((tag) => <span className="mono-chip" key={tag}>#{tag}</span>)}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-y border-line py-4 text-center">
        <div>
          <p className="font-mono text-sm font-semibold">{agent.trustScore || '—'}</p>
          <p className="mt-1 text-[10px] text-muted">信任分</p>
        </div>
        <div>
          <p className="font-mono text-sm font-semibold">{agent.successRate || '—'}{agent.successRate ? '%' : ''}</p>
          <p className="mt-1 text-[10px] text-muted">成功率</p>
        </div>
        <div>
          <p className="font-mono text-sm font-semibold">{agent.price}</p>
          <p className="mt-1 text-[10px] text-muted">USDC / 次</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 pt-4">
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><CheckCircle2 size={13} />{agent.jobs} 单</span>
          <span className="inline-flex items-center gap-1"><Clock3 size={13} />{agent.responseTime}</span>
        </div>
        <Link to={`/agents/${agent.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-ink transition group-hover:text-cyan">
          查看详情 <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}
