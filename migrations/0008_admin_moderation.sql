CREATE TABLE IF NOT EXISTS account_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  lifted_at TEXT
);

CREATE TABLE IF NOT EXISTS ip_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  lifted_at TEXT
);

CREATE TABLE IF NOT EXISTS dmca_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL,
  complainant TEXT NOT NULL,
  received_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  decision_reason TEXT NOT NULL DEFAULT '',
  decided_at TEXT,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS dmca_case_pastes (
  case_id INTEGER NOT NULL,
  paste_id TEXT NOT NULL,
  PRIMARY KEY (case_id, paste_id)
);

CREATE TABLE IF NOT EXISTS admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  outcome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS abuse_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  ip TEXT NOT NULL,
  event_type TEXT NOT NULL,
  account_id INTEGER,
  paste_id TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  day TEXT PRIMARY KEY,
  accounts_created INTEGER DEFAULT 0,
  pastes_created INTEGER DEFAULT 0,
  pastes_anon INTEGER DEFAULT 0,
  pastes_authed INTEGER DEFAULT 0,
  text_pastes INTEGER DEFAULT 0,
  short_links INTEGER DEFAULT 0,
  reads INTEGER DEFAULT 0,
  redirects INTEGER DEFAULT 0,
  visitors INTEGER DEFAULT 0,
  ip_ban_rejects INTEGER DEFAULT 0,
  rate_limit_rejects INTEGER DEFAULT 0,
  server_errors INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitor_ips (
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  PRIMARY KEY (day, ip_hash)
);

CREATE TABLE IF NOT EXISTS deletion_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paste_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS paste_tombstones (
  paste_id TEXT PRIMARY KEY,
  storage_key TEXT,
  deleted_at TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS account_bans_user_id_index ON account_bans(user_id);
CREATE INDEX IF NOT EXISTS ip_bans_target_index ON ip_bans(target);
CREATE INDEX IF NOT EXISTS abuse_events_account_id_index ON abuse_events(account_id);
CREATE INDEX IF NOT EXISTS abuse_events_paste_id_index ON abuse_events(paste_id);
CREATE INDEX IF NOT EXISTS abuse_events_ip_index ON abuse_events(ip);
CREATE INDEX IF NOT EXISTS abuse_events_created_at_index ON abuse_events(created_at);
CREATE INDEX IF NOT EXISTS deletion_queue_status_index ON deletion_queue(status);
