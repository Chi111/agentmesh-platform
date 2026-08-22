-- A Mastra bridge without PinMe LLM used to report deterministic placeholders
-- as completed work. Reopen only unaccepted, still-funded missions containing
-- those explicitly labelled outputs. Preserve the old output and event trail
-- for audit; a successful retry replaces the stage output atomically.
UPDATE workflow_stages
SET status = 'failed',
    output_json = json_set(
      COALESCE(output_json, '{}'),
      '$.invalidated', 1,
      '$.retryable', 1,
      '$.invalidationReason', 'Mastra deterministic fallback is not a deliverable'
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'done'
  AND mission_id = 'TASK-2026-F3BF6E'
  AND json_extract(output_json, '$.runtime') = 'mastra'
  AND json_extract(output_json, '$.source') = 'deterministic-fallback'
  AND EXISTS (
    SELECT 1
    FROM missions m
    JOIN escrows e ON e.mission_id = m.id
    WHERE m.id = workflow_stages.mission_id
      AND m.status IN ('running', 'review')
      AND m.cancelled_at IS NULL
      AND e.status = 'held'
  );

UPDATE missions
SET status = 'running',
    progress = 1,
    current_stage = '检测到无效降级交付，等待重新派发',
    review_due_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'review'
  AND id = 'TASK-2026-F3BF6E'
  AND cancelled_at IS NULL
  AND EXISTS (
    SELECT 1 FROM escrows e
    WHERE e.mission_id = missions.id AND e.status = 'held'
  )
  AND EXISTS (
    SELECT 1 FROM workflow_stages s
    WHERE s.mission_id = missions.id
      AND s.status = 'failed'
      AND json_extract(s.output_json, '$.runtime') = 'mastra'
      AND json_extract(s.output_json, '$.source') = 'deterministic-fallback'
      AND json_extract(s.output_json, '$.invalidated') = 1
  );

INSERT OR IGNORE INTO execution_events
  (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
SELECT
  'EVT-MASTRA-FALLBACK-' || m.id,
  m.id,
  NULL,
  'mission.delivery_invalidated',
  '检测到 Mastra 降级占位结果，任务已恢复为可重试状态',
  'platform',
  NULL,
  '{"source":"deterministic-fallback","retryable":true}',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM missions m
WHERE m.status = 'running'
  AND m.id = 'TASK-2026-F3BF6E'
  AND EXISTS (
    SELECT 1 FROM workflow_stages s
    WHERE s.mission_id = m.id
      AND s.status = 'failed'
      AND json_extract(s.output_json, '$.invalidated') = 1
  );
