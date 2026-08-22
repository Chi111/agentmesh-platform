-- The first real Mastra retry produced an English object wrapper for a Chinese
-- copywriting mission. Reopen only that task's final stage so the tightened
-- output contract can regenerate a directly usable Chinese artifact.
UPDATE workflow_stages
SET status = 'failed',
    output_json = json_set(
      COALESCE(output_json, '{}'),
      '$.invalidated', 1,
      '$.retryable', 1,
      '$.invalidationReason', 'Final copy must be directly usable Simplified Chinese text'
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE mission_id = 'TASK-2026-F3BF6E'
  AND status = 'done'
  AND position = (
    SELECT MAX(final_stage.position)
    FROM workflow_stages final_stage
    WHERE final_stage.mission_id = workflow_stages.mission_id
  )
  AND json_extract(output_json, '$.runtime') = 'mastra'
  AND json_extract(output_json, '$.source') = 'mastra-agent'
  AND json_type(output_json, '$.result.deliverable') = 'object'
  AND EXISTS (
    SELECT 1
    FROM missions m
    JOIN escrows e ON e.mission_id = m.id
    WHERE m.id = workflow_stages.mission_id
      AND m.status = 'review'
      AND m.cancelled_at IS NULL
      AND e.status = 'held'
  );

UPDATE missions
SET status = 'running',
    progress = 67,
    current_stage = '最终交付格式与语言不符合要求，等待重新整合',
    review_due_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'TASK-2026-F3BF6E'
  AND status = 'review'
  AND cancelled_at IS NULL
  AND EXISTS (
    SELECT 1 FROM escrows e
    WHERE e.mission_id = missions.id AND e.status = 'held'
  )
  AND EXISTS (
    SELECT 1 FROM workflow_stages s
    WHERE s.mission_id = missions.id
      AND s.status = 'failed'
      AND json_extract(s.output_json, '$.invalidationReason') = 'Final copy must be directly usable Simplified Chinese text'
  );

INSERT OR IGNORE INTO execution_events
  (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
SELECT
  'EVT-MASTRA-LOCALE-' || m.id,
  m.id,
  NULL,
  'mission.delivery_invalidated',
  '最终交付格式与语言不符合要求，已恢复最终阶段等待重试',
  'platform',
  NULL,
  '{"source":"mastra-agent","reason":"locale-and-format","retryable":true}',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM missions m
WHERE m.id = 'TASK-2026-F3BF6E'
  AND m.status = 'running'
  AND EXISTS (
    SELECT 1 FROM workflow_stages s
    WHERE s.mission_id = m.id
      AND s.status = 'failed'
      AND json_extract(s.output_json, '$.invalidationReason') = 'Final copy must be directly usable Simplified Chinese text'
  );
