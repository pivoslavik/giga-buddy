CREATE TABLE demo_actions (
    id TEXT PRIMARY KEY,
    owner BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('access', 'review', 'absence')),
    payload JSONB NOT NULL,
    external_id TEXT UNIQUE,
    status TEXT NOT NULL
);

CREATE INDEX idx_demo_actions_owner_kind ON demo_actions (owner, kind);
