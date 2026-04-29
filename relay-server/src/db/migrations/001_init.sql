-- NeoVision — initial schema migration
-- Run with: node src/db/migrate.js

BEGIN;

-- ─── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Admins ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        UNIQUE NOT NULL,
  password_hash   TEXT        NOT NULL,
  totp_secret     TEXT,
  totp_enabled    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ
);

-- ─── Client devices ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       TEXT        UNIQUE NOT NULL,  -- UUID generated on agent install
  hostname        TEXT        NOT NULL,
  os_version      TEXT,
  agent_version   TEXT,
  is_online       BOOLEAN     NOT NULL DEFAULT FALSE,
  last_seen_at    TIMESTAMPTZ,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_device_id ON clients (device_id);
CREATE INDEX IF NOT EXISTS idx_clients_is_online  ON clients (is_online);

-- ─── Remote sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  client_id       UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  duration_secs   INTEGER GENERATED ALWAYS AS (
                    EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
                  ) STORED,
  actions_log     JSONB       NOT NULL DEFAULT '[]'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_sessions_admin_id  ON sessions (admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);

-- ─── File transfer log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_transfers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  filename        TEXT        NOT NULL,
  file_size_bytes BIGINT,
  auto_run        BOOLEAN     NOT NULL DEFAULT FALSE,
  transferred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
