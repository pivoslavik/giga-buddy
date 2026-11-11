CREATE TABLE auth_refresh_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_refresh_sessions_user_id ON auth_refresh_sessions (user_id);
CREATE INDEX idx_auth_refresh_sessions_expires_at ON auth_refresh_sessions (expires_at);
