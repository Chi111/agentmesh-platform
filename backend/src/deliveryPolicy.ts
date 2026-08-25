import type { Deliverable, WorkflowStage } from './contracts';

export type ExecutionMode = 'analyze' | 'implement' | 'review';

export interface WorkflowDeliveryReadiness {
  ready: boolean;
  code: 'READY' | 'WORKFLOW_INCOMPLETE' | 'INVALID_STAGE_OUTPUT' | 'ARTIFACT_REQUIRED';
  missingOutputStageIds: string[];
  missingArtifactStageIds: string[];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

type ExecutionStage = Pick<WorkflowStage, 'id' | 'position' | 'nodeType' | 'input'>;

export function stageExecutionMode(stage: ExecutionStage, workflowStages: ExecutionStage[] = []): ExecutionMode {
  const value = stage.input.executionMode;
  if (value === 'analyze' || value === 'implement' || value === 'review') return value;
  const taskStages = workflowStages
    .filter((candidate) => candidate.nodeType === 'task')
    .sort((left, right) => left.position - right.position);
  const legacyIndex = taskStages.findIndex((candidate) => candidate.id === stage.id);
  if (taskStages.length >= 3 && legacyIndex > 0 && legacyIndex < taskStages.length - 1) return 'implement';
  return legacyIndex === taskStages.length - 1 && legacyIndex > 0 ? 'review' : 'analyze';
}

export function stageRequiresArtifact(stage: ExecutionStage, workflowStages: ExecutionStage[] = []): boolean {
  if (stage.nodeType !== 'task') return false;
  return stageExecutionMode(stage, workflowStages) === 'implement';
}

export function structuredStageResult(output: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!output || output.invalidated === true || objectValue(output.error)) return null;
  return objectValue(output.result) ?? output;
}

export function hasMeaningfulStageOutput(stage: Pick<WorkflowStage, 'nodeType' | 'status' | 'output'>): boolean {
  if (stage.status !== 'done') return false;
  if (stage.nodeType === 'approval') return true;
  const result = structuredStageResult(stage.output);
  if (!result) return false;
  const completionStatus = result.completionStatus;
  if (completionStatus !== undefined && completionStatus !== 'succeeded') return false;
  if (!hasText(result.summary)) return false;
  return hasText(result.deliverable)
    || hasText(result.recommendation)
    || result.verified === true
    || (Array.isArray(result.findings) && result.findings.some(hasText));
}

export function workflowDeliveryReadiness(
  stages: WorkflowStage[],
  deliverables: Deliverable[],
): WorkflowDeliveryReadiness {
  if (stages.length === 0) {
    return { ready: false, code: 'WORKFLOW_INCOMPLETE', missingOutputStageIds: [], missingArtifactStageIds: [] };
  }
  const incompleteStageIds = stages.filter((stage) => stage.status !== 'done').map((stage) => stage.id);
  if (incompleteStageIds.length > 0) {
    return {
      ready: false,
      code: 'WORKFLOW_INCOMPLETE',
      missingOutputStageIds: incompleteStageIds,
      missingArtifactStageIds: [],
    };
  }

  const missingOutputStageIds = stages
    .filter((stage) => !hasMeaningfulStageOutput(stage))
    .map((stage) => stage.id);
  if (missingOutputStageIds.length > 0) {
    return { ready: false, code: 'INVALID_STAGE_OUTPUT', missingOutputStageIds, missingArtifactStageIds: [] };
  }

  const deliveredStageIds = new Set(
    deliverables
      .filter((deliverable) => deliverable.status !== 'rejected' && deliverable.stageId)
      .map((deliverable) => deliverable.stageId as string),
  );
  const missingArtifactStageIds = stages
    .filter((stage) => stageRequiresArtifact(stage, stages) && !deliveredStageIds.has(stage.id))
    .map((stage) => stage.id);
  if (missingArtifactStageIds.length > 0) {
    return { ready: false, code: 'ARTIFACT_REQUIRED', missingOutputStageIds: [], missingArtifactStageIds };
  }

  return { ready: true, code: 'READY', missingOutputStageIds: [], missingArtifactStageIds: [] };
}
