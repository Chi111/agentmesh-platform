import { Activity, ExternalLink, MousePointer2, Pause, Play, ShieldCheck, X } from 'lucide-react';
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
  demoMode?: boolean;
  readOnly?: boolean;
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

export function AgentFleetScene({ agents, missions, busyAgentId, demoMode = false, readOnly = false, onToggleAgent }: AgentFleetSceneProps) {
  const fleet = useMemo(() => buildFleet(agents, missions), [agents, missions]);
  const visibleFleet = fleet.slice(0, MAX_VISIBLE_AGENTS);
  const [selectedId, setSelectedId] = useState('');
  const selected = visibleFleet.find((node) => node.agent.id === selectedId) ?? null;
  const officeActors: AgentOfficeActor[] = visibleFleet.map((node) => ({
    id: node.agent.id,
    name: node.agent.name,
    state: node.state,
    accent: node.agent.accent,
    statusLabel: node.label,
  }));

  useEffect(() => {
    if (!selectedId || visibleFleet.some((node) => node.agent.id === selectedId)) return;
    setSelectedId('');
  }, [selectedId, visibleFleet]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const closeCard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId('');
    };
    window.addEventListener('keydown', closeCard);
    return () => window.removeEventListener('keydown', closeCard);
  }, [selectedId]);

  const stateCounts = fleet.reduce<Record<FleetState, number>>((counts, node) => {
    counts[node.state] += 1;
    return counts;
  }, { executing: 0, assigned: 0, ready: 0, trial: 0, paused: 0, attention: 0 });

  return (
    <section className="agent-fleet-immersive" data-card-open={selected ? 'true' : 'false'} role="region" aria-label="Agent 数字孪生指挥舱">
      <div className="agent-fleet-world">
        <AgentOfficeCanvas actors={officeActors} selectedId={selectedId} onSelect={setSelectedId} onClearSelection={() => setSelectedId('')} />
      </div>

      <header className="agent-fleet-overlay-header">
        <div className="agent-fleet-title-block">
          <p>PINME-MESH · DIGITAL WORKPLACE</p>
          <h1><Activity size={17} aria-hidden="true" />3D 指挥舱</h1>
        </div>
        <div className="agent-fleet-status-strip" aria-label="Agent 状态汇总">
          <span className="agent-fleet-summary" data-state="executing">{stateCounts.executing} 执行</span>
          {stateCounts.assigned ? <span className="agent-fleet-summary" data-state="assigned">{stateCounts.assigned} 待接单</span> : null}
          <span className="agent-fleet-summary" data-state="ready">{stateCounts.ready} 待命</span>
          {stateCounts.trial ? <span className="agent-fleet-summary" data-state="trial">{stateCounts.trial} 试炼</span> : null}
          {stateCounts.attention ? <span className="agent-fleet-summary" data-state="attention">{stateCounts.attention} 异常</span> : null}
          {stateCounts.paused ? <span className="agent-fleet-summary" data-state="paused">{stateCounts.paused} 暂停</span> : null}
        </div>
      </header>

      {!selected ? <div className="agent-fleet-click-hint"><MousePointer2 size={15} /><span>拖拽旋转 · 滚轮或双指缩放 ±20% · 点击 Agent 查看卡片</span>{demoMode ? <small>公开 Agent 演示空间 · 只读</small> : null}</div> : null}

      <div className="sr-only" role="group" aria-label="可查看的 Agent">
        {visibleFleet.map((node) => <button type="button" key={node.agent.id} onClick={() => setSelectedId(node.agent.id)}>查看 {node.agent.name} 工作卡片</button>)}
      </div>

      {selected ? <aside className="agent-fleet-card" role="dialog" aria-modal="false" aria-labelledby="agent-fleet-card-title" aria-live="polite">
        <button type="button" className="agent-fleet-card-close" onClick={() => setSelectedId('')} aria-label="关闭 Agent 工作卡片"><X size={17} /></button>

        <div className="flex items-start gap-3 pr-9">
          <NounAgentAvatar agent={selected.agent} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="agent-fleet-card-title" className="truncate text-base font-semibold">{selected.agent.name}</h2>
              <StatusBadge tone={selected.tone} variant="inverted">{selected.label}</StatusBadge>
            </div>
            <p className="mt-1 truncate font-mono text-[9px] text-ink/45">{selected.agent.version} · {selected.agent.category}</p>
          </div>
        </div>

        <p className="agent-fleet-card-detail">{selected.detail}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="agent-fleet-metric"><span>信誉</span><strong>{selected.agent.quality?.reputation ?? selected.agent.trustScore ?? '—'}</strong></div>
          <div className="agent-fleet-metric"><span>成功率</span><strong>{selected.agent.successRate.toFixed(1)}%</strong></div>
          <div className="agent-fleet-metric"><span>Endpoint</span><strong>{selected.agent.quality ? selected.agent.quality.endpointHealthy ? 'HEALTHY' : 'CHECK' : selected.agent.responseTime}</strong></div>
          <div className="agent-fleet-metric"><span>接单量</span><strong>{selected.agent.quality?.settledJobs ?? selected.agent.jobs}</strong></div>
        </div>

        {selected.mission ? <div className="agent-fleet-mission">
          <div className="flex items-center justify-between gap-3"><span>当前任务</span><code>{selected.mission.id}</code></div>
          <p>{selected.mission.title}</p>
          <div className="mt-3 h-1.5 overflow-hidden bg-ink/10"><span className="block h-full bg-gradient-to-r from-cyan to-lime" style={{ width: `${Math.max(2, selected.mission.progress)}%` }} /></div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-ink/45"><span>{selected.mission.currentStage}</span><span>{selected.mission.progress}%</span></div>
        </div> : <div className="agent-fleet-mission"><span>当前任务</span><p className="font-normal text-ink/60">没有进行中的任务，可接受新的调度。</p></div>}

        <div className="mt-5">
          <p className="mb-3 flex items-center gap-1.5 text-[9px] text-ink/45"><ShieldCheck size={12} />{formatHealthCheck(selected.agent.quality?.lastHealthCheckAt)}</p>
          <div className={`grid gap-2 ${readOnly ? '' : 'grid-cols-2'}`}>
            {!readOnly ? <button type="button" className="agent-fleet-card-action" disabled={busyAgentId === selected.agent.id} onClick={() => void onToggleAgent(selected.agent.id)}>
              {selected.agent.status === 'active' ? <Pause size={14} /> : <Play size={14} />}{selected.agent.status === 'active' ? '暂停' : '启动'}
            </button> : null}
            <Link className="agent-fleet-card-primary" to={`/agents/${selected.agent.id}`}>查看完整档案 <ExternalLink size={13} /></Link>
          </div>
        </div>
      </aside> : null}
    </section>
  );
}
