import { CID } from 'multiformats/cid';
import type {
  Deliverable,
  DeliverableIpfsEvidence,
  DeliverableManifest,
  FrozenDeliverableEvidence,
  Mission,
  MissionChangeRequest,
  MissionEvidenceSnapshot,
  ReviewDossier,
  WorkflowStage,
} from './contracts';

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_MANIFEST_FILES = 2_000;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_CANONICAL_DEPTH = 64;
const MAX_CANONICAL_NODES = 100_000;

export class IpfsEvidenceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function canonicalJson(value: unknown): string {
  let nodes = 0;
  const visit = (item: unknown, depth: number): string => {
    nodes += 1;
    if (depth > MAX_CANONICAL_DEPTH || nodes > MAX_CANONICAL_NODES) {
      throw new IpfsEvidenceError('CANONICAL_JSON_TOO_COMPLEX', 'Canonical JSON exceeds the depth or node limit');
    }
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new IpfsEvidenceError('INVALID_CANONICAL_JSON', 'Canonical JSON numbers must be finite');
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map((entry) => visit(entry, depth + 1)).join(',')}]`;
    if (typeof item !== 'object') throw new IpfsEvidenceError('INVALID_CANONICAL_JSON', 'Canonical JSON contains a non-JSON value');
    const record = item as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${visit(record[key], depth + 1)}`).join(',')}}`;
  };
  return visit(value, 0);
}

export async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function normalizeCid(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) {
    throw new IpfsEvidenceError('INVALID_CID', 'rootCid must be a valid IPFS CID');
  }
  try {
    return CID.parse(value.trim()).toV1().toString();
  } catch {
    throw new IpfsEvidenceError('INVALID_CID', 'rootCid must be a valid IPFS CID');
  }
}

function stringField(record: Record<string, unknown>, key: string, max: number): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new IpfsEvidenceError('INVALID_MANIFEST', `manifest.${key} is invalid`);
  }
  return value.trim();
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerField(record: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = record[key];
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new IpfsEvidenceError('INVALID_MANIFEST', `manifest.${key} is invalid`);
  }
  return Number(value);
}

export async function acceptanceCriteriaEvidence(
  mission: Mission,
  stages: WorkflowStage[],
  changeRequests: MissionChangeRequest[],
): Promise<{ criteria: Record<string, unknown>; sha256: string }> {
  const latest = [...changeRequests].sort((left, right) => right.version - left.version)[0];
  const criteria = latest
    ? { schema: 'agentmesh.acceptance-criteria.v1', missionId: mission.id, changeVersion: latest.version, text: latest.acceptanceCriteria }
    : {
        schema: 'agentmesh.acceptance-criteria.v1', missionId: mission.id, workflowVersion: mission.workflowVersion,
        stages: stages.filter((stage) => stage.nodeType === 'task').sort((a, b) => a.id.localeCompare(b.id))
          .map((stage) => ({ id: stage.id, name: stage.name, purpose: stage.purpose, attemptNo: stage.attemptNo })),
      };
  return { criteria, sha256: await sha256Json(criteria) };
}

export async function parseIpfsEvidence(
  raw: unknown,
  expected: {
    missionId: string; stageId: string | null; attemptNo: number | null; agentId: string | null;
    logicalName: string; acceptanceCriteriaSha256: string;
  },
): Promise<DeliverableIpfsEvidence> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new IpfsEvidenceError('INVALID_IPFS_EVIDENCE', 'ipfsEvidence must be an object');
  }
  const input = raw as Record<string, unknown>;
  const rootCid = normalizeCid(input.rootCid);
  const visibility = input.visibility === 'encrypted' ? 'encrypted' : input.visibility === 'public' ? 'public' : null;
  if (!visibility) throw new IpfsEvidenceError('INVALID_VISIBILITY', 'visibility must be public or encrypted');
  const manifestSha256 = stringField(input, 'manifestSha256', 80).toLowerCase();
  if (!SHA256_PATTERN.test(manifestSha256)) throw new IpfsEvidenceError('INVALID_MANIFEST_HASH', 'manifestSha256 must be a sha256 digest');
  const manifestRaw = input.manifest;
  if (!manifestRaw || typeof manifestRaw !== 'object' || Array.isArray(manifestRaw)) {
    throw new IpfsEvidenceError('INVALID_MANIFEST', 'ipfsEvidence.manifest must be an object');
  }
  if (new TextEncoder().encode(canonicalJson(manifestRaw)).byteLength > MAX_MANIFEST_BYTES) {
    throw new IpfsEvidenceError('MANIFEST_TOO_LARGE', 'Manifest exceeds 256 KiB');
  }
  if (await sha256Json(manifestRaw) !== manifestSha256) {
    throw new IpfsEvidenceError('MANIFEST_HASH_MISMATCH', 'manifestSha256 does not match the canonical Manifest JSON');
  }
  const source = manifestRaw as Record<string, unknown>;
  if (source.schema !== 'agentmesh.deliverable-manifest.v1') throw new IpfsEvidenceError('INVALID_MANIFEST', 'Unsupported Manifest schema');
  const versionNo = integerField(source, 'versionNo', 1, 1_000_000);
  const manifestStageId = nullableString(source.stageId);
  const manifestAgentId = nullableString(source.agentId);
  const manifestAttemptNo = source.attemptNo === null ? null : integerField(source, 'attemptNo', 1, 1_000_000);
  if (stringField(source, 'missionId', 120) !== expected.missionId || manifestStageId !== expected.stageId
    || manifestAttemptNo !== expected.attemptNo || manifestAgentId !== expected.agentId
    || stringField(source, 'logicalName', 180) !== expected.logicalName) {
    throw new IpfsEvidenceError('MANIFEST_CONTEXT_MISMATCH', 'Manifest mission, stage, attempt, Agent or logical name does not match the submission');
  }
  if (stringField(source, 'acceptanceCriteriaSha256', 80).toLowerCase() !== expected.acceptanceCriteriaSha256) {
    throw new IpfsEvidenceError('ACCEPTANCE_CRITERIA_MISMATCH', 'Manifest acceptance criteria hash is stale');
  }
  const createdAt = stringField(source, 'createdAt', 60);
  if (Number.isNaN(Date.parse(createdAt))) throw new IpfsEvidenceError('INVALID_MANIFEST', 'manifest.createdAt must be an ISO timestamp');
  const hasEncryptionFingerprint = Object.prototype.hasOwnProperty.call(source, 'encryptionKeyFingerprint');
  const encryptionKeyFingerprint = nullableString(source.encryptionKeyFingerprint)?.toLowerCase() ?? null;
  if (visibility === 'encrypted' && (!encryptionKeyFingerprint || !SHA256_PATTERN.test(encryptionKeyFingerprint))) {
    throw new IpfsEvidenceError('INVALID_ENCRYPTION_FINGERPRINT', 'Encrypted Manifests require a sha256 encryptionKeyFingerprint');
  }
  if (visibility === 'public' && encryptionKeyFingerprint) {
    throw new IpfsEvidenceError('INVALID_ENCRYPTION_FINGERPRINT', 'Public Manifests must not declare an encryption key fingerprint');
  }
  const filesRaw = source.files;
  if (!Array.isArray(filesRaw) || filesRaw.length < 1 || filesRaw.length > MAX_MANIFEST_FILES) throw new IpfsEvidenceError('INVALID_MANIFEST', 'manifest.files must contain between 1 and 2,000 files');
  const seen = new Set<string>();
  const files = filesRaw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new IpfsEvidenceError('INVALID_MANIFEST', `manifest.files[${index}] is invalid`);
    const file = entry as Record<string, unknown>;
    const path = stringField(file, 'path', 500);
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '' || part === '.')) {
      throw new IpfsEvidenceError('INVALID_MANIFEST_PATH', `manifest.files[${index}].path is unsafe`);
    }
    if (seen.has(path)) throw new IpfsEvidenceError('INVALID_MANIFEST_PATH', `manifest contains duplicate path ${path}`);
    seen.add(path);
    const sha256 = stringField(file, 'sha256', 80).toLowerCase();
    if (!SHA256_PATTERN.test(sha256)) throw new IpfsEvidenceError('INVALID_MANIFEST', `manifest.files[${index}].sha256 is invalid`);
    return { path, sha256, mimeType: stringField(file, 'mimeType', 120), byteSize: integerField(file, 'byteSize', 0, MAX_TOTAL_BYTES) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const totalBytes = files.reduce((sum, file) => sum + file.byteSize, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new IpfsEvidenceError('INVALID_MANIFEST', 'Manifest totalBytes exceeds the v1 limit');
  const supersedesRootCidRaw = nullableString(source.supersedesRootCid);
  const supersedesRootCid = supersedesRootCidRaw ? normalizeCid(supersedesRootCidRaw) : null;
  const manifest: DeliverableManifest = {
    schema: 'agentmesh.deliverable-manifest.v1', missionId: expected.missionId, stageId: expected.stageId,
    attemptNo: expected.attemptNo, agentId: expected.agentId, logicalName: expected.logicalName, versionNo,
    supersedesRootCid, acceptanceCriteriaSha256: expected.acceptanceCriteriaSha256,
    ...(hasEncryptionFingerprint ? { encryptionKeyFingerprint } : {}), createdAt,
    generator: stringField(source, 'generator', 120), files,
  };
  return {
    provider: 'pinme_ipfs', rootCid, manifestPath: '/manifest.json', manifestSha256, manifest,
    fileCount: files.length, totalBytes, visibility, versionNo,
    supersedesDeliverableId: nullableString(input.supersedesDeliverableId),
    scopeKey: expected.stageId ? `stage:${expected.stageId}:attempt:${expected.attemptNo}` : 'mission:final',
    verificationStatus: 'declared', lastVerifiedAt: null, lastVerificationError: null,
  };
}

export function frozenDeliverables(deliverables: Deliverable[], stages: WorkflowStage[]): FrozenDeliverableEvidence[] {
  const currentAttempts = new Map(stages.map((stage) => [stage.id, stage.attemptNo]));
  return deliverables.filter((item) => !item.stageId || item.attemptNo === currentAttempts.get(item.stageId)).map((item) => ({
    deliverableId: item.id, stageId: item.stageId, attemptNo: item.attemptNo ?? null, agentId: item.agentId,
    name: item.name, rootCid: item.ipfsEvidence?.rootCid ?? null, manifestSha256: item.ipfsEvidence?.manifestSha256 ?? null,
    versionNo: item.ipfsEvidence?.versionNo ?? null, verificationStatus: item.ipfsEvidence?.verificationStatus ?? 'legacy',
    createdAt: item.createdAt,
  })).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.deliverableId.localeCompare(b.deliverableId));
}

export function reviewDossier(kind: 'acceptance' | 'dispute', subjectId: string, snapshot: MissionEvidenceSnapshot): ReviewDossier {
  return { schema: 'agentmesh.review-dossier.v1', kind, subjectId, missionId: snapshot.missionId, snapshot };
}
