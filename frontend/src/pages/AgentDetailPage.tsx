import { ArrowLeft, ArrowRight, BarChart3, CheckCircle2, Clock3, Code2, ExternalLink, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { AgentAvatar } from '../components/ui/AgentCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAppStore } from '../store/useAppStore';

export function AgentDetailPage() {
  const { agentId } = useParams();
  const agents = useAppStore((state) => state.agents);
  const agent = agents.find((item) => item.id === agentId);

  if (!agent) {
    return <section className="panel py-16 text-center"><h1 className="text-lg font-semibold">Agent 不存在或尚未上线</h1><p className="mt-2 text-sm text-muted">公开目录中没有这个 Agent。</p><Link className="btn-primary mt-5" to="/agents">返回 Agent 市场</Link></section>;
  }

  const inputSchema = agent.inputSchema ?? { task: 'string', context: 'object', request_id: 'uuid' };
  const outputSchema = agent.outputSchema ?? { status: 'string', result: 'object', evidence_hash: 'string' };

  return (
    <div className="space-y-6">
      <Link to="/agents" className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-ink"><ArrowLeft size={16} />返回 Agent 市场</Link>

      <section className="panel overflow-hidden">
        <div className="relative border-b border-line bg-canvas/45 p-6 md:p-8">
          <div className="absolute right-0 top-0 size-52 rounded-full bg-cyan/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <AgentAvatar agent={agent} size="lg" />
              <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">{agent.name}</h1>{agent.official ? <StatusBadge tone="info">官方认证</StatusBadge> : null}<StatusBadge tone={agent.status === 'active' ? 'success' : 'warning'}>{agent.status === 'active' ? '可接单' : '试炼中'}</StatusBadge></div><p className="mt-2 text-sm text-muted">{agent.category} · {agent.author} · {agent.version}</p><div className="mt-3 flex flex-wrap items-center gap-4 text-xs"><span className="inline-flex items-center gap-1"><ShieldCheck size={14} className="text-cyan" />信任分 {agent.trustScore || '待生成'}</span><span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-lime" />成功率 {agent.successRate || '—'}%</span><span className="inline-flex items-center gap-1"><Clock3 size={14} />{agent.responseTime}</span></div></div>
            </div>
            <Link className="btn-primary self-start" to="/missions/new">用于新任务 <ArrowRight size={16} /></Link>
          </div>
        </div>
        <div className="grid gap-6 p-6 md:p-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <p className="eyebrow">Capability Profile</p>
            <h2 className="mt-2 text-xl font-semibold">核心能力</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{agent.summary}</p>
            <div className="mt-5 flex flex-wrap gap-2">{agent.tags.map((tag) => <span className="mono-chip" key={tag}>#{tag}</span>)}</div>
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-line p-5"><div className="flex items-center gap-2 text-cyan"><Sparkles size={18} /><h3 className="font-semibold text-ink">输入契约</h3></div><p className="mt-3 text-sm leading-6 text-muted">调度器会按此结构向 Agent Endpoint 发送阶段任务与回调信息。</p><pre className="mt-4 max-h-52 overflow-auto rounded-xl bg-ink p-4 font-mono text-[10px] leading-5 text-white/55">{JSON.stringify(inputSchema, null, 2)}</pre></article>
              <article className="rounded-2xl border border-line p-5"><div className="flex items-center gap-2 text-lime"><Code2 size={18} /><h3 className="font-semibold text-ink">输出契约</h3></div><p className="mt-3 text-sm leading-6 text-muted">Agent 通过签名回调更新阶段状态、结构化输出与证据摘要。</p><pre className="mt-4 max-h-52 overflow-auto rounded-xl bg-ink p-4 font-mono text-[10px] leading-5 text-white/55">{JSON.stringify(outputSchema, null, 2)}</pre></article>
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-canvas/40 p-5"><p className="text-sm font-semibold">定价详情</p><p className="mt-4 font-mono text-4xl font-semibold">{agent.price}<span className="ml-2 text-sm text-muted">USDC / 次</span></p><p className="mt-3 text-xs leading-5 text-muted">实际预算由任务复杂度和阶段 SLA 决定，执行前锁定上限。</p></section>
            {agent.endpoint ? <section className="rounded-2xl border border-cyan/35 bg-cyan/[0.06] p-5"><p className="text-sm font-semibold">Agent Endpoint</p><p className="mt-2 text-xs leading-5 text-muted">通过 HTTP POST 调用；官方 Agent 需要登录后的 Bearer ID Token。</p><code className="mt-4 block break-all rounded-xl border border-line bg-surface px-3 py-2.5 text-[10px] leading-5 text-cyan">{agent.endpoint}</code><a className="btn-secondary mt-4 w-full" href={agent.endpoint} target="_blank" rel="noreferrer">打开 Endpoint <ExternalLink size={15} /></a></section> : null}
            <section className="rounded-2xl border border-line p-5"><p className="text-sm font-semibold">运行数据</p><dl className="mt-4 space-y-3 text-xs">{[['累计任务', `${agent.jobs} 单`],['累计成交', `${agent.volume.toLocaleString()} USDC`],['调用协议','HTTP / JSON'],['鉴权模式',agent.authType ?? 'none']].map(([label,value]) => <div className="flex justify-between" key={label}><dt className="text-muted">{label}</dt><dd className="font-mono font-semibold">{value}</dd></div>)}</dl></section>
          </aside>
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="eyebrow">Trust Model</p><h2 className="mt-2 text-xl font-semibold">平台可验证指标</h2></div><div className="flex items-center gap-2"><BarChart3 size={17} className="text-cyan" /><span className="font-mono text-xl font-semibold">{agent.trustScore || '—'} / 10</span></div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['信任分', agent.trustScore ? `${agent.trustScore} / 10` : '待试炼'], ['成功率', agent.successRate ? `${agent.successRate}%` : '暂无样本'], ['累计任务', `${agent.jobs} 单`], ['累计成交', `${agent.volume.toLocaleString()} USDC`]].map(([label, value]) => <article className="rounded-xl border border-line bg-canvas/35 p-4" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-3 font-mono text-xl font-semibold">{value}</p></article>)}</div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-lime/40 bg-lime/10 p-5 md:flex-row md:items-center md:justify-between"><div className="flex gap-3"><WalletCards size={20} /><div><p className="text-sm font-semibold">平台协议调度</p><p className="mt-1 text-xs leading-5 text-muted">Agent 由任务匹配引擎调用，付款、证据和争议均通过统一协议处理。</p></div></div><Link className="btn-primary" to="/missions/new">创建任务</Link></section>
    </div>
  );
}
