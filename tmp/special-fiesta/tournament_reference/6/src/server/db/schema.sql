-- Full, empty-database schema snapshot. Keep this in sync with the numbered migration.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  mode varchar(40) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('scheduled', 'running', 'closed')),
  team_count integer NOT NULL CHECK (team_count BETWEEN 2 AND 32),
  court_count integer NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  match_duration_minutes integer NOT NULL CHECK (match_duration_minutes BETWEEN 5 AND 120),
  tournament_length_minutes integer NOT NULL CHECK (tournament_length_minutes BETWEEN 30 AND 720),
  start_time_minutes integer NOT NULL CHECK (start_time_minutes BETWEEN 0 AND 1439),
  win_points integer NOT NULL DEFAULT 3 CHECK (win_points >= 0),
  draw_points integer NOT NULL DEFAULT 1 CHECK (draw_points >= 0),
  loss_points integer NOT NULL DEFAULT 0 CHECK (loss_points >= 0),
  closing_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  name varchar(80) NOT NULL,
  seed integer NOT NULL CHECK (seed BETWEEN 1 AND 32),
  withdrawn_at timestamptz,
  withdrawal_reason varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teams_tournament_idx ON teams(tournament_id);
CREATE UNIQUE INDEX IF NOT EXISTS teams_active_name_unique
  ON teams(tournament_id, name) WHERE withdrawn_at IS NULL;

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  code varchar(80) NOT NULL,
  phase varchar(80) NOT NULL,
  round_number integer NOT NULL CHECK (round_number >= 1),
  group_key varchar(80),
  position integer NOT NULL CHECK (position >= 1),
  status varchar(20) NOT NULL CHECK (status IN ('staged', 'live', 'final', 'cancelled')),
  home_slot jsonb NOT NULL,
  away_slot jsonb NOT NULL,
  depends_on jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 2879),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 2999),
  court_number integer NOT NULL CHECK (court_number BETWEEN 1 AND 20),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 120),
  home_score integer CHECK (home_score IS NULL OR home_score >= 0),
  away_score integer CHECK (away_score IS NULL OR away_score >= 0),
  winner_team_id uuid REFERENCES teams(id) ON DELETE RESTRICT,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_tournament_code_unique UNIQUE (tournament_id, code),
  CONSTRAINT matches_final_score_complete CHECK (
    status <> 'final' OR (home_score IS NOT NULL AND away_score IS NOT NULL AND finalized_at IS NOT NULL)
  ),
  CONSTRAINT matches_end_after_start CHECK (end_minute > start_minute),
  CONSTRAINT matches_winner_requires_final CHECK (winner_team_id IS NULL OR status = 'final')
);
CREATE INDEX IF NOT EXISTS matches_tournament_round_idx
  ON matches(tournament_id, round_number, position);
CREATE INDEX IF NOT EXISTS matches_tournament_court_idx
  ON matches(tournament_id, court_number, start_minute);

CREATE TABLE IF NOT EXISTS point_entries (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  match_id uuid REFERENCES matches(id) ON DELETE RESTRICT,
  kind varchar(24) NOT NULL CHECK (kind IN ('outcome-award', 'desk-award', 'void')),
  points integer NOT NULL,
  reason varchar(500) NOT NULL,
  voids_entry_id uuid REFERENCES point_entries(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_entry_kind_amount CHECK (
    (kind = 'void' AND points < 0 AND voids_entry_id IS NOT NULL) OR
    (kind <> 'void' AND points > 0 AND voids_entry_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS point_entries_tournament_team_idx
  ON point_entries(tournament_id, team_id);
CREATE UNIQUE INDEX IF NOT EXISTS point_entries_void_unique
  ON point_entries(voids_entry_id) WHERE voids_entry_id IS NOT NULL;

INSERT INTO schema_migrations(version)
VALUES ('0001_initial_tournament_engine')
ON CONFLICT (version) DO NOTHING;
