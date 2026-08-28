import { describe, expect, it } from 'vitest';
import { canonicalJson, IpfsEvidenceError, normalizeCid, parseIpfsEvidence, sha256Json } from './ipfsEvidence';

const ROOT_CID = 'bafybeie5nqv6kd3qnfjuprw2scvucpip5xwh3yluiopmqcktiamcu54bdm';
const ACCEPTANCE_HASH = `sha256:${'a'.repeat(64)}`;

function manifest() {
  return {
    schema: 'agentmesh.deliverable-manifest.v1' as const,
    missionId: 'TASK-2026-IPFS',
    stageId: 'stage-build',
    attemptNo: 2,
    agentId: 'agent-builder',
    logicalName: '交付目录',
    versionNo: 1,
    supersedesRootCid: null,
    acceptanceCriteriaSha256: ACCEPTANCE_HASH,
    createdAt: '2026-08-27T12:00:00.000Z',
    generator: 'agentmesh-pinme-publisher/1',
    files: [{
      path: 'dist/index.html',
      sha256: `sha256:${'b'.repeat(64)}`,
      mimeType: 'text/html',
      byteSize: 42,
    }],
  };
}

describe('PinMe/IPFS evidence', () => {
  it('canonicalizes object keys and hashes deterministically', async () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(await sha256Json({ b: 2, a: 1 })).toBe(await sha256Json({ a: 1, b: 2 }));
  });

  it('bounds canonical JSON depth before hashing untrusted Manifests', () => {
    let nested: unknown = 'leaf';
    for (let depth = 0; depth < 70; depth += 1) nested = { child: nested };
    expect(() => canonicalJson(nested)).toThrow('Canonical JSON exceeds the depth or node limit');
  });

  it('uses a real CID parser and normalizes to CIDv1', () => {
    expect(normalizeCid(ROOT_CID)).toBe(ROOT_CID);
    expect(() => normalizeCid('bafy-not-a-cid')).toThrow(IpfsEvidenceError);
  });

  it('binds the canonical Manifest to mission, attempt, criteria and version metadata', async () => {
    const value = manifest();
    const evidence = await parseIpfsEvidence({
      rootCid: ROOT_CID,
      manifestSha256: await sha256Json(value),
      manifest: value,
      visibility: 'public',
      supersedesDeliverableId: null,
    }, {
      missionId: value.missionId,
      stageId: value.stageId,
      attemptNo: value.attemptNo,
      agentId: value.agentId,
      logicalName: value.logicalName,
      acceptanceCriteriaSha256: ACCEPTANCE_HASH,
    });
    expect(evidence).toMatchObject({
      rootCid: ROOT_CID,
      versionNo: 1,
      fileCount: 1,
      totalBytes: 42,
      scopeKey: 'stage:stage-build:attempt:2',
      verificationStatus: 'declared',
    });
  });

  it('requires only a SHA-256 key fingerprint for encrypted evidence', async () => {
    const missing = manifest();
    await expect(parseIpfsEvidence({
      rootCid: ROOT_CID, manifestSha256: await sha256Json(missing), manifest: missing, visibility: 'encrypted',
    }, {
      missionId: missing.missionId, stageId: missing.stageId, attemptNo: missing.attemptNo, agentId: missing.agentId,
      logicalName: missing.logicalName, acceptanceCriteriaSha256: ACCEPTANCE_HASH,
    })).rejects.toMatchObject({ code: 'INVALID_ENCRYPTION_FINGERPRINT' });

    const encrypted = { ...manifest(), encryptionKeyFingerprint: `sha256:${'e'.repeat(64)}` };
    const evidence = await parseIpfsEvidence({
      rootCid: ROOT_CID, manifestSha256: await sha256Json(encrypted), manifest: encrypted, visibility: 'encrypted',
    }, {
      missionId: encrypted.missionId, stageId: encrypted.stageId, attemptNo: encrypted.attemptNo, agentId: encrypted.agentId,
      logicalName: encrypted.logicalName, acceptanceCriteriaSha256: ACCEPTANCE_HASH,
    });
    expect(evidence.manifest.encryptionKeyFingerprint).toBe(encrypted.encryptionKeyFingerprint);
  });

  it('rejects stale criteria, unsafe paths and mismatched Manifest hashes', async () => {
    const stale = manifest();
    stale.acceptanceCriteriaSha256 = `sha256:${'c'.repeat(64)}`;
    await expect(parseIpfsEvidence({
      rootCid: ROOT_CID, manifestSha256: await sha256Json(stale), manifest: stale, visibility: 'public',
    }, {
      missionId: stale.missionId, stageId: stale.stageId, attemptNo: stale.attemptNo, agentId: stale.agentId,
      logicalName: stale.logicalName, acceptanceCriteriaSha256: ACCEPTANCE_HASH,
    })).rejects.toMatchObject({ code: 'ACCEPTANCE_CRITERIA_MISMATCH' });

    const unsafe = manifest();
    unsafe.files[0].path = '../secret.txt';
    await expect(parseIpfsEvidence({
      rootCid: ROOT_CID, manifestSha256: await sha256Json(unsafe), manifest: unsafe, visibility: 'public',
    }, {
      missionId: unsafe.missionId, stageId: unsafe.stageId, attemptNo: unsafe.attemptNo, agentId: unsafe.agentId,
      logicalName: unsafe.logicalName, acceptanceCriteriaSha256: ACCEPTANCE_HASH,
    })).rejects.toMatchObject({ code: 'INVALID_MANIFEST_PATH' });

    await expect(parseIpfsEvidence({
      rootCid: ROOT_CID, manifestSha256: `sha256:${'d'.repeat(64)}`, manifest: manifest(), visibility: 'public',
    }, {
      missionId: 'TASK-2026-IPFS', stageId: 'stage-build', attemptNo: 2, agentId: 'agent-builder',
      logicalName: '交付目录', acceptanceCriteriaSha256: ACCEPTANCE_HASH,
    })).rejects.toMatchObject({ code: 'MANIFEST_HASH_MISMATCH' });
  });
});
