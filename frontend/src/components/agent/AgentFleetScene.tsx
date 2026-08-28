import { Activity, Bot, ExternalLink, Pause, Play, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Agent, Mission } from '../../types/domain';
import { AgentOfficeCanvas, type AgentOfficeActor } from './AgentOfficeCanvas';
import { StatusBadge, type StatusTone } from '../ui/StatusBadge';

type FleetState = 'executing' | 'assigned' | 'ready' | 'trial' | 'paused' | 'attention';

interface FleetNode {
  agent: Agent;
  mission: Mission | null;
  state: FleetState;
  label: string;
  detail: string;
  tone: StatusTone;
  priority: number;
}

interface AgentFleetSceneProps {
  agents: Agent[];
  missions: Mission[];
  busyAgentId: string | null;
  onToggleAgent: (agentId: string) => Promise<void>;
}

const ACTIVE_MISSION_STATES = new Set<Mission['status']>(['matching', 'running', 'paused', 'review']);
const MAX_VISIBLE_AGENTS = 8;

function relatedMission(agent: Agent, missions: Mission[]) {
  return missions.find((mission) => mission.team.includes(agent.id) && ACTIVE_MISSION_STATES.has(mission.status)) ?? null;
}

function describeNode(agent: Agent, mission: Mission | null): Omit<FleetNode, 'agent' | 'mission'> {
  if (agent.quality && (!agent.quality.endpointHealthy || agent.quality.marketplaceStatus === 'suspended')) {
    return { state: 'attention', label: '需要检查', detail: 'Endpoint 或市场质量门禁异常', tone: 'danger', priority: 0 };
  }
  if (agent.status === 'paused') {
    return { state: 'paused', label: '已暂停', detail: '当前不会接受新的任务分发', tone: 'neutral', priority: 5 };
  }
  if (mission?.status === 'running' || mission?.status === 'review' || mission?.status === 'paused') {
    const label = mission.status === 'review' ? '等待验收' : mission.status === 'paused' ? '任务暂停' : '执行中';
    return { state: 'executing', label, detail: mission.currentStage, tone: mission.status === 'paused' ? 'warning' : 'success', priority: 1 };
  }
  if (mission?.status === 'matching') {
    return { state: 'assigned', label: '等待接单', detail: mission.currentStage, tone: 'warning', priority: 2 };
  }
  if (agent.status === 'trial') {
    return { state: 'trial', label: '试炼中', detail: '等待 Trial 与质量门禁结果', tone: 'warning', priority: 3 };
  }
  return { state: 'ready', label: '在线待命', detail: '可以接受新的任务分发', tone: 'info', priority: 4 };
}

function buildFleet(agents: Agent[], missions: Mission[]) {
  return agents
    .map((agent) => {
      const mission = relatedMission(agent, missions);
      return { agent, mission, ...describeNode(agent, mission) };
    })
    .sort((left, right) => left.priority - right.priority || left.agent.name.localeCompare(right.agent.name, 'zh-CN'));
}

function formatHealthCheck(value: string | null | undefined) {
  if (!value) return '尚无健康检查';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `检查于 ${date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function NounAgentAvatar({ agent }: { agent: Agent }) {
  return <div className="agent-noun-avatar" data-accent={agent.accent} aria-hidden="true">
    <span className="agent-noun-avatar-trait" />
    <span className="agent-noun-avatar-head">
      <i /><i /><b />
    </span>
    <span className="agent-noun-avatar-body" />
  </div>;
}

export function AgentFleetScene({ agents, missions, busyAgentId, onToggleAgent }: AgentFleetSceneProps) {
  const fleet = useMemo(() => buildFleet(agents, missions), [agents, missions]);
  const visibleFleet = fleet.slice(0, MAX_VISIBLE_AGENTS);
  const [selectedId, setSelectedId] = useState(visibleFleet[0]?.agent.id ?? '');
  const selected = fleet.find((node) => node.agent.id === selectedId) ?? visibleFleet[0] ?? null;
  const officeActors: AgentOfficeActor[] = visibleFleet.map((node) => ({
    id: node.agent.id,
    name: node.agent.name,
    state: node.state,
    accent: node.agent.accent,
    statusLabel: node.label,
  }));

  useEffect(() => {
    if (fleet.some((node) => node.agent.id === selectedId)) return;
    setSelectedId(fleet[0]?.agent.id ?? '');
  }, [fleet, selectedId]);

  const stateCounts = fleet.reduce<Record<FleetState, number>>((counts, node) => {
    counts[node.state] += 1;
    return counts;
  }, { executing: 0, assigned: 0, ready: 0, trial: 0, paused: 0, attention: 0 });

  if (!selected) return null;

  return (
    <section className="agent-fleet-shell overflow-hidden rounded-[28px] border border-ink/20 text-ink shadow-card" aria-labelledby="agent-fleet-title">
      <div className="agent-fleet-header flex flex-col gap-4 border-b border-ink/15 px-5 py-5 sm:flex-row sm:items-start sm:justify-between md:px-6">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-cyan">Nounish workspace · 3D digital twin</p>
          <div className="mt-2 flex items-center gap-2">
            <Activity size={18} className="text-lime" aria-hidden="true" />
            <h2 id="agent-fleet-title" className="text-lg font-semibold">Agent 数字孪生指挥舱</h2>
            <span className="agent-fleet-live-badge">NOUNISH 3D</span>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-ink/55">把 Agent、任务和质量状态映射成实时空间行为：员工会在功能区之间切换，任务链路以像素数据流呈现，并支持自动镜头巡航。</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Agent 状态汇总">
          <span className="agent-fleet-summary" data-state="executing">{stateCounts.executing} 执行</span>
          {stateCounts.assigned ? <span className="agent-fleet-summary" data-state="assigned">{stateCounts.assigned} 待接单</span> : null}
          <span className="agent-fleet-summary" data-state="ready">{stateCounts.ready} 待命</span>
          <span className="agent-fleet-summary" data-state="trial">{stateCounts.trial} 试炼</span>
          {stateCounts.attention ? <span className="agent-fleet-summary" data-state="attention">{stateCounts.attention} 异常</span> : null}
          {stateCounts.paused ? <span className="agent-fleet-summary" data-state="paused">{stateCounts.paused} 暂停</span> : null}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="agent-fleet-stage relative min-h-[460px] overflow-hidden border-b border-ink/15 lg:min-h-[550px] lg:border-b-0 lg:border-r">
          <div className="absolute inset-x-0 bottom-[72px] top-0">
            <AgentOfficeCanvas actors={officeActors} selectedId={selected.agent.id} onSelect={setSelectedId} />
          </div>
          <div className="agent-office-roster absolute inset-x-0 bottom-0 z-10 flex gap-2 overflow-x-auto border-t border-ink/15 bg-panel/95 px-4 py-3" role="group" aria-label="选择一个 Agent 员工查看状态">
            {visibleFleet.map((node) => <button type="button" key={node.agent.id} data-state={node.state} data-selected={selected.agent.id === node.agent.id} aria-pressed={selected.agent.id === node.agent.id} aria-label={`${node.agent.name}，${node.label}`} onClick={() => setSelectedId(node.agent.id)}><Bot size={13} aria-hidden="true" /><span>{node.agent.name}</span><small>{node.label}</small></button>)}
          </div>
        </div>

        <aside className="agent-fleet-inspector flex min-h-[390px] flex-col p-5 md:p-6" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <NounAgentAvatar agent={selected.agent} />
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{selected.agent.name}</h3>
                <p className="mt-1 truncate font-mono text-[9px] text-ink/45">{selected.agent.version} · {selected.agent.category}</p>
              </div>
            </div>
            <StatusBadge tone={selected.tone} variant="inverted">{selected.label}</StatusBadge>
          </div>

          <p className="mt-5 rounded-xl border border-ink/15 bg-white/55 p-3 text-xs leading-5 text-ink/65">{selected.detail}</p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="agent-fleet-metric"><span>信誉</span><strong>{selected.agent.quality?.reputation ?? selected.agent.trustScore ?? '—'}</strong></div>
            <div className="agent-fleet-metric"><span>成功率</span><strong>{selected.agent.successRate.toFixed(1)}%</strong></div>
            <div className="agent-fleet-metric"><span>Endpoint</span><strong>{selected.agent.quality ? selected.agent.quality.endpointHealthy ? 'HEALTHY' : 'CHECK' : selected.agent.responseTime}</strong></div>
            <div className="agent-fleet-metric"><span>接单量</span><strong>{selected.agent.quality?.settledJobs ?? selected.agent.jobs}</strong></div>
          </div>

          {selected.mission ? <div className="mt-5 border-t border-ink/15 pt-5">
            <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-ink/45">当前任务</span><span className="font-mono text-[9px] text-cyan">{selected.mission.id}</span></div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5">{selected.mission.title}</p>
            <div className="mt-3 h-1.5 overflow-hidden bg-ink/10"><span className="block h-full bg-gradient-to-r from-cyan to-lime" style={{ width: `${Math.max(2, selected.mission.progress)}%` }} /></div>
            <div className="mt-2 flex justify-between font-mono text-[9px] text-ink/45"><span>{selected.mission.currentStage}</span><span>{selected.mission.progress}%</span></div>
          </div> : <div className="mt-5 border-t border-ink/15 pt-5"><p className="text-[10px] text-ink/45">当前任务</p><p className="mt-2 text-xs text-ink/65">没有进行中的任务，可接受新的调度。</p></div>}

          <div className="mt-auto pt-6">
            <p className="mb-3 flex items-center gap-1.5 text-[9px] text-ink/45"><ShieldCheck size={12} />{formatHealthCheck(selected.agent.quality?.lastHealthCheckAt)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-ink/20 bg-white/55 px-3 text-xs font-semibold text-ink transition hover:bg-white disabled:opacity-40" disabled={busyAgentId === selected.agent.id} onClick={() => void onToggleAgent(selected.agent.id)}>
                {selected.agent.status === 'active' ? <Pause size={14} /> : <Play size={14} />}{selected.agent.status === 'active' ? '暂停' : '启动'}
              </button>
              <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-ink px-3 text-xs font-semibold text-white transition hover:bg-cyan hover:text-ink" to={`/agents/${selected.agent.id}`}>详情 <ExternalLink size={13} /></Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
