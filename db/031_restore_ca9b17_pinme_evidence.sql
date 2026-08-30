-- One-time recovery for the public manifests published by TASK-2026-CA9B17.
-- A replay of the legacy 023 table rebuild removed only the relational evidence
-- rows; these immutable manifests and their CIDs remained available on PinMe.

INSERT OR IGNORE INTO deliverable_ipfs_evidence
  (deliverable_id, mission_id, scope_key, version_no, supersedes_deliverable_id, provider, root_cid,
   manifest_path, manifest_sha256, manifest_json, file_count, total_bytes, visibility, verification_status,
   last_verified_at, last_verification_error, submitted_by, created_at)
SELECT d.id, d.mission_id, 'stage:STAGE-0c4b8cc6-546c-4d77-99b0-8e5034935e92:attempt:5', 1, NULL, 'pinme_ipfs',
  'bafybeiblk2tkr4lp2yyey2wcrji52wx7r6rj2bglubwzp5ji6dvqym3lpq', '/manifest.json',
  'sha256:5f06f7a2c1b18ff0f0464dbfb630264509139084930e42ab282c4aaf07ff225c',
  '{"acceptanceCriteriaSha256":"sha256:9d985825402a58907d9d37b9856a4b7eb076fe132e650a1c58eabab2e083eb61","agentId":"official-delivery-writer","attemptNo":5,"createdAt":"2026-08-29T09:07:04.788Z","files":[{"byteSize":31367,"mimeType":"text/markdown","path":"deliverable.md","sha256":"sha256:9c08ca75479af87163d06eab40253a41b9f77c7497fa581aec440077b0810db4"},{"byteSize":39548,"mimeType":"text/html","path":"index.html","sha256":"sha256:c3f652b9916d76b4481a12b45d65b560b96fc61691d8ced9ad9701ce1f718061"}],"generator":"agentmesh.pinme-auto-delivery.v1","logicalName":"核心内容与结构化交付 · Delivery Writer 阶段制品","missionId":"TASK-2026-CA9B17","schema":"agentmesh.deliverable-manifest.v1","stageId":"STAGE-0c4b8cc6-546c-4d77-99b0-8e5034935e92","supersedesRootCid":null,"versionNo":1}',
  2, 70915, 'public', 'declared', NULL, NULL, COALESCE(d.agent_id, 'platform'), d.created_at
FROM deliverables d
WHERE d.mission_id = 'TASK-2026-CA9B17'
  AND d.stage_id = 'STAGE-0c4b8cc6-546c-4d77-99b0-8e5034935e92'
  AND d.attempt_no = 5;

INSERT OR IGNORE INTO deliverable_ipfs_evidence
  (deliverable_id, mission_id, scope_key, version_no, supersedes_deliverable_id, provider, root_cid,
   manifest_path, manifest_sha256, manifest_json, file_count, total_bytes, visibility, verification_status,
   last_verified_at, last_verification_error, submitted_by, created_at)
SELECT d.id, d.mission_id, 'stage:STAGE-204c0ead-fb82-472a-b891-6a83b6fa17fe:attempt:5', 1, NULL, 'pinme_ipfs',
  'bafybeibzty2byahs53jgryswuq2mqwaijogqpkkkfylpmypyaservnyoze', '/manifest.json',
  'sha256:29781f489fc6d1fdcb5068f358a3e68fec75ff5c8288c89759db649d350bb78d',
  '{"acceptanceCriteriaSha256":"sha256:4ad0945b505d5b647aa3e4f1c3cd2c0ea01d97a4fb0c81f6cba40cad684264c3","agentId":"official-evidence-scout","attemptNo":5,"createdAt":"2026-08-29T09:21:52.940Z","files":[{"byteSize":18283,"mimeType":"text/markdown","path":"deliverable.md","sha256":"sha256:83f329948033064a05f4c9bec7312d439a4b494cc56d059b52e9f00fdb4e6794"},{"byteSize":25032,"mimeType":"text/html","path":"index.html","sha256":"sha256:12d05544b31569a348612838b618a5baaac4fd8b113c457e35a795173fe23b13"}],"generator":"agentmesh.pinme-auto-delivery.v1","logicalName":"发布准备与运行验证 · Evidence Scout 阶段制品","missionId":"TASK-2026-CA9B17","schema":"agentmesh.deliverable-manifest.v1","stageId":"STAGE-204c0ead-fb82-472a-b891-6a83b6fa17fe","supersedesRootCid":null,"versionNo":1}',
  2, 43315, 'public', 'declared', NULL, NULL, COALESCE(d.agent_id, 'platform'), d.created_at
FROM deliverables d
WHERE d.mission_id = 'TASK-2026-CA9B17'
  AND d.stage_id = 'STAGE-204c0ead-fb82-472a-b891-6a83b6fa17fe'
  AND d.attempt_no = 5;

INSERT OR IGNORE INTO deliverable_ipfs_evidence
  (deliverable_id, mission_id, scope_key, version_no, supersedes_deliverable_id, provider, root_cid,
   manifest_path, manifest_sha256, manifest_json, file_count, total_bytes, visibility, verification_status,
   last_verified_at, last_verification_error, submitted_by, created_at)
SELECT d.id, d.mission_id, 'stage:STAGE-394f1e58-9a9b-4892-be66-b06b4c178a6a:attempt:4', 1, NULL, 'pinme_ipfs',
  'bafybeif4u4kuiygrlwve7bte4cpkuv2vbqahfsf543auqn3c4aajr6xmwu', '/manifest.json',
  'sha256:bfbcf3531b58e70bbe866b608e4213ed889dee91969e5f194519453de2bbd047',
  '{"acceptanceCriteriaSha256":"sha256:80e6704475d5015cfc7b40f4144007e9da2b304319e4c40c7f64c9771826b5d1","agentId":"official-strategy-analyst","attemptNo":4,"createdAt":"2026-08-29T09:24:28.639Z","files":[{"byteSize":28497,"mimeType":"text/markdown","path":"deliverable.md","sha256":"sha256:f0d193aafdf8dba482ebe9a17cb356f7584ba6f028cd994ae9a86b37b2ac0de5"},{"byteSize":35592,"mimeType":"text/html","path":"index.html","sha256":"sha256:96596dec020ee81173241a4d0bcadf04c59194e40cbfc726d4d62c56baf901c1"}],"generator":"agentmesh.pinme-auto-delivery.v1","logicalName":"方案设计与关键决策 · Strategy Analyst 阶段制品","missionId":"TASK-2026-CA9B17","schema":"agentmesh.deliverable-manifest.v1","stageId":"STAGE-394f1e58-9a9b-4892-be66-b06b4c178a6a","supersedesRootCid":null,"versionNo":1}',
  2, 64089, 'public', 'declared', NULL, NULL, COALESCE(d.agent_id, 'platform'), d.created_at
FROM deliverables d
WHERE d.mission_id = 'TASK-2026-CA9B17'
  AND d.stage_id = 'STAGE-394f1e58-9a9b-4892-be66-b06b4c178a6a'
  AND d.attempt_no = 4;

INSERT OR IGNORE INTO deliverable_ipfs_evidence
  (deliverable_id, mission_id, scope_key, version_no, supersedes_deliverable_id, provider, root_cid,
   manifest_path, manifest_sha256, manifest_json, file_count, total_bytes, visibility, verification_status,
   last_verified_at, last_verification_error, submitted_by, created_at)
SELECT d.id, d.mission_id, 'stage:STAGE-f475a23c-6355-4122-9082-86af2fcf20d9:attempt:8', 1, NULL, 'pinme_ipfs',
  'bafybeiasx23e4dqxfim6v5ahmgehswwwfdcw3az34dwiui26erwoyogymq', '/manifest.json',
  'sha256:9ad4bb972aa881fb7e58234e48bcc08fa0ff0bb20a8ee53c8164db44aab6ba50',
  '{"acceptanceCriteriaSha256":"sha256:80e6704475d5015cfc7b40f4144007e9da2b304319e4c40c7f64c9771826b5d1","agentId":"official-delivery-writer","attemptNo":8,"createdAt":"2026-08-29T09:26:18.247Z","files":[{"byteSize":24491,"mimeType":"text/markdown","path":"deliverable.md","sha256":"sha256:d2d7671c36c9e487d2463df03268aee970d14ec6b4f761c7176fec786ef95437"},{"byteSize":443,"mimeType":"text/markdown","path":"acceptance-report.md","sha256":"sha256:76e8539da7461c8c09471f239639649bfa97789b7d75e4dc262fc691201e55a3"},{"byteSize":914,"mimeType":"text/markdown","path":"artifact-index.md","sha256":"sha256:57d84323729eddfa2f96d9019f3557af7b7286e89a08e3c3c00a1f9fb6c4be6a"},{"byteSize":16232,"mimeType":"text/markdown","path":"workstreams/01-目标拆解与验收建模.md","sha256":"sha256:ac61d9debb64f3b3c848355a857c0fa15b8d50147bfb76fc02fa6216780aa1e5"},{"byteSize":18085,"mimeType":"text/markdown","path":"workstreams/02-证据研究与约束核验.md","sha256":"sha256:9678cfe6ea1dbdf5259b818207b3a3e93e58df38172168ec8bdf423c9bdcf006"},{"byteSize":32051,"mimeType":"text/markdown","path":"workstreams/03-核心内容与结构化交付.md","sha256":"sha256:714d9c89ca891177a13277bfb9801c8bd30ea2341876306e9eeb7f507c3f011a"},{"byteSize":18953,"mimeType":"text/markdown","path":"workstreams/04-发布准备与运行验证.md","sha256":"sha256:b172008f3f691271553240ac14e025edcd022abc6e68425306144144b4d68c54"},{"byteSize":29153,"mimeType":"text/markdown","path":"workstreams/05-方案设计与关键决策.md","sha256":"sha256:fa84cc63221ac5c6a96664b03a834dcd6f8e19c219fb852617fb027fa8c92ec7"},{"byteSize":161562,"mimeType":"text/html","path":"index.html","sha256":"sha256:4d9187081deb734215751d6e5c0d8fa043d9a1cb22c35e0ecf3670874a351371"}],"generator":"agentmesh.pinme-complex-delivery.v2","logicalName":"为 pinme-mesh 制定开发者增长与产品发布方案 · 完整任务成果包","missionId":"TASK-2026-CA9B17","schema":"agentmesh.deliverable-manifest.v1","stageId":"STAGE-f475a23c-6355-4122-9082-86af2fcf20d9","supersedesRootCid":null,"versionNo":1}',
  9, 301884, 'public', 'declared', NULL, NULL, COALESCE(d.agent_id, 'platform'), d.created_at
FROM deliverables d
WHERE d.mission_id = 'TASK-2026-CA9B17'
  AND d.stage_id = 'STAGE-f475a23c-6355-4122-9082-86af2fcf20d9'
  AND d.attempt_no = 8;

UPDATE deliverables
SET uri = CASE stage_id
  WHEN 'STAGE-0c4b8cc6-546c-4d77-99b0-8e5034935e92' THEN 'https://5ea3450c.pinme.dev'
  WHEN 'STAGE-204c0ead-fb82-472a-b891-6a83b6fa17fe' THEN 'https://563a3c10.pinme.dev'
  WHEN 'STAGE-394f1e58-9a9b-4892-be66-b06b4c178a6a' THEN 'https://aedf9975.pinme.dev'
  WHEN 'STAGE-f475a23c-6355-4122-9082-86af2fcf20d9' THEN 'https://688355bf.pinme.dev'
  ELSE uri
END
WHERE mission_id = 'TASK-2026-CA9B17'
  AND stage_id IN (
    'STAGE-0c4b8cc6-546c-4d77-99b0-8e5034935e92',
    'STAGE-204c0ead-fb82-472a-b891-6a83b6fa17fe',
    'STAGE-394f1e58-9a9b-4892-be66-b06b4c178a6a',
    'STAGE-f475a23c-6355-4122-9082-86af2fcf20d9'
  );
