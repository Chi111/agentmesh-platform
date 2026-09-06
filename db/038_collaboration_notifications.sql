-- Durable, private-content-free notifications, inserted with collaboration writes.
CREATE TABLE IF NOT EXISTS collaboration_notification_outbox (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES profiles(id), mission_id TEXT NOT NULL REFERENCES missions(id),
 title TEXT NOT NULL, created_at TEXT NOT NULL, available_at TEXT NOT NULL, issue_id TEXT,
 status TEXT NOT NULL DEFAULT 'pending', claim_token TEXT, lease_until TEXT
);
CREATE INDEX IF NOT EXISTS idx_collaboration_notices_pending ON collaboration_notification_outbox(status,available_at);
CREATE TRIGGER IF NOT EXISTS collab_issue_notices AFTER INSERT ON collaboration_issues BEGIN
INSERT OR IGNORE INTO collaboration_notification_outbox(id,user_id,mission_id,title,created_at,available_at,issue_id) SELECT 'issue:'||NEW.id||':'||u.id,u.id,NEW.mission_id,'收到新的协作问题',NEW.created_at,NEW.created_at,NULL FROM (SELECT requester_id AS id FROM missions WHERE id=NEW.mission_id UNION SELECT NEW.developer_id AS id) u WHERE u.id<>NEW.author_id;
INSERT OR IGNORE INTO collaboration_notification_outbox(id,user_id,mission_id,title,created_at,available_at,issue_id) SELECT 'issue-due:'||NEW.id||':'||u.id,u.id,NEW.mission_id,'协商已满 48 小时，可申请协调',NEW.created_at,NEW.due_at,NEW.id FROM (SELECT requester_id AS id FROM missions WHERE id=NEW.mission_id UNION SELECT NEW.developer_id AS id) u WHERE 1;
END;
CREATE TRIGGER IF NOT EXISTS collab_issue_state_notices AFTER UPDATE OF status ON collaboration_issues WHEN OLD.status<>NEW.status BEGIN
INSERT OR IGNORE INTO collaboration_notification_outbox(id,user_id,mission_id,title,created_at,available_at,issue_id) SELECT 'issue-state:'||NEW.id||':'||NEW.status||':'||u.id,u.id,NEW.mission_id,'协作问题处理状态已更新',NEW.updated_at,NEW.updated_at,NULL FROM (SELECT requester_id AS id FROM missions WHERE id=NEW.mission_id UNION SELECT NEW.developer_id AS id) u WHERE 1;
END;
CREATE TRIGGER IF NOT EXISTS collab_message_notices AFTER INSERT ON collaboration_messages WHEN NEW.kind IN ('issue','review') BEGIN
INSERT OR IGNORE INTO collaboration_notification_outbox(id,user_id,mission_id,title,created_at,available_at,issue_id) SELECT 'message:'||NEW.id||':'||u.id,u.id,NEW.mission_id,'协作记录有新回应',NEW.created_at,NEW.created_at,NULL FROM (SELECT m.requester_id AS id FROM missions m WHERE m.id=NEW.mission_id UNION SELECT developer_id AS id FROM collaboration_issues WHERE id=NEW.target_id AND NEW.kind='issue' UNION SELECT developer_id AS id FROM bilateral_reviews WHERE id=NEW.target_id AND NEW.kind='review') u WHERE u.id<>NEW.author_id;
END;
CREATE TRIGGER IF NOT EXISTS collab_review_sealed_notices AFTER INSERT ON bilateral_reviews BEGIN
INSERT OR IGNORE INTO collaboration_notification_outbox(id,user_id,mission_id,title,created_at,available_at,issue_id) SELECT 'review-sealed:'||NEW.id||':'||u.id,u.id,NEW.mission_id,'对方已提交密封评价',NEW.created_at,NEW.created_at,NULL FROM (SELECT requester_id AS id FROM missions WHERE id=NEW.mission_id UNION SELECT NEW.developer_id AS id) u WHERE u.id<>NEW.author_id;
END;
CREATE TRIGGER IF NOT EXISTS collab_review_public_notices AFTER UPDATE OF published_at ON bilateral_reviews WHEN OLD.published_at IS NULL AND NEW.published_at IS NOT NULL BEGIN
INSERT OR IGNORE INTO collaboration_notification_outbox(id,user_id,mission_id,title,created_at,available_at,issue_id) SELECT 'review-public:'||NEW.mission_id||':'||NEW.developer_id||':'||u.id,u.id,NEW.mission_id,'双方评价已揭示，可查看并回应',NEW.published_at,NEW.published_at,NULL FROM (SELECT requester_id AS id FROM missions WHERE id=NEW.mission_id UNION SELECT NEW.developer_id AS id) u WHERE 1;
END;
CREATE TRIGGER IF NOT EXISTS collab_work_review_notices AFTER UPDATE OF status ON arbitration_work WHEN OLD.status<>NEW.status AND NEW.status IN ('approved','rejected') BEGIN
INSERT OR IGNORE INTO collaboration_notification_outbox(id,user_id,mission_id,title,created_at,available_at,issue_id) SELECT 'work-review:'||NEW.id||':'||u.id,u.id,(SELECT mission_id FROM disputes WHERE id=NEW.dispute_id),'仲裁履职审核已完成',NEW.reviewed_at,NEW.reviewed_at,NULL FROM (SELECT NEW.user_id AS id) u WHERE 1;
END;
