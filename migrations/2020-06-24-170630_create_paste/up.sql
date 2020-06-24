CREATE TABLE IF NOT EXISTS pastes
(
    id VARCHAR PRIMARY KEY,
    belongs_to VARCHAR references users(id),
    is_url BOOLEAN NOT NULL DEFAULT 'f',
    content TEXT NOT NULL
)