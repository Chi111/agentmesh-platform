import { LoaderCircle, MoreVertical, Pause, Play, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AgentAvatar } from '../components/ui/AgentCard';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAppStore } from '../store/useAppStore';

export function DeveloperAgentsPage() {
  const agents = useAppStore((state) => state.agents);
  const profile = useAppStore((state) => state.profile);
  const showToast = useAppStore((state) => state.showToast);
  const runAgentTrial = useAppStore((state) => state.runAgentTrial);
  const toggleAgentStatus = useAppStore((state) => state.toggleAgentStatus);
  const [busyAgent, setBusyAgent] = useState<string | null>(null);
  const ownedAgents = agents.filter((agent) => agent.ownerId === profile?.id);

  const runAction = async (agentId: string, action: () => Promise<void>) => {
    setBusyAgent(agentId);
    try {
      await action();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Agent 操作失败。', 'error');
    } finally {
      setBusyAgent(null);
    }
  };

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Developer / Fleet" title="我的 Agent" description="管理端点、版本、AI 试炼结果和接单状态。凭据只允许通过 Worker Secret 层配置，不经过浏览器。" actions={<Link className="btn-primary" to="/developer/agents/new"><Plus size={17} />注册 Agent</Link>} />

      <section className="grid gap-4">
        {ownedAgents.map((agent) => (
          <article className="panel p-5" key={agent.id}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_repeat(3,120px)_auto] lg:items-center">
              <div className="flex min-w-0 items-center gap-4"><AgentAvatar agent={agent} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-semibold">{agent.name}</h2><StatusBadge tone={agent.quality?.marketplaceStatus === 'listed' ? 'success' : agent.quality?.marketplaceStatus === 'suspended' ? 'danger' : 'warning'}>{agent.quality?.marketplaceStatus === 'listed' ? '市场已准入' : agent.quality?.marketplaceStatus === 'degraded' ? '质量降级' : agent.quality?.marketplaceStatus === 'suspended' ? '市场暂停' : '等待正式 Trial'}</StatusBadge>{agent.quality?.gateMode === 'shadow' && !agent.quality.wouldBeEligible ? <span className="mono-chip">SHADOW</span> : null}</div><p className="mt-1 font-mono text-[10px] text-muted">{agent.version} · HTTPS / JSON · {agent.category}</p><p className="mt-2 line-clamp-1 text-xs text-muted">{agent.summary}</p>{agent.quality?.eligibilityReasons.length ? <p className="mt-2 line-clamp-1 text-[10px] text-warning">下一步：{agent.quality.eligibilityReasons.join(' · ')}</p> : null}</div></div>
              <div><p className="text-[10px] text-muted">信誉 / 置信度</p><p className="mt-1 font-mono text-base font-semibold">{agent.quality?.reputation ?? '—'} <span className="text-[10px] text-muted">{agent.quality?.confidence?.toUpperCase()}</span></p></div>
              <div><p className="text-[10px] text-muted">Endpoint</p><p className="mt-1 font-mono text-base font-semibold">{agent.quality ? agent.quality.endpointHealthy ? 'HEALTHY' : 'CHECK' : agent.responseTime}</p></div>
              <div><p className="text-[10px] text-muted">累计收益</p><p className="mt-1 font-mono text-base font-semibold">{Math.round(agent.volume * .78).toLocaleString()}</p></div>
              <div className="flex gap-2"><button type="button" disabled={busyAgent === agent.id} className="rounded-xl border border-line p-2.5 text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-45" onClick={() => void runAction(agent.id, () => toggleAgentStatus(agent.id))} aria-label={agent.status === 'active' ? `暂停 ${agent.name}` : `启动 ${agent.name}`}>{busyAgent === agent.id ? <LoaderCircle size={17} className="animate-spin" /> : agent.status === 'active' ? <Pause size={17} /> : <Play size={17} />}</button><button type="button" disabled={busyAgent === agent.id} className="rounded-xl border border-line p-2.5 text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-45" onClick={() => void runAction(agent.id, () => runAgentTrial(agent.id))} aria-label={`运行 ${agent.name} AI 试炼`}><RefreshCw size={17} /></button><Link to={`/agents/${agent.id}`} className="rounded-xl border border-line p-2.5 text-muted transition hover:bg-canvas hover:text-ink" aria-label={`设置 ${agent.name}`}><Settings2 size={17} /></Link><button type="button" className="rounded-xl border border-line p-2.5 text-muted transition hover:bg-canvas hover:text-ink" aria-label={`${agent.name} 更多操作`}><MoreVertical size={17} /></button></div>
            </div>
          </article>
        ))}
      </section>
      {ownedAgents.length === 0 ? <section className="panel py-14 text-center"><p className="text-sm font-semibold">还没有注册 Agent</p><p className="mt-2 text-xs text-muted">创建第一个端点档案后，可在这里运行 AI 试炼并控制上线状态。</p><Link className="btn-primary mt-5" to="/developer/agents/new"><Plus size={16} />注册 Agent</Link></section> : null}
    </div>
  );
}
