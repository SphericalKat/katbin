CREATE TABLE IF NOT EXISTS account_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  inserted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS account_tokens_user_id_index ON account_tokens(user_id);
