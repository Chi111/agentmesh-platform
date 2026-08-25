import { Bot, CheckCircle2, Clock3, ShieldCheck, XCircle } from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowStage } from '../../types/domain';

export const WORKFLOW_NODE_WIDTH = 250;
export const WORKFLOW_NODE_HEIGHT = 184;

export interface WorkflowNodeData extends Record<string, unknown> {
  stage: WorkflowStage;
  agentName: string | null;
  blocked?: boolean;
  readonly?: boolean;
}

const statusLabel: Record<WorkflowStage['status'], string> = {
  queued: '等待',
  running: '执行中',
  done: '已完成',
  failed: '失败',
};

export function WorkflowNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const { stage, agentName, blocked, readonly } = nodeData;
  const isGate = stage.nodeType === 'approval';
  const awaitingApproval = isGate && stage.status === 'running';
  const tone = blocked || awaitingApproval
    ? 'border-amber-400/60 bg-amber-50'
    : stage.status === 'done'
      ? 'border-lime-500/50 bg-lime-50'
      : stage.status === 'failed'
        ? 'border-danger/60 bg-red-50'
        : stage.status === 'running'
          ? 'border-cyan bg-[#ecfbfd] shadow-[0_0_0_3px_rgba(0,184,217,.1)]'
          : 'border-line bg-white';
  return (
    <article className={`h-[184px] w-[250px] rounded-2xl border p-4 text-left shadow-card transition ${tone} ${selected ? `ring-2 ring-cyan ring-offset-2 ${readonly ? 'ring-offset-ink' : 'ring-offset-white'}` : ''}`}>
      <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-white !bg-cyan" />
      <div className="flex items-start justify-between gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${isGate ? 'bg-amber-100 text-amber-700' : 'bg-ink text-cyan'}`}>
          {isGate ? <ShieldCheck size={18} /> : <Bot size={18} />}
        </span>
        <span className="rounded-md bg-canvas px-2 py-1 font-mono text-[9px] text-muted">{isGate ? 'GATE' : `TASK · ${stage.position}`}</span>
      </div>
      <h3 className="mt-3 truncate text-sm font-semibold text-ink">{stage.name}</h3>
      <p className="mt-1 line-clamp-2 min-h-10 text-[11px] leading-5 text-muted">{stage.purpose}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-[10px]">
        <span className="truncate font-semibold text-ink">{isGate ? '任务方审批' : agentName ?? '未分配 Agent'}</span>
        <span className={`inline-flex shrink-0 items-center gap-1 ${blocked || awaitingApproval ? 'text-amber-700' : stage.status === 'failed' ? 'text-danger' : stage.status === 'done' ? 'text-lime-700' : stage.status === 'running' ? 'text-[#007f96]' : 'text-muted'}`}>
          {blocked ? <Clock3 size={11} /> : stage.status === 'failed' ? <XCircle size={11} /> : stage.status === 'done' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
          {blocked ? '阻塞' : isGate && stage.status === 'running' ? '待审批' : statusLabel[stage.status]}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-white !bg-cyan" />
    </article>
  );
}
