-- Explicit administrator Trial overrides requested for the two launch Agents.
-- These records pass Trial at the minimum 7.5/10 threshold without claiming
-- that the legacy agentmesh.trial.v1 Endpoint contract is healthy under v3.

INSERT OR IGNORE INTO agent_trials
  (id, agent_id, agent_version_id, suite_version, status, score, response_time_ms,
   checks_json, summary, evidence_json, started_at, completed_at, created_by)
SELECT
  'AGTRIAL-MANUAL-20260829-MASTRA',
  id,
  (SELECT id FROM agent_versions WHERE agent_id = agents.id ORDER BY created_at DESC LIMIT 1),
  'agentmesh.trial.manual.v1',
  'passed',
  75,
  0,
  '[{"key":"admin_override","passed":true,"score":75,"summary":"管理员人工覆盖 Trial；未据此声明 Endpoint 健康。"}]',
  '管理员人工通过 Trial：发布期人工准入；Endpoint 仍需升级至 agentmesh.trial.v3。',
  '{"manualOverride":true,"liveChallenge":false,"reason":"发布期人工准入；Endpoint 仍需升级至 agentmesh.trial.v3。"}',
  '2026-08-29 04:34:00',
  '2026-08-29 04:34:00',
  owner_id
FROM agents
WHERE id = 'mastra-workflow-bridge';

INSERT OR IGNORE INTO agent_trials
  (id, agent_id, agent_version_id, suite_version, status, score, response_time_ms,
   checks_json, summary, evidence_json, started_at, completed_at, created_by)
SELECT
  'AGTRIAL-MANUAL-20260829-DEEPSEEK',
  id,
  (SELECT id FROM agent_versions WHERE agent_id = agents.id ORDER BY created_at DESC LIMIT 1),
  'agentmesh.trial.manual.v1',
  'passed',
  75,
  0,
  '[{"key":"admin_override","passed":true,"score":75,"summary":"管理员人工覆盖 Trial；未据此声明 Endpoint 健康。"}]',
  '管理员人工通过 Trial：发布期人工准入；Endpoint 仍需升级至 agentmesh.trial.v3。',
  '{"manualOverride":true,"liveChallenge":false,"reason":"发布期人工准入；Endpoint 仍需升级至 agentmesh.trial.v3。"}',
  '2026-08-29 04:34:00',
  '2026-08-29 04:34:00',
  owner_id
FROM agents
WHERE id = 'deepseek-chill-coding-agent';

INSERT OR IGNORE INTO agent_metric_events
  (id, idempotency_key, agent_id, event_type, value, weight, severity, source_type,
   source_id, detail_json, occurred_at, created_at)
SELECT
  'AGMETRIC-MANUAL-20260829-MASTRA',
  'trial:AGTRIAL-MANUAL-20260829-MASTRA',
  id,
  'trial_passed',
  75,
  1,
  'info',
  'admin',
  'AGTRIAL-MANUAL-20260829-MASTRA',
  '{"suiteVersion":"agentmesh.trial.manual.v1","manualOverride":true,"reason":"发布期人工准入；Endpoint 仍需升级至 agentmesh.trial.v3。"}',
  '2026-08-29 04:34:00',
  '2026-08-29 04:34:00'
FROM agents
WHERE id = 'mastra-workflow-bridge';

INSERT OR IGNORE INTO agent_metric_events
  (id, idempotency_key, agent_id, event_type, value, weight, severity, source_type,
   source_id, detail_json, occurred_at, created_at)
SELECT
  'AGMETRIC-MANUAL-20260829-DEEPSEEK',
  'trial:AGTRIAL-MANUAL-20260829-DEEPSEEK',
  id,
  'trial_passed',
  75,
  1,
  'info',
  'admin',
  'AGTRIAL-MANUAL-20260829-DEEPSEEK',
  '{"suiteVersion":"agentmesh.trial.manual.v1","manualOverride":true,"reason":"发布期人工准入；Endpoint 仍需升级至 agentmesh.trial.v3。"}',
  '2026-08-29 04:34:00',
  '2026-08-29 04:34:00'
FROM agents
WHERE id = 'deepseek-chill-coding-agent';

UPDATE agents
SET trust_score = 7.5,
    status = 'active',
    updated_at = '2026-08-29 04:34:00'
WHERE id IN ('mastra-workflow-bridge', 'deepseek-chill-coding-agent')
  AND updated_at <= '2026-08-29 04:34:00';

UPDATE agent_stats
SET trial_passed = 1,
    last_trial_at = '2026-08-29 04:34:00',
    eligibility_reasons_json = (
      SELECT COALESCE(json_group_array(value), '[]')
      FROM json_each(agent_stats.eligibility_reasons_json)
      WHERE value <> '正式 Trial 尚未通过'
    ),
    updated_at = '2026-08-29 04:34:00'
WHERE agent_id IN ('mastra-workflow-bridge', 'deepseek-chill-coding-agent')
  AND (last_trial_at IS NULL OR last_trial_at <= '2026-08-29 04:34:00');
