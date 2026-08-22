import { ArrowRight, CalendarClock, Filter, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAppStore } from '../store/useAppStore';
import type { MissionStatus } from '../types/domain';
import { missionStatusMeta, routeForMission } from '../utils/missionState';
import { formatPaymentAmount, paymentToken } from '../utils/payments';

const statusOptions: Array<{ value: 'all' | MissionStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '执行中' },
  { value: 'review', label: '待验收' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已退款终止' },
];

export function MissionsPage() {
  const missions = useAppStore((state) => state.missions);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | MissionStatus>('all');

  const filtered = useMemo(() => missions.filter((mission) => {
    const matchesQuery = `${mission.title} ${mission.id} ${mission.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === 'all' || mission.status === status);
  }), [missions, query, status]);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Mission Portfolio" title="我的任务" description="从目标规格到最终结算，查看每项任务的团队、进度、预算和证据状态。" actions={<Link className="btn-primary" to="/missions/new"><Plus size={17} />发布任务</Link>} />

      <section className="panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名称、编号或标签" aria-label="搜索任务" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter size={16} className="shrink-0 text-muted" />
            {statusOptions.map((item) => (
              <button type="button" key={item.value} onClick={() => setStatus(item.value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${status === item.value ? 'bg-ink text-white' : 'bg-canvas text-muted hover:text-ink'}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        {filtered.map((mission) => {
          const statusDisplay = missionStatusMeta(mission);
          return <article className="panel p-5" key={mission.id}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono-chip">{mission.id}</span>
                  <StatusBadge tone={statusDisplay.tone}>{statusDisplay.label}</StatusBadge>
                  {mission.yieldEnabled ? <StatusBadge tone="success">收益计划意向</StatusBadge> : null}
                </div>
                <h2 className="mt-3 text-lg font-semibold tracking-tight">{mission.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{mission.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {mission.tags.map((tag) => <span className="mono-chip" key={tag}>#{tag}</span>)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">任务进度</span>
                  <span className="font-mono font-semibold">{mission.progress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas">
                  <span className="block h-full rounded-full bg-cyan" style={{ width: `${mission.progress}%` }} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted"><CalendarClock size={14} />{mission.deadline}</div>
              </div>

              <div className="flex items-center justify-between gap-5 lg:justify-end">
                <div className="text-right">
                  <p className="font-mono text-base font-semibold">{formatPaymentAmount(mission.budget, mission.paymentMethod)}</p>
                  <p className="mt-1 text-[10px] text-muted">{paymentToken(mission.paymentMethod)} 托管</p>
                </div>
                <Link to={routeForMission(mission)} className="flex size-10 items-center justify-center rounded-xl border border-line transition hover:border-cyan/40 hover:bg-cyan/10" aria-label={`打开 ${mission.title}`}>
                  <ArrowRight size={17} />
                </Link>
              </div>
            </div>
          </article>;
        })}
        {filtered.length === 0 ? <div className="panel py-16 text-center"><p className="text-sm font-semibold">没有匹配的任务</p><p className="mt-2 text-xs text-muted">调整搜索条件或发布一个新任务。</p></div> : null}
      </section>
    </div>
  );
}
