import type { Deliverable, WorkflowStage } from '../types/domain';

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function meaningfulOutput(stage: WorkflowStage): boolean {
  if (stage.status !== 'done') return false;
  if (stage.nodeType === 'approval') return true;
  const output = stage.output;
  if (!output || output.invalidated === true || objectValue(output.error)) return false;
  const result = objectValue(output.result) ?? output;
  if (result.completionStatus !== undefined && result.completionStatus !== 'succeeded') return false;
  if (!hasText(result.summary)) return false;
  return hasText(result.deliverable)
    || hasText(result.recommendation)
    || result.verified === true
    || (Array.isArray(result.findings) && result.findings.some(hasText));
}

export function deliveryReadiness(stages: WorkflowStage[], deliverables: Deliverable[]) {
  const taskStages = stages.filter((stage) => stage.nodeType === 'task').sort((left, right) => (
    (left.position ?? 0) - (right.position ?? 0)
  ));
  const implementStages = taskStages.filter((stage, index) => (
    stage.input?.executionMode === 'implement'
    || (stage.input?.executionMode === undefined && taskStages.length >= 3 && index > 0 && index < taskStages.length - 1)
  ));
  const deliveredStageIds = new Set(
    deliverables
      .filter((deliverable) => deliverable.status !== 'rejected' && deliverable.stageId)
      .map((deliverable) => deliverable.stageId),
  );
  const missingArtifactStages = implementStages.filter((stage) => !deliveredStageIds.has(stage.id));
  const invalidOutputStages = stages.filter((stage) => !meaningfulOutput(stage));
  return {
    ready: stages.length > 0 && invalidOutputStages.length === 0 && missingArtifactStages.length === 0,
    missingArtifactStages,
    invalidOutputStages,
  };
}
