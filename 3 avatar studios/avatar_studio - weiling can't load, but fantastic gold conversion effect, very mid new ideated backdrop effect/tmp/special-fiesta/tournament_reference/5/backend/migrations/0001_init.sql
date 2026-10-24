-- Migration 0001_init (idempotent twin of schema-snapshot.sql, GREENFIELD s5).
BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  name text NOT NULL,
  seed integer NOT NULL,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS courts (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  name text NOT NULL,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  match_key text NOT NULL,
  phase text NOT NULL,
  group_key text,
  round integer NOT NULL,
  slot_a jsonb NOT NULL,
  slot_b jsonb NOT NULL,
  depends_on jsonb NOT NULL,
  court_id uuid REFERENCES courts(id),
  start_minutes integer,
  end_minutes integer,
  status text NOT NULL,
  score_a integer,
  score_b integer,
  origin text NOT NULL,
  deleted_at timestamptz,
  UNIQUE (tournament_id, match_key)
);

CREATE TABLE IF NOT EXISTS points_entries (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  team_id uuid NOT NULL REFERENCES teams(id),
  match_id uuid REFERENCES matches(id),
  points integer NOT NULL,
  reason text NOT NULL,
  status text NOT NULL,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS teams_active_name_idx
  ON teams (tournament_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS matches_tournament_idx ON matches (tournament_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS points_tournament_idx ON points_entries (tournament_id) WHERE deleted_at IS NULL;

INSERT INTO schema_migrations (version) VALUES ('0001_init') ON CONFLICT DO NOTHING;
COMMIT;
