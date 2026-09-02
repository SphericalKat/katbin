CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  confirmed_at TEXT,
  inserted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  inserted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_index ON sessions(user_id);
