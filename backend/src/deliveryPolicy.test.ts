import { describe, expect, it } from 'vitest';
import type { Deliverable, WorkflowStage } from './contracts';
import { hasMeaningfulStageOutput, workflowDeliveryReadiness } from './deliveryPolicy';

function stage(mode: 'analyze' | 'implement' | 'review', output: WorkflowStage['output']): WorkflowStage {
  return {
    id: `stage-${mode}`, missionId: 'TASK-delivery-policy', position: 1, nodeType: 'task',
    positionX: 0, positionY: 0, progress: 100, name: mode, purpose: mode, category: '软件开发',
    budget: 100, status: 'done', agentId: 'engineering-agent', input: { executionMode: mode }, output,
    createdAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-23T00:00:00.000Z',
  };
}

function artifact(stageId: string, status: Deliverable['status'] = 'submitted'): Deliverable {
  return {
    id: 'DEL-policy', missionId: 'TASK-delivery-policy', stageId, agentId: 'engineering-agent',
    name: 'Source archive', uri: 'ipfs://bafydeliverypolicy', contentHash: `sha256:${'a'.repeat(64)}`,
    mimeType: 'application/zip', status, createdAt: '2026-08-23T00:00:00.000Z',
  };
}

describe('workflow delivery policy', () => {
  it('unwraps successful nested Agent results', () => {
    expect(hasMeaningfulStageOutput(stage('review', {
      runtime: 'mastra',
      result: { completionStatus: 'succeeded', summary: 'Review complete', findings: ['Tests passed'] },
    }))).toBe(true);
  });

  it('does not treat an Agent-reported blocked result as completion', () => {
    expect(hasMeaningfulStageOutput(stage('review', {
      result: { completionStatus: 'blocked', summary: 'Cannot package', deliverable: 'Missing upstream artifacts' },
    }))).toBe(false);
  });

  it('requires a non-rejected artifact owned by every implement node', () => {
    const implementation = stage('implement', { summary: 'Implemented', verified: true });
    expect(workflowDeliveryReadiness([implementation], []).code).toBe('ARTIFACT_REQUIRED');
    expect(workflowDeliveryReadiness([implementation], [artifact(implementation.id, 'rejected')]).code).toBe('ARTIFACT_REQUIRED');
    expect(workflowDeliveryReadiness([implementation], [artifact(implementation.id)])).toMatchObject({ ready: true, code: 'READY' });
  });

  it('infers the middle implementation node for legacy three-stage workflows', () => {
    const stages = [
      stage('analyze', { summary: 'Analyzed', verified: true }),
      stage('implement', { summary: 'Implemented', verified: true }),
      stage('review', { summary: 'Reviewed', verified: true }),
    ].map((item, index) => ({ ...item, id: `legacy-${index + 1}`, position: index + 1, input: {} }));
    expect(workflowDeliveryReadiness(stages, [])).toMatchObject({
      ready: false,
      code: 'ARTIFACT_REQUIRED',
      missingArtifactStageIds: ['legacy-2'],
    });
  });
});
