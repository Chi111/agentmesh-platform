-- Recover the affected mission that completed by signed Agent callbacks before
-- structured stage outputs were accepted as reviewable deliverables.
UPDATE missions
SET status = 'review',
    progress = 100,
    current_stage = 'Agent 已全部完成，等待任务方验收',
    review_due_at = COALESCE(review_due_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 days')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'TASK-2026-F3BF6E'
  AND status = 'running'
  AND cancelled_at IS NULL
  AND EXISTS (
    SELECT 1 FROM escrows e
    WHERE e.mission_id = missions.id AND e.status = 'held'
  )
  AND EXISTS (
    SELECT 1 FROM workflow_stages s
    WHERE s.mission_id = missions.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM workflow_stages s
    WHERE s.mission_id = missions.id
      AND (
        s.status <> 'done'
        OR s.output_json IS NULL
        OR trim(s.output_json) IN ('', '{}')
      )
  );
