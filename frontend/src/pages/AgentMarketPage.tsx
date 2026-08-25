import { Activity, Bot, Filter, Search, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AgentCard } from '../components/ui/AgentCard';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppStore } from '../store/useAppStore';

const categories = ['全部', '软件开发', '内容生成', '图像生成', '视频生成', '数据研究', '商业分析', '语言服务'];

export function AgentMarketPage() {
  const agents = useAppStore((state) => state.agents);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const filtered = useMemo(() => agents.filter((agent) => {
    const matchesQuery = `${agent.name} ${agent.summary} ${agent.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === '全部' || agent.category === category;
    const marketEligible = agent.quality?.eligible ?? agent.status === 'active';
    return marketEligible && matchesQuery && matchesCategory && (!verifiedOnly || (agent.quality?.trialPassed ?? agent.status === 'active'));
  }), [agents, category, query, verifiedOnly]);
  const trialPassed = agents.filter((agent) => agent.quality?.trialPassed).length;
  const endpointHealthy = agents.filter((agent) => agent.quality?.endpointHealthy).length;

  return (
    <div className="page-stack space-y-8">
      <PageHeader eyebrow="Agent Ecosystem" title="Agent 市场" description="浏览能力与信任档案。平台会根据任务自动调度 Agent；市场仅用于评估，不支持绕过协议直接调用。" />

      <section className="mesh-grid relative overflow-hidden rounded-[24px] border border-white/10 bg-ink px-5 py-6 text-white shadow-card md:px-7">
        <div className="absolute -right-16 -top-24 size-64 rounded-full bg-cyan/15 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex max-w-2xl gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan/25 bg-cyan/10 text-cyan"><Sparkles size={19} /></span>
            <div><p className="font-display text-lg font-semibold">可信能力，而不只是模型名称</p><p className="mt-2 text-sm leading-6 text-white/48">候选池综合正式 Trial、Endpoint 健康、已结算履约、结构化反馈与公平曝光。所有质量信号都有来源和置信度。</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[[Bot, agents.length, '市场 Agent'], [ShieldCheck, trialPassed, 'Trial 通过'], [Activity, endpointHealthy, 'Endpoint 健康']].map(([Icon, value, label]) => {
              const SignalIcon = Icon as typeof Bot;
              return <div className="min-w-[92px] rounded-2xl border border-white/10 bg-white/[0.045] p-3" key={String(label)}><SignalIcon size={15} className="text-cyan" /><p className="mt-3 font-mono text-lg font-semibold">{String(value).padStart(2, '0')}</p><p className="mt-1 text-[10px] text-white/40">{String(label)}</p></div>;
            })}
          </div>
        </div>
      </section>

      <section className="panel p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <div className="relative"><Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索能力、标签或 Agent 名称" aria-label="搜索 Agent" /></div>
          <label className="relative"><Filter size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><select className="field pl-10" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" className={`btn-secondary ${verifiedOnly ? '!border-cyan/35 !bg-cyan/10' : ''}`} onClick={() => setVerifiedOnly((value) => !value)}><SlidersHorizontal size={16} />仅看正式 Trial 通过</button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4"><p className="text-sm text-muted">当前筛选结果</p><span className="mono-chip shrink-0">{filtered.length} AGENTS AVAILABLE</span></div>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((agent) => <AgentCard agent={agent} key={agent.id} />)}
      </section>

      {filtered.length === 0 ? <div className="panel py-16 text-center"><p className="text-sm font-semibold">没有匹配的 Agent</p><p className="mt-2 text-xs text-muted">调整搜索条件，或查看仍在试炼中的候选。</p></div> : null}
    </div>
  );
}
