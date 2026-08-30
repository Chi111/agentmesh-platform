import '@xyflow/react/dist/style.css';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import { CheckCircle2, ExternalLink, FileCheck2, LoaderCircle, RotateCcw, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Agent, Deliverable, ExecutionEvent, WorkflowEdge, WorkflowStage, WorkflowTransitionCheckpoint } from '../../types/domain';
import { artifactBelongsToCurrentAttempt } from '../../utils/delivery';
import {
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
  WorkflowNodeCard,
  type WorkflowNodeData,
} from './WorkflowNodeCard';
import { hasWorkflowNodeOverlap, layoutWorkflowNodes } from './workflowLayout';

interface Props {
  stages: WorkflowStage[];
  edges: WorkflowEdge[];
  agents: Agent[];
  events: ExecutionEvent[];
  deliverables: Deliverable[];
  transitions: WorkflowTransitionCheckpoint[];
  canApprove: boolean;
  canRework: boolean;
  canRetry: boolean;
  canRecoverRunning: boolean;
  busy: boolean;
  onApprove: (gateId: string, feedback: string) => Promise<void>;
  onReject: (gateId: string, feedback: string, reworkNodeIds: string[]) => Promise<void>;
  onRetry: (nodeId: string) => Promise<void>;
}

const nodeTypes = { workflowNode: WorkflowNodeCard };

function blockedIds(stages: WorkflowStage[], edges: WorkflowEdge[]): Set<string> {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const blocked = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    stages.forEach((stage) => {
      if (stage.status !== 'queued' || blocked.has(stage.id)) return;
      if (edges.filter((edge) => edge.targetStageId === stage.id).some((edge) => byId.get(edge.sourceStageId)?.status === 'failed' || blocked.has(edge.sourceStageId))) {
        blocked.add(stage.id);
        changed = true;
      }
    });
  }
  return blocked;
}

export function WorkflowExecutionGraph({ stages, edges, agents, events, deliverables, transitions, canApprove, canRework, canRetry: retryAllowed, canRecoverRunning, busy, onApprove, onReject, onRetry }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [reworkIds, setReworkIds] = useState<string[]>([]);
  const blocked = useMemo(() => blockedIds(stages, edges), [edges, stages]);
  const currentTransitions = useMemo(() => {
    const attemptByStage = new Map(stages.map((stage) => [stage.id, stage.attemptNo ?? 1]));
    return transitions.filter((checkpoint) => (
      attemptByStage.get(checkpoint.sourceStageId) === checkpoint.sourceAttemptNo
    ));
  }, [stages, transitions]);
  const rawNodes = useMemo<Array<Node<WorkflowNodeData>>>(() => stages.map((stage) => ({
    id: stage.id,
    type: 'workflowNode',
    position: { x: stage.positionX, y: stage.positionY },
    initialWidth: WORKFLOW_NODE_WIDTH,
    initialHeight: WORKFLOW_NODE_HEIGHT,
    data: {
      stage,
      agentName: agents.find((agent) => agent.id === stage.agentId)?.name ?? null,
      blocked: blocked.has(stage.id),
      readonly: true,
    },
  })), [agents, blocked, stages]);
  const flowEdges = useMemo<Edge[]>(() => edges.map((edge) => {
    const checkpoint = [...currentTransitions].reverse().find((item) => item.edgeId === edge.id);
    const conditional = Boolean(edge.condition);
    return {
      id: edge.id,
      source: edge.sourceStageId,
      target: edge.targetStageId,
      type: 'smoothstep',
      animated: stages.find((stage) => stage.id === edge.targetStageId)?.status === 'running',
      label: checkpoint?.errorCode ? '映射失败' : checkpoint ? checkpoint.matched ? '已转换' : '已跳过' : conditional ? '待判断' : edge.mappings?.length ? `映射 ${edge.mappings.length}` : undefined,
      labelStyle: { fill: checkpoint?.errorCode ? '#f87171' : checkpoint?.matched === false ? '#fbbf24' : '#94a3b8', fontSize: 9 },
      style: {
        stroke: checkpoint?.errorCode ? '#ef4444' : checkpoint?.matched === false ? '#f59e0b' : checkpoint ? '#84cc16' : conditional ? '#f59e0b' : '#667078',
        strokeWidth: 1.5,
        strokeDasharray: conditional ? '6 4' : undefined,
      },
    };
  }), [currentTransitions, edges, stages]);
  const nodes = useMemo(
    () => hasWorkflowNodeOverlap(rawNodes) ? layoutWorkflowNodes(rawNodes, flowEdges) : rawNodes,
    [flowEdges, rawNodes],
  );
  const selected = stages.find((stage) => stage.id === selectedId) ?? null;
  const upstream = selected ? edges.filter((edge) => edge.targetStageId === selected.id)
    .map((edge) => stages.find((stage) => stage.id === edge.sourceStageId))
    .filter((stage): stage is WorkflowStage => Boolean(stage)) : [];
  const nodeEvents = selected ? events.filter((event) => event.stageId === selected.id).slice(-6).reverse() : [];
  const nodeTransitions = selected ? currentTransitions.filter((checkpoint) => checkpoint.targetStageId === selected.id).slice(-6).reverse() : [];
  const selectedAgent = selected?.agentId ? agents.find((agent) => agent.id === selected.agentId) ?? null : null;
  const nodeDeliverables = selected ? deliverables.filter((deliverable) => (
    artifactBelongsToCurrentAttempt(selected, deliverable)
  )) : [];
  const selectedInput = selected?.input ?? {};
  const canRecover = canRecoverRunning && selected?.nodeType === 'task'
    && selected.status === 'running' && selectedAgent?.official === true;
  const canRetry = retryAllowed && selected?.nodeType === 'task' && selected.status === 'failed';
  const canDecideGate = canApprove && selected?.nodeType === 'approval' && selected.status === 'running';
  const selectNode = (nextId: string | null) => {
    if (nextId === selectedId) return;
    setSelectedId(nextId);
    setFeedback('');
    setReworkIds([]);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink text-white xl:flex xl:h-full xl:min-h-0 xl:flex-col" data-testid="workflow-execution-graph">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-4 py-3 text-[10px] text-white/45"><span className="font-semibold text-white/70">执行状态</span>{[['bg-white/30', '等待'], ['bg-cyan', '执行中'], ['bg-lime-500', '完成'], ['bg-red-500', '失败'], ['bg-amber-400', '阻塞 / 待审批']].map(([tone, label]) => <span className="inline-flex items-center gap-1.5" key={label}><span className={`size-2 rounded-full ${tone}`} />{label}</span>)}</div>
      <div className="h-[590px] min-h-[70vh] md:min-h-0 xl:h-auto xl:min-h-0 xl:flex-1">
        <ReactFlow
          className="workflow-execution-flow"
          colorMode="dark"
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.2 }}
          onNodeClick={(_, node) => selectNode(node.id)}
          onPaneClick={() => selectNode(null)}
          minZoom={0.15}
          maxZoom={2.5}
        >
          <Background gap={20} size={1} color="#25313a" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {selected ? <div className="flex max-h-[min(72dvh,640px)] min-h-0 flex-col border-t border-white/10 bg-black/20 xl:max-h-[44%] xl:shrink-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0b1116] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-semibold">{selected.name}</h3><span className="shrink-0 rounded bg-white/10 px-2 py-1 font-mono text-[9px] text-white/45">{selected.nodeType.toUpperCase()}</span></div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="font-mono text-[10px] text-white/45">{selected.progress}% · {blocked.has(selected.id) ? 'blocked' : selected.nodeType === 'approval' && selected.status === 'running' ? 'awaiting approval' : selected.status}</span>
            {canRetry ? <button type="button" className="btn-secondary !min-h-9 !px-3 !text-xs" disabled={busy} onClick={() => void onRetry(selected.id)}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}显式重试此节点</button> : null}
            {canRecover ? <button type="button" className="btn-secondary !min-h-9 !px-3 !text-xs" disabled={busy} onClick={() => void onRetry(selected.id)}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}恢复卡住的官方节点</button> : null}
            {canDecideGate ? <button type="button" className="btn-signal !min-h-9 !px-3 !text-xs" disabled={busy} onClick={() => void onApprove(selected.id, feedback)}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}批准</button> : null}
            {canDecideGate && canRework ? <button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-danger px-3 text-xs font-semibold text-white disabled:opacity-40" disabled={busy || !reworkIds.length || feedback.trim().length < 2} onClick={() => void onReject(selected.id, feedback, reworkIds)}>{busy ? <LoaderCircle size={14} className="animate-spin" /> : <XCircle size={14} />}驳回并返工</button> : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin]">
          {canDecideGate ? <div className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} className="text-amber-300" />人工审批 Gate</div><p className="mt-1 text-[10px] leading-4 text-white/40">{canRework ? '可直接批准；如需驳回，请填写反馈并选择至少一个直接上游节点返工。' : '管理员可批准当前 Gate；返工申请仅由任务方发起。'}</p><textarea className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan/50" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder={canRework ? '审批反馈（驳回时建议填写）' : '审批反馈（可选）'} />
            {canRework ? <div className="mt-3 flex flex-wrap gap-2">{upstream.filter((stage) => stage.nodeType === 'task').map((stage) => <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs transition hover:border-cyan/35" key={stage.id}><input type="checkbox" checked={reworkIds.includes(stage.id)} onChange={(event) => setReworkIds((items) => event.target.checked ? [...items, stage.id] : items.filter((id) => id !== stage.id))} />返工：{stage.name}</label>)}</div> : null}
          </div> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3"><div><p className="text-xs font-semibold">节点目标</p><p className="mt-2 text-xs leading-5 text-white/45">{selected.purpose}</p></div>{selected.nodeType === 'task' ? <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3"><div className="flex items-center gap-2 text-xs font-semibold"><UserRound size={14} className="text-cyan" />执行 Agent</div>{selectedAgent ? <><p className="mt-2 text-sm font-semibold">{selectedAgent.name}</p><p className="mt-1 text-[10px] text-white/40">{selectedAgent.category} · 信任分 {selectedAgent.trustScore.toFixed(1)} · 成功率 {selectedAgent.successRate.toFixed(1)}%</p></> : <p className="mt-2 text-xs text-amber-300">Agent 信息不可用</p>}</div> : null}{selectedInput.inputContract || selectedInput.outputContract ? <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-black/25 p-3"><p className="text-[10px] font-semibold text-white/60">输入契约</p><p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-white/35">{String(selectedInput.inputContract || '未配置')}</p></div><div className="rounded-lg bg-black/25 p-3"><p className="text-[10px] font-semibold text-white/60">输出契约</p><p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-white/35">{String(selectedInput.outputContract || '未配置')}</p></div></div> : null}{selected.output ? <div><p className="text-xs font-semibold">结构化输出</p><pre className="mt-2 max-h-44 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] text-white/45">{JSON.stringify(selected.output, null, 2)}</pre></div> : null}</div>
            <div className="space-y-4"><div><p className="text-xs font-semibold">转换检查点</p><div className="mt-2 space-y-2 font-mono text-[9px] text-white/40">{nodeTransitions.length ? nodeTransitions.map((checkpoint) => <div className="rounded-lg bg-black/20 px-3 py-2" key={checkpoint.id}><span>{checkpoint.edgeId} · attempt {checkpoint.sourceAttemptNo}</span><span className={`mt-1 block font-sans text-[10px] ${checkpoint.errorCode ? 'text-red-300' : checkpoint.matched ? 'text-lime-300' : 'text-amber-300'}`}>{checkpoint.errorCode ? `阻断：${checkpoint.errorCode}` : checkpoint.matched ? `已应用映射 ${Object.keys(checkpoint.mappedInput).length ? JSON.stringify(checkpoint.mappedInput) : '（无字段）'}` : '条件为假，分支已跳过'}</span></div>) : <p>暂无入站转换检查点</p>}</div></div><div><p className="text-xs font-semibold">最近事件</p><div className="mt-2 space-y-2 font-mono text-[9px] text-white/40">{nodeEvents.length ? nodeEvents.map((event) => <p className="rounded-lg bg-black/20 px-3 py-2" key={event.id}>{new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false })} · {event.type}<span className="mt-1 block font-sans text-[10px] text-white/55">{event.message}</span></p>) : <p>暂无节点事件</p>}</div></div><div><div className="flex items-center gap-2 text-xs font-semibold"><FileCheck2 size={14} className="text-lime-400" />节点交付物</div>{nodeDeliverables.length ? <div className="mt-2 space-y-2">{nodeDeliverables.map((artifact) => <a className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-xs hover:border-cyan/40" href={artifact.uri} target="_blank" rel="noreferrer" key={artifact.id}><span className="min-w-0"><strong className="block truncate">{artifact.name}</strong><span className="mt-1 block truncate font-mono text-[9px] text-white/35">{artifact.contentHash}</span></span><ExternalLink size={13} className="shrink-0 text-white/40" /></a>)}</div> : <p className="mt-2 text-[10px] text-white/35">该节点尚未登记独立交付物。</p>}</div></div>
          </div>
        </div>
      </div> : null}
    </div>
  );
}
