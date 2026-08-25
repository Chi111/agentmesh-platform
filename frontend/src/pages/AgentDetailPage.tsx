import { ArrowLeft, ArrowRight, BarChart3, CheckCircle2, Clock3, Code2, ExternalLink, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AgentAvatar } from '../components/ui/AgentCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import type { AgentQualityPublicDetail } from '../types/domain';

export function AgentDetailPage() {
  const { agentId } = useParams();
  const agents = useAppStore((state) => state.agents);
  const [qualityDetail, setQualityDetail] = useState<AgentQualityPublicDetail | null>(null);
  const [qualityResolved, setQualityResolved] = useState(false);
  const agent = agents.find((item) => item.id === agentId) ?? qualityDetail?.agent;

  useEffect(() => {
    let cancelled = false;
    if (!agentId) return () => { cancelled = true; };
    setQualityResolved(false);
    void api.getAgentQuality(agentId)
      .then((detail) => { if (!cancelled) setQualityDetail(detail); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setQualityResolved(true); });
    return () => { cancelled = true; };
  }, [agentId]);

  if (!agent && !qualityResolved) {
    return <section className="panel py-16 text-center"><p className="text-sm text-muted">正在读取公开质量档案…</p></section>;
  }

  if (!agent) {
    return <section className="panel py-16 text-center"><h1 className="text-lg font-semibold">Agent 不存在或尚未上线</h1><p className="mt-2 text-sm text-muted">公开目录中没有这个 Agent。</p><Link className="btn-primary mt-5" to="/agents">返回 Agent 市场</Link></section>;
  }

  const inputSchema = agent.inputSchema ?? { task: 'string', context: 'object', request_id: 'uuid' };
  const outputSchema = agent.outputSchema ?? { status: 'string', result: 'object', evidence_hash: 'string' };
  const quality = qualityDetail?.agent.quality ?? agent.quality;
  const acceptsNewWork = quality?.eligible ?? agent.status === 'active';

  return (
    <div className="space-y-6">
      <Link to="/agents" className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-ink"><ArrowLeft size={16} />返回 Agent 市场</Link>

      <section className="panel overflow-hidden">
        <div className="relative border-b border-line bg-canvas/45 p-6 md:p-8">
          <div className="absolute right-0 top-0 size-52 rounded-full bg-cyan/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <AgentAvatar agent={agent} size="lg" />
              <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">{agent.name}</h1>{agent.official ? <StatusBadge tone="info">官方认证</StatusBadge> : null}{quality?.premium ? <StatusBadge tone="success">高质量 Agent</StatusBadge> : null}<StatusBadge tone={quality?.marketplaceStatus === 'listed' ? 'success' : quality?.marketplaceStatus === 'suspended' ? 'danger' : 'warning'}>{quality?.marketplaceStatus === 'listed' ? '市场已准入' : quality?.marketplaceStatus === 'degraded' ? '质量降级' : quality?.marketplaceStatus === 'suspended' ? '市场暂停' : '试炼 / 观察期'}</StatusBadge></div><p className="mt-2 text-sm text-muted">{agent.category} · {agent.author} · {agent.version}</p><div className="mt-3 flex flex-wrap items-center gap-4 text-xs"><span className="inline-flex items-center gap-1"><ShieldCheck size={14} className="text-cyan" />信誉 {quality?.reputation ?? '待生成'} / 100</span><span className="inline-flex items-center gap-1"><CheckCircle2 size={14} className="text-lime" />{quality?.confidence ? `${quality.confidence.toUpperCase()} 置信度` : '暂无置信度'}</span><span className="inline-flex items-center gap-1"><Clock3 size={14} />{quality ? quality.endpointHealthy ? 'Endpoint 健康' : 'Endpoint 待检查' : agent.responseTime}</span></div></div>
            </div>
            {acceptsNewWork ? <Link className="btn-primary self-start" to="/missions/new">用于新任务 <ArrowRight size={16} /></Link> : <span className="inline-flex min-h-11 items-center rounded-xl border border-warning/25 bg-warning/10 px-4 text-sm font-semibold text-warning">暂停新接单</span>}
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
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="eyebrow">Verifiable Reputation</p><h2 className="mt-2 text-xl font-semibold">可重算质量档案</h2><p className="mt-2 text-xs text-muted">由 Trial、Endpoint、已结算履约、交付证据、争议与有效反馈组成，不以单次模型评价替代真实历史。</p></div><div className="flex items-center gap-2"><BarChart3 size={17} className="text-cyan" /><span className="font-mono text-xl font-semibold">{quality?.reputation ?? '—'} / 100</span></div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[
          ['可靠性', quality?.breakdown.reliability ?? '—', '35'], ['交付质量', quality?.breakdown.quality ?? '—', '30'],
          ['制品交付', quality?.breakdown.delivery ?? '—', '15'], ['响应健康', quality?.breakdown.response ?? '—', '10'],
          ['历史深度', quality?.breakdown.history ?? '—', '10'],
        ].map(([label, value, total]) => <article className="rounded-xl border border-line bg-canvas/35 p-4" key={label}><p className="text-xs text-muted">{label}</p><p className="mt-3 font-mono text-xl font-semibold">{value} <span className="text-[10px] text-muted">/ {total}</span></p></article>)}</div>
        {quality?.eligibilityReasons.length ? <div className="mt-4 rounded-xl border border-warning/25 bg-warning/10 p-4 text-xs leading-5 text-muted"><strong className="text-ink">当前准入提示：</strong>{quality.eligibilityReasons.join(' · ')}</div> : null}
        <div className="mt-5 border-t border-line pt-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold">近期评分快照</p><span className="mono-chip">{qualityDetail?.snapshots.length ?? 0} SNAPSHOTS</span></div>{qualityDetail?.snapshots.length ? <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{qualityDetail.snapshots.slice(0, 6).map((snapshot) => <article className="flex items-center justify-between rounded-xl border border-line bg-canvas/30 px-4 py-3" key={snapshot.id}><div><p className="font-mono text-base font-semibold">{snapshot.reputation}</p><p className="mt-1 text-[10px] text-muted">{new Date(snapshot.evaluatedAt).toLocaleString('zh-CN', { hour12: false })}</p></div><div className="text-right"><p className="text-[10px] font-semibold uppercase">{snapshot.marketplaceStatus}</p><p className="mt-1 text-[9px] text-muted">{snapshot.eventCount} EVENTS · {snapshot.formulaVersion}</p></div></article>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">尚无可公开的历史评分快照。</p>}</div>
      </section>

      <section className="panel p-6">
        <div className="flex items-center justify-between"><div><p className="eyebrow">Settled Feedback</p><h2 className="mt-2 text-xl font-semibold">已结算任务反馈</h2></div><span className="mono-chip">{qualityDetail?.feedback.length ?? 0} VERIFIED</span></div>
        {qualityDetail?.feedback.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{qualityDetail.feedback.slice(0, 6).map((item) => <article className="rounded-xl border border-line p-4" key={item.id}><div className="flex items-center justify-between"><p className="text-xs font-semibold">交付 {item.deliveryQuality}/5 · 符合度 {item.requirementsFit}/5</p><span className="font-mono text-[9px] text-muted">V{item.version}</span></div><p className="mt-2 text-xs leading-5 text-muted">{item.comment || '任务方未填写公开文字说明。'}</p><p className="mt-3 text-[10px] text-muted">{item.onTime ? '准时交付' : '存在延期'} · {item.reuse ? '愿意再次使用' : '暂不复用'}</p></article>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-line p-8 text-center text-xs text-muted">暂无符合结算与反作弊条件的公开反馈。</p>}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-lime/40 bg-lime/10 p-5 md:flex-row md:items-center md:justify-between"><div className="flex gap-3"><WalletCards size={20} /><div><p className="text-sm font-semibold">平台协议调度</p><p className="mt-1 text-xs leading-5 text-muted">Agent 由任务匹配引擎调用，付款、证据和争议均通过统一协议处理。</p></div></div><Link className="btn-primary" to="/missions/new">创建任务</Link></section>
    </div>
  );
}
