CREATE TABLE IF NOT EXISTS records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);

-- Project table (D1 database binding)
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL UNIQUE,
  db_uuid    TEXT NOT NULL,
  db_name    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  region     TEXT,
  created_by TEXT,
  created_at_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(project_name);

-- Worker deployment records table
CREATE TABLE IF NOT EXISTS workers (  
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  project_name TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  url        TEXT NOT NULL,
  deployed_at TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, project_name)
);

CREATE INDEX IF NOT EXISTS idx_workers_user_project ON workers(user_id, project_name);
