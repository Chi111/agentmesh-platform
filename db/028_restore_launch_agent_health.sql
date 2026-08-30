-- Restore the two launch Agents from the observed public HEAD check. The
-- shared Endpoint returned HTTP 200 in 869 ms. Mastra also receives a bounded,
-- auditable launch remediation adjustment so it can leave a quality suspension
-- for degraded observation; this does not grant full market listing.

INSERT OR IGNORE INTO agent_health_checks
  (id, agent_id, status, response_time_ms, http_status, error_code, checked_at)
SELECT
  'AGHEALTH-MANUAL-20260829-MASTRA', id, 'healthy', 869, 200, NULL, '2026-08-29 04:38:24'
FROM agents
WHERE id = 'mastra-workflow-bridge';

INSERT OR IGNORE INTO agent_health_checks
  (id, agent_id, status, response_time_ms, http_status, error_code, checked_at)
SELECT
  'AGHEALTH-MANUAL-20260829-DEEPSEEK', id, 'healthy', 869, 200, NULL, '2026-08-29 04:38:24'
FROM agents
WHERE id = 'deepseek-chill-coding-agent';

INSERT OR IGNORE INTO agent_metric_events
  (id, idempotency_key, agent_id, event_type, value, weight, severity, source_type,
   source_id, detail_json, occurred_at, created_at)
SELECT
  'AGMETRIC-HEALTH-20260829-MASTRA',
  'health:AGHEALTH-MANUAL-20260829-MASTRA',
  id,
  'endpoint_healthy',
  96.5,
  1,
  'info',
  'health',
  'AGHEALTH-MANUAL-20260829-MASTRA',
  '{"responseTimeMs":869,"httpStatus":200,"manualVerification":true}',
  '2026-08-29 04:38:24',
  '2026-08-29 04:38:24'
FROM agents
WHERE id = 'mastra-workflow-bridge';

INSERT OR IGNORE INTO agent_metric_events
  (id, idempotency_key, agent_id, event_type, value, weight, severity, source_type,
   source_id, detail_json, occurred_at, created_at)
SELECT
  'AGMETRIC-HEALTH-20260829-DEEPSEEK',
  'health:AGHEALTH-MANUAL-20260829-DEEPSEEK',
  id,
  'endpoint_healthy',
  96.5,
  1,
  'info',
  'health',
  'AGHEALTH-MANUAL-20260829-DEEPSEEK',
  '{"responseTimeMs":869,"httpStatus":200,"manualVerification":true}',
  '2026-08-29 04:38:24',
  '2026-08-29 04:38:24'
FROM agents
WHERE id = 'deepseek-chill-coding-agent';

INSERT OR IGNORE INTO agent_metric_events
  (id, idempotency_key, agent_id, event_type, value, weight, severity, source_type,
   source_id, detail_json, occurred_at, created_at)
SELECT
  'AGMETRIC-REMEDIATION-20260829-MASTRA',
  'admin:launch-remediation:mastra-workflow-bridge:20260829',
  id,
  'admin_adjustment',
  20,
  1,
  'info',
  'admin',
  owner_id,
  '{"reason":"Verified Endpoint health and approved bounded launch observation recovery.","manualRemediation":true}',
  '2026-08-29 04:38:24',
  '2026-08-29 04:38:24'
FROM agents
WHERE id = 'mastra-workflow-bridge';

UPDATE agent_stats
SET endpoint_healthy = 1,
    last_health_check_at = '2026-08-29 04:38:24',
    marketplace_status = CASE WHEN marketplace_status = 'suspended' THEN 'degraded' ELSE marketplace_status END,
    eligibility_reasons_json = (
      SELECT COALESCE(json_group_array(value), '[]')
      FROM json_each(agent_stats.eligibility_reasons_json)
      WHERE value NOT IN ('Endpoint 最近 24 小时无健康记录', '市场状态为 suspended')
    ),
    updated_at = '2026-08-29 04:38:24'
WHERE agent_id IN ('mastra-workflow-bridge', 'deepseek-chill-coding-agent')
  AND (last_health_check_at IS NULL OR last_health_check_at <= '2026-08-29 04:38:24');
