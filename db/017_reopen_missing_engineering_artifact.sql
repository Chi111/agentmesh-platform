-- Reopen the production mission that reached review without a real engineering
-- artifact. Preserve every prior output as evidence and leave held/frozen escrow unchanged.
-- The predicates make this replay-safe and prevent touching a mission that has
-- since received a deliverable or completed settlement.

WITH RECURSIVE affected_stages(id) AS (
  SELECT stage.id
  FROM workflow_stages stage
  WHERE stage.mission_id = 'TASK-2026-795E53'
    AND (
      json_extract(stage.input_json, '$.executionMode') = 'implement'
      OR (
        json_extract(stage.input_json, '$.executionMode') IS NULL
        AND stage.position > (SELECT MIN(position) FROM workflow_stages WHERE mission_id = stage.mission_id AND node_type = 'task')
        AND stage.position < (SELECT MAX(position) FROM workflow_stages WHERE mission_id = stage.mission_id AND node_type = 'task')
      )
    )
  UNION
  SELECT edge.target_stage_id
  FROM workflow_edges edge
  JOIN affected_stages affected ON affected.id = edge.source_stage_id
  WHERE edge.mission_id = 'TASK-2026-795E53'
)
UPDATE workflow_stages
SET status = 'failed',
    output_json = json_set(
      COALESCE(output_json, '{}'),
      '$.invalidated', json('true'),
      '$.retryable', json('true'),
      '$.invalidationReason', 'Required implementation artifact is missing; text output is retained as evidence only.'
    ),
    updated_at = datetime('now')
WHERE id IN (SELECT id FROM affected_stages)
  AND status = 'done'
  AND EXISTS (
    SELECT 1 FROM missions
    WHERE id = 'TASK-2026-795E53' AND status = 'review' AND cancelled_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM escrows
    WHERE mission_id = 'TASK-2026-795E53' AND status IN ('held', 'frozen')
  )
  AND NOT EXISTS (
    SELECT 1 FROM deliverables WHERE mission_id = 'TASK-2026-795E53'
  );

UPDATE missions
SET status = 'running',
    progress = COALESCE((
      SELECT ROUND(100.0 * SUM(CASE WHEN status = 'done' THEN budget_usdc ELSE 0 END) / NULLIF(SUM(budget_usdc), 0))
      FROM workflow_stages
      WHERE mission_id = 'TASK-2026-795E53' AND node_type = 'task'
    ), 0),
    current_stage = '工程交付缺少真实制品，等待 Runtime 接入后重试',
    review_due_at = NULL,
    updated_at = datetime('now')
WHERE id = 'TASK-2026-795E53'
  AND status = 'review'
  AND EXISTS (
    SELECT 1 FROM escrows WHERE mission_id = 'TASK-2026-795E53' AND status IN ('held', 'frozen')
  )
  AND NOT EXISTS (
    SELECT 1 FROM deliverables WHERE mission_id = 'TASK-2026-795E53'
  )
  AND EXISTS (
    SELECT 1 FROM workflow_stages
    WHERE mission_id = 'TASK-2026-795E53' AND status = 'failed'
      AND json_extract(output_json, '$.invalidated') = 1
  );

UPDATE workflow_dispatch_outbox
SET status = 'done', updated_at = datetime('now')
WHERE mission_id = 'TASK-2026-795E53'
  AND status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM missions WHERE id = 'TASK-2026-795E53' AND status = 'running'
  );

INSERT INTO execution_events
  (id, mission_id, stage_id, event_type, message, actor_type, actor_id, payload_json, created_at)
SELECT
  'EVT-REOPEN-MISSING-ENGINEERING-ARTIFACT',
  'TASK-2026-795E53',
  NULL,
  'delivery.invalidated',
  '平台复核发现 Implement 节点没有真实可下载制品；已撤销伪完成状态并保留原输出作为证据。',
  'platform',
  NULL,
  '{"reason":"missing_implementation_artifact","escrowAction":"preserved","retryable":true}',
  datetime('now')
WHERE EXISTS (
  SELECT 1 FROM missions WHERE id = 'TASK-2026-795E53' AND status = 'running'
)
AND NOT EXISTS (
  SELECT 1 FROM execution_events WHERE id = 'EVT-REOPEN-MISSING-ENGINEERING-ARTIFACT'
);
