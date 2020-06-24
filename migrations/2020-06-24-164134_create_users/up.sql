CREATE TABLE IF NOT EXISTS users
(
    id VARCHAR PRIMARY KEY,
    username VARCHAR,
    password VARCHAR,
    activated BOOLEAN
)