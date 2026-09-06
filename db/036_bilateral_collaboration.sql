-- Ordinary issues never mutate escrow. Reviews are sealed independently of quality events.
CREATE TABLE IF NOT EXISTS collaboration_issues (
 id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), developer_id TEXT NOT NULL REFERENCES profiles(id),
 author_id TEXT NOT NULL REFERENCES profiles(id), stage_ids_json TEXT NOT NULL, category TEXT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','escalated','resolved')),
 due_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolution TEXT, dispute_id TEXT REFERENCES disputes(id)
);
CREATE INDEX IF NOT EXISTS idx_collaboration_issues_mission ON collaboration_issues(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_collaboration_issues_status ON collaboration_issues(status, created_at);
CREATE TABLE IF NOT EXISTS collaboration_messages (
 id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), target_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('issue','review','dispute')), author_id TEXT NOT NULL REFERENCES profiles(id),
 body TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collaboration_messages_mission ON collaboration_messages(mission_id, created_at);
CREATE TABLE IF NOT EXISTS bilateral_reviews (
 id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES missions(id), developer_id TEXT NOT NULL REFERENCES profiles(id),
 author_id TEXT NOT NULL REFERENCES profiles(id), direction TEXT NOT NULL CHECK(direction IN ('requester','developer')),
 ratings_json TEXT NOT NULL, comment TEXT NOT NULL, created_at TEXT NOT NULL, reveal_at TEXT NOT NULL,
 published_at TEXT, stage_ids_json TEXT NOT NULL, eligible INTEGER NOT NULL CHECK(eligible IN (0,1)), case_status TEXT NOT NULL,
 UNIQUE(mission_id, developer_id, direction)
);
CREATE INDEX IF NOT EXISTS idx_bilateral_reviews_due ON bilateral_reviews(published_at, reveal_at);
CREATE TABLE IF NOT EXISTS arbitration_reward_pools (
 id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 budget_micros INTEGER NOT NULL CHECK(budget_micros > 0), fee_micros INTEGER NOT NULL CHECK(fee_micros > 0 AND fee_micros <= budget_micros),
 reserved_micros INTEGER NOT NULL DEFAULT 0 CHECK(reserved_micros >= 0 AND reserved_micros <= budget_micros),
 created_by TEXT NOT NULL REFERENCES profiles(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS arbitration_work (
 id TEXT PRIMARY KEY, dispute_id TEXT NOT NULL REFERENCES disputes(id), proposal_id TEXT NOT NULL REFERENCES dispute_proposal_rounds(id),
 user_id TEXT NOT NULL REFERENCES profiles(id), pool_id TEXT NOT NULL REFERENCES arbitration_reward_pools(id), fee_micros INTEGER NOT NULL CHECK(fee_micros > 0),
 status TEXT NOT NULL CHECK(status IN ('accepted','submitted','approved','rejected','withdrawn')), report TEXT NOT NULL DEFAULT '', evidence_json TEXT NOT NULL DEFAULT '[]',
 accepted_at TEXT NOT NULL, submitted_at TEXT, reviewed_at TEXT, reviewed_by TEXT REFERENCES profiles(id), review_reason TEXT,
 UNIQUE(proposal_id, user_id)
);
-- Reserve atomically, including across concurrent Worker instances. Rejected/no-show work retains its reservation until pool expiry.
CREATE TRIGGER IF NOT EXISTS arbitration_work_budget BEFORE INSERT ON arbitration_work BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM arbitration_reward_pools p WHERE p.id=NEW.pool_id AND p.fee_micros=NEW.fee_micros
   AND p.starts_at<=NEW.accepted_at AND p.ends_at>NEW.accepted_at AND p.reserved_micros+NEW.fee_micros<=p.budget_micros
 ) THEN RAISE(ABORT, 'ARBITRATION_POOL_EXHAUSTED') END;
END;
CREATE TRIGGER IF NOT EXISTS arbitration_work_reserve AFTER INSERT ON arbitration_work BEGIN
 UPDATE arbitration_reward_pools SET reserved_micros=reserved_micros+NEW.fee_micros WHERE id=NEW.pool_id;
END;
-- Fixed entitlements can enter only one reward epoch, including overlapping windows.
CREATE TABLE IF NOT EXISTS arbitration_reward_epoch_items (
 activity_id TEXT PRIMARY KEY REFERENCES reward_activities(id), epoch_id TEXT NOT NULL REFERENCES reward_epochs(id)
);
CREATE TRIGGER IF NOT EXISTS collaboration_issue_dispute_guard BEFORE UPDATE OF dispute_id ON collaboration_issues
WHEN NEW.dispute_id IS NOT NULL AND OLD.dispute_id IS NULL BEGIN
 SELECT CASE WHEN OLD.status<>'escalated' OR NOT EXISTS (SELECT 1 FROM disputes WHERE id=NEW.dispute_id AND mission_id=OLD.mission_id)
 THEN RAISE(ABORT, 'COLLABORATION_ISSUE_NOT_ESCALATED') END;
END;

CREATE TRIGGER IF NOT EXISTS arbitration_work_release_recusal AFTER UPDATE OF status ON arbitration_work
WHEN OLD.status='accepted' AND NEW.status='withdrawn' BEGIN
 UPDATE arbitration_reward_pools SET reserved_micros=reserved_micros-OLD.fee_micros WHERE id=OLD.pool_id;
END;
