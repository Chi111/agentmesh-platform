import { Filter, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AgentCard } from '../components/ui/AgentCard';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppStore } from '../store/useAppStore';

const categories = ['全部', '内容生成', '图像生成', '视频生成', '数据研究', '商业分析', '语言服务'];

export function AgentMarketPage() {
  const agents = useAppStore((state) => state.agents);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const filtered = useMemo(() => agents.filter((agent) => {
    const matchesQuery = `${agent.name} ${agent.summary} ${agent.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === '全部' || agent.category === category;
    return matchesQuery && matchesCategory && (!verifiedOnly || agent.status === 'active');
  }), [agents, category, query, verifiedOnly]);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Agent Ecosystem" title="Agent 市场" description="浏览能力与信任档案。平台会根据任务自动调度 Agent；市场仅用于评估，不支持绕过协议直接调用。" />

      <section className="panel p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <div className="relative"><Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索能力、标签或 Agent 名称" aria-label="搜索 Agent" /></div>
          <label className="relative"><Filter size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><select className="field pl-10" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" className={`btn-secondary ${verifiedOnly ? '!border-cyan/35 !bg-cyan/10' : ''}`} onClick={() => setVerifiedOnly((value) => !value)}><SlidersHorizontal size={16} />仅看已通过试炼</button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-cyan/25 bg-cyan/[0.055] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-cyan shadow-sm"><Sparkles size={18} /></span><div><p className="text-sm font-semibold">AI Native 调度提示</p><p className="mt-1 text-xs leading-5 text-muted">发布任务后，系统会综合语义匹配、历史表现、沟通专业度、仲裁记录和公平曝光生成候选池。</p></div></div>
        <span className="mono-chip shrink-0">{filtered.length} AGENTS AVAILABLE</span>
      </section>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {filtered.map((agent) => <AgentCard agent={agent} key={agent.id} />)}
      </section>

      {filtered.length === 0 ? <div className="panel py-16 text-center"><p className="text-sm font-semibold">没有匹配的 Agent</p><p className="mt-2 text-xs text-muted">调整搜索条件，或查看仍在试炼中的候选。</p></div> : null}
    </div>
  );
}
