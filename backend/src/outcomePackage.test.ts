import { describe, expect, it } from 'vitest';
import { hasCurrentOutcomePackage } from '../../shared/outcomePackage';
import { buildClientDeliveryBundle } from './clientDelivery';
import { parseIpfsEvidence } from './ipfsEvidence';

const stages=[{id:'a',attemptNo:1},{id:'gate',attemptNo:2}];
const mission={id:'m',workflowVersion:3,deliveryPolicy:'outcome_v1'};
async function fixture() {
  const bundle=await buildClientDeliveryBundle({missionId:'m',missionTitle:'完整报告',stageId:null,stageName:'最终交付',attemptNo:null,agentId:null,agentName:'平台',logicalName:'成果包',title:'成果包',deliverableMarkdown:'# 真实成果\n\n这是实际工作结论。',acceptanceCriteriaSha256:`sha256:${'a'.repeat(64)}`,versionNo:1,supersedesRootCid:null,createdAt:'2026-09-05T00:00:00Z',outcomePackage:{schema:'agentmesh.mission-outcome.v1',workflowVersion:3,stages:stages.map(s=>({stageId:s.id,attemptNo:s.attemptNo}))}});
  const evidence=await parseIpfsEvidence({rootCid:'bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm',manifest:bundle.manifest,manifestSha256:bundle.manifestSha256,visibility:'public'}, {missionId:'m',stageId:null,attemptNo:null,agentId:null,logicalName:'成果包',acceptanceCriteriaSha256:bundle.manifest.acceptanceCriteriaSha256});
  return {missionId:'m',status:'submitted',ipfsEvidence:evidence};
}
describe('versioned outcome package gate',()=>{
  it('requires verified reports and binds every stage including approvals',async()=>{
    const d=await fixture();
    expect(hasCurrentOutcomePackage(mission,stages,[d])).toBe(false);
    d.ipfsEvidence.verificationStatus='verified';
    expect(hasCurrentOutcomePackage(mission,stages,[d])).toBe(true);
    expect(hasCurrentOutcomePackage({...mission,workflowVersion:4},stages,[d])).toBe(false);
    expect(hasCurrentOutcomePackage(mission,[...stages,{id:'b',attemptNo:1}],[d])).toBe(false);
    expect(hasCurrentOutcomePackage(mission,[{id:'a',attemptNo:2},stages[1]],[d])).toBe(false);
    expect(hasCurrentOutcomePackage(mission,stages,[{...d,status:'rejected'}])).toBe(false);
    d.ipfsEvidence.manifest.files=d.ipfsEvidence.manifest.files.filter(f=>f.path!=='artifact-index.md');
    expect(hasCurrentOutcomePackage(mission,stages,[d])).toBe(false);
  });
  it('preserves the explicitly legacy task boundary',()=>{
    expect(hasCurrentOutcomePackage({...mission,deliveryPolicy:undefined},stages,[])).toBe(true);
    expect(hasCurrentOutcomePackage(mission,stages,[])).toBe(false);
  });
});
