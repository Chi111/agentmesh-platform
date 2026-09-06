import { hasCurrentOutcomePackage } from '../../../shared/outcomePackage';
import type { Mission } from '../types/domain';
import type { Deliverable, MissionChangeRequest, WorkflowStage } from '../types/domain';

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
  if (output.source === 'deterministic-fallback') return false;
  const result = objectValue(output.result) ?? output;
  if (output.source === 'pinme-llm' && !hasText(result.deliverable)) return false;
  if (result.completionStatus !== undefined && result.completionStatus !== 'succeeded') return false;
  if (!hasText(result.summary)) return false;
  return hasText(result.deliverable)
    || hasText(result.recommendation)
    || result.verified === true
    || (Array.isArray(result.findings) && result.findings.some(hasText));
}

export function artifactBelongsToCurrentAttempt(stage: WorkflowStage, deliverable: Deliverable): boolean {
  if (deliverable.stageId !== stage.id) return false;
  const attemptNo = stage.attemptNo || 1;
  if (deliverable.attemptNo !== undefined && deliverable.attemptNo !== null) {
    return deliverable.attemptNo === attemptNo;
  }
  return attemptNo === 1;
}

export function isClientReadyArtifact(deliverable: Deliverable): boolean {
  const mimeType = deliverable.mimeType.trim().toLowerCase();
  return Boolean(deliverable.uri.trim())
    && mimeType !== 'application/json'
    && mimeType !== 'application/vnd.agentmesh.manifest+json';
}

export function missionDeliverableBelongsToCurrentVersion(
  deliverable: Deliverable,
  changeRequests: MissionChangeRequest[],
): boolean {
  if (deliverable.stageId) return false;
  if (changeRequests.length === 0) return true;
  if (!deliverable.createdAt) return false;
  const deliveredAt = Date.parse(deliverable.createdAt);
  const latestChangeAt = Math.max(...changeRequests.map((request) => Date.parse(request.createdAt)));
  return Number.isFinite(deliveredAt) && Number.isFinite(latestChangeAt) && deliveredAt >= latestChangeAt;
}

export function deliveryReadiness(stages: WorkflowStage[], deliverables: Deliverable[], mission?: Mission) {
  const taskStages = stages.filter((stage) => stage.nodeType === 'task').sort((left, right) => (
    (left.position ?? 0) - (right.position ?? 0)
  ));
  const implementStages = taskStages.filter((stage, index) => (
    stage.input?.executionMode === 'implement'
    || (stage.input?.executionMode === undefined && taskStages.length >= 3 && index > 0 && index < taskStages.length - 1)
  ));
  const missingArtifactStages = implementStages.filter((stage) => !deliverables.some((deliverable) => (
    deliverable.status !== 'rejected'
    && artifactBelongsToCurrentAttempt(stage, deliverable)
    && isClientReadyArtifact(deliverable)
  )));
  const invalidOutputStages = stages.filter((stage) => !meaningfulOutput(stage));
  return {
    missingOutcomePackage: Boolean(mission && !hasCurrentOutcomePackage(mission, stages, deliverables)),
    ready: (!mission || hasCurrentOutcomePackage(mission, stages, deliverables)) && stages.length > 0 && invalidOutputStages.length === 0 && missingArtifactStages.length === 0,
    missingArtifactStages,
    invalidOutputStages,
  };
}
