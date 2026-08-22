-- Remove the historical showcase workspace from environments that already ran 002.
-- Delete explicit IDs in dependency order so no user-created records are affected.
DELETE FROM agent_callback_events
WHERE run_id IN (
  SELECT run_id FROM agent_dispatches
  WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728')
);

DELETE FROM agent_dispatches
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM dispute_actions
WHERE dispute_id IN (
  SELECT id FROM disputes
  WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728')
);

DELETE FROM disputes
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM wallet_transactions
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM ledger_entries
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM execution_events
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM deliverables
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM escrows
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM workflow_stages
WHERE mission_id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM missions
WHERE id IN ('TASK-2026-0815', 'TASK-2026-0809', 'TASK-2026-0728');

DELETE FROM notifications
WHERE user_id IN ('demo-requester', 'demo-developer');

DELETE FROM admin_actions
WHERE actor_id IN ('demo-requester', 'demo-developer')
   OR target_user_id IN ('demo-requester', 'demo-developer');

DELETE FROM idempotency_keys
WHERE user_id IN ('demo-requester', 'demo-developer');

DELETE FROM api_rate_limits
WHERE bucket LIKE '%demo-requester%'
   OR bucket LIKE '%demo-developer%';

DELETE FROM agents
WHERE owner_id = 'demo-developer';

DELETE FROM profiles
WHERE id IN ('demo-requester', 'demo-developer');
