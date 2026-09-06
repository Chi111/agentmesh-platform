export interface OutcomePackage {
  schema: 'agentmesh.mission-outcome.v1';
  workflowVersion: number;
  stages: Array<{ stageId: string; attemptNo: number }>;
}

// Shared by the API and acceptance UI. Identity/version checks do not judge prose quality.
export function hasCurrentOutcomePackage(
  mission: { id: string; workflowVersion: number; deliveryPolicy?: string },
  stages: Array<{ id: string; attemptNo: number }>,
  deliverables: Array<{ missionId?: string; status: string; ipfsEvidence?: { verificationStatus: string; manifest: {
    missionId: string; outcomePackage?: OutcomePackage; files: Array<{ path: string; byteSize: number }>;
  } } | null }>,
): boolean {
  if (mission.deliveryPolicy !== 'outcome_v1') return true;
  return deliverables.some(d => {
    const evidence = d.ipfsEvidence, manifest = evidence?.manifest, proof = manifest?.outcomePackage;
    return d.missionId === mission.id && d.status !== 'rejected' && evidence?.verificationStatus === 'verified'
      && manifest?.missionId === mission.id && proof?.schema === 'agentmesh.mission-outcome.v1'
      && proof.workflowVersion === mission.workflowVersion && proof.stages.length === stages.length
      && new Set(proof.stages.map(s => s.stageId)).size === stages.length
      && stages.every(s => proof.stages.some(p => p.stageId === s.id && p.attemptNo === (s.attemptNo || 1)))
      && ['deliverable.md', 'index.html', 'acceptance-report.md', 'artifact-index.md'].every(path =>
        manifest.files.some(file => file.path === path && file.byteSize > 0));
  });
}
