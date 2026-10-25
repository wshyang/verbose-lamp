-- PSD Active Day — wholesale schema snapshot.
--
-- ADR-049 — this is THE schema. There is no migrations directory and no twin half any more:
-- while the app is pre-production there is nothing deployed to migrate from, so a chain of
-- numbered steps was a second place for the schema to live and drift. One definition, applied
-- whole by `db/bootstrap.ts` to any database that does not have it yet.
--
-- Every CREATE TABLE lists every current column. It must never degrade into "original shape plus
-- a changelog of ALTERs" — if a column changes, change it HERE, in place.
--
-- Verified equivalent to the nine migrations it replaced before they were deleted: two databases
-- were built, one migrated and one from this file, and `information_schema` matched exactly —
-- 148 columns, 225 constraints, 50 indexes (ADR-049).
--
-- Object references are fds.md §2 anchors.

BEGIN;

-- §2.2 #obj-cluster — seeded at bootstrap (B1) and, since ADR-172, editable by a superadmin.
--
-- `code` is the primary key three tables point at, two of them (chat_message, gallery_photo)
-- as permanent history snapshots. So a cluster is RETIRED, never deleted: retiring hides it
-- from signup while leaving every past message, photo and point exactly where it was. There is
-- no DELETE path anywhere in the API, which is what keeps those snapshots honest.
CREATE TABLE IF NOT EXISTS cluster (
  code          text PRIMARY KEY,
  display_name  text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 30),
  retired_at    timestamptz
);

-- ADR-061 #obj-participanttitle — the energetic word a participant is called instead of
-- "Trainer". Fixed catalogue seeded at bootstrap from PARTICIPANT_TITLES, exactly like `cluster`:
-- a row per word, referenced rather than copied, so a typo cannot invent a title.
CREATE TABLE IF NOT EXISTS participant_title (
  name  text PRIMARY KEY CHECK (length(name) BETWEEN 1 AND 20)
);

-- §2.10 #obj-facilitatoraccount
CREATE TABLE IF NOT EXISTS facilitator_account (
  id                    uuid PRIMARY KEY,
  username              text NOT NULL CHECK (length(username) BETWEEN 4 AND 20),
  passcode              text NOT NULL CHECK (passcode ~ '^[0-9]{4}$'),
  display_label         text CHECK (display_label IS NULL OR length(display_label) BETWEEN 1 AND 30),
  default_station_type  text NOT NULL DEFAULT 'none'
                          CHECK (default_station_type IN ('court', 'fringe_activity', 'none')),
  default_station_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_login_at         timestamptz,
  -- ADR-151 — presence, the same note the participant, session and screen-key rows already
  -- carry (ADR-082/145). NULLABLE on purpose, unlike those three: a facilitator account is
  -- created by a superadmin and may never be used, and "this marshal has not signed in at
  -- all today" is a different fact from "signed in at 08:02 and has gone quiet since".
  -- Defaulting it to now() at creation would erase the distinction the panel exists to show.
  last_seen_at          timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_facilitator_username_lower
  ON facilitator_account (lower(username));

-- §2.11 #obj-superadminaccount
CREATE TABLE IF NOT EXISTS superadmin_account (
  id             uuid PRIMARY KEY,
  username       text NOT NULL CHECK (length(username) BETWEEN 4 AND 20),
  passcode       text NOT NULL CHECK (passcode ~ '^[0-9]{4}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_superadmin_username_lower
  ON superadmin_account (lower(username));

-- §2.1 #obj-participant — PIN is plaintext by product directive (fds.md §9.6).
CREATE TABLE IF NOT EXISTS participant (
  id              uuid PRIMARY KEY,
  -- ADR-088 — all-digit nicknames are banned at any length: nicknames and scan numbers share
  -- a spoken channel, and humans do not count digits under stress.
  nickname        text NOT NULL CHECK (nickname ~ '^[A-Za-z0-9_]{3,20}$'
                                       AND nickname !~ '^[0-9]+$'),
  pin             text NOT NULL CHECK (pin ~ '^[0-9]{4}$'),
  -- ADR-088 — public spoken identifier for manual scan entry; random, never sequential.
  -- A string for the same reason pin is: leading zeros are load-bearing.
  scan_number     text NOT NULL CHECK (scan_number ~ '^[0-9]{4}$'),
  cluster_code    text NOT NULL REFERENCES cluster (code),
  gender          text NOT NULL CHECK (gender IN ('male', 'female')),
  avatar_variant  integer NOT NULL CHECK (avatar_variant BETWEEN 1 AND 5),
  -- ADR-173 — the optional trailing group is the sunburst: second colour, rays, twist.
  -- ADR-230 — and every pattern since: a one-letter tag (s, c, w, p) then its parts (ADR-205, ADR-207 to ADR-209).
  -- The check is widened in place and re-applied at boot, so an older database is migrated by its next start.
  avatar_look     text NOT NULL DEFAULT '3-1-2-1-3-1f4e9c-1d5b8c'
                    CHECK (avatar_look ~ '^[1-9][0-9]?(-[1-9][0-9]?){4}-[0-9a-f]{6}-[0-9a-f]{6}(-[0-9a-f]{6}-[0-9]{1,2}-[0-9]{1,2}|-s-[0-9a-f]{6}-[0-9]{1,2}-[0-9]{1,2}(-[0-9]{1,2})?|-[cwp]-[0-9a-f]{6}(-[0-9]{1,2}){5})?$'),
  -- ADR-031 — a sprite made from the participant's own photo, or NULL for a character.
  -- ADR-037 — generated at 128×128 since; 64×64 sprites stored before remain valid.
  avatar_photo    text
                    CHECK (avatar_photo IS NULL
                           OR avatar_photo ~ '^(64|128):[0-9a-f,]{6,200}:([0-9a-f][0-9a-z]{3})+$'),
  -- ADR-061 — assigned at random on sign-up and worn all day. NOT NULL because every
  -- participant has one: there is no such thing as an untitled participant, and a nullable
  -- column would mean every surface that shows it needs a fallback that should never appear.
  title           text NOT NULL REFERENCES participant_title (name),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
  -- ADR-083's chat_last_read_message_id was dropped by ADR-129: ADR-125 moved the read marker
  -- onto the device, leaving this column with no reader and no writer.
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_participant_scan_number
  ON participant (scan_number);
CREATE UNIQUE INDEX IF NOT EXISTS ux_participant_nickname_lower
  ON participant (lower(nickname));

-- §2.3 #obj-team — disbandment is soft (ADR-011): disbanded_at frees the name and join code.
CREATE TABLE IF NOT EXISTS team (
  id                     uuid PRIMARY KEY,
  team_name              text NOT NULL CHECK (length(team_name) BETWEEN 3 AND 30),
  join_code              text NOT NULL CHECK (join_code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  captain_participant_id uuid NOT NULL REFERENCES participant (id),
  is_locked              boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  disbanded_at           timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_name_lower_active
  ON team (lower(team_name)) WHERE disbanded_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_join_code_active
  ON team (join_code) WHERE disbanded_at IS NULL;

-- §2.4 #obj-teammembership — soft delete via expires_at (AGENTS-database.md §3).
CREATE TABLE IF NOT EXISTS team_membership (
  id              uuid PRIMARY KEY,
  participant_id  uuid NOT NULL REFERENCES participant (id),
  team_id         uuid NOT NULL REFERENCES team (id),
  is_captain      boolean NOT NULL DEFAULT false,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  -- ADR-063's last_read_message_id was dropped by ADR-129, for the same reason as the
  -- participant-level twin: ADR-125 moved the read marker onto the device.
  expires_at      timestamptz
);
-- §4.2.1 one team max per participant, counting active rows only
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_membership_active_participant
  ON team_membership (participant_id) WHERE expires_at IS NULL;
-- §4.2.2 exactly one captain per team
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_membership_active_captain
  ON team_membership (team_id) WHERE is_captain AND expires_at IS NULL;
-- §2.4 composite uniqueness (participant, team)
CREATE UNIQUE INDEX IF NOT EXISTS ux_team_membership_active_pair
  ON team_membership (participant_id, team_id) WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_team_membership_team ON team_membership (team_id);

-- §2.7 #obj-fringeactivity
CREATE TABLE IF NOT EXISTS fringe_activity (
  id                      uuid PRIMARY KEY,
  activity_name           text NOT NULL CHECK (length(activity_name) BETWEEN 3 AND 50),
  -- ADR-092: [{ "label": "First place", "points": 10 }, ...], 1-4 entries, validated at the API edge
  award_tiers             jsonb NOT NULL,
  is_active               boolean NOT NULL DEFAULT true,
  assigned_facilitator_id uuid REFERENCES facilitator_account (id),
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fringe_activity_name_lower
  ON fringe_activity (lower(activity_name));

-- §2.8 #obj-fringeround
CREATE TABLE IF NOT EXISTS fringe_round (
  id                         uuid PRIMARY KEY,
  activity_id                uuid NOT NULL REFERENCES fringe_activity (id),
  round_number               integer NOT NULL CHECK (round_number >= 1),
  status                     text NOT NULL CHECK (status IN ('open', 'closed', 'ended')),
  opened_at                  timestamptz NOT NULL DEFAULT now(),
  closed_at                  timestamptz,
  opened_by_facilitator_id   uuid NOT NULL REFERENCES facilitator_account (id),
  UNIQUE (activity_id, round_number)
);
-- §3.3 at most one round per activity in {open, ended}
CREATE UNIQUE INDEX IF NOT EXISTS ux_fringe_round_single_active
  ON fringe_round (activity_id) WHERE status IN ('open', 'ended');

-- §2.9 #obj-fringescan — immutable except is_voided; every reported value is snapshotted.
CREATE TABLE IF NOT EXISTS fringe_scan (
  id                            uuid PRIMARY KEY,
  participant_id                uuid NOT NULL REFERENCES participant (id),
  round_id                      uuid NOT NULL REFERENCES fringe_round (id),
  activity_id                   uuid NOT NULL REFERENCES fringe_activity (id),
  facilitator_id                uuid NOT NULL REFERENCES facilitator_account (id),
  activity_name_snapshot        text NOT NULL,
  round_number_snapshot         integer NOT NULL CHECK (round_number_snapshot >= 1),
  points_awarded_snapshot       integer NOT NULL CHECK (points_awarded_snapshot >= 1),
  tier_label_snapshot           text NOT NULL,
  facilitator_username_snapshot text NOT NULL,
  client_scan_uuid              uuid NOT NULL UNIQUE,
  client_timestamp              timestamptz NOT NULL,
  scanned_at                    timestamptz NOT NULL DEFAULT now(),
  is_voided                     boolean NOT NULL DEFAULT false,
  -- ADR-138 (F1) — when the station undid this award itself, within the ten-second window.
  -- It is NOT the same event as a superadmin void, and it cannot live in void_audit_entry:
  -- that table's performed_by_superadmin_id is NOT NULL, and ADR-117's ledger records human
  -- decisions made by a superadmin. The scan row already names the facilitator, so recording
  -- the undo here keeps "a marshal corrected themselves at the station" distinguishable from
  -- "somebody with the authority to overrule reviewed this and took it away".
  undone_at                     timestamptz
);
-- ADR-116 — one *live* award per participant per round. The uniqueness is partial so that
-- voiding a scan releases the slot: a participant scanned for turning up who then takes first
-- place must be re-awardable, and before this index the void was a one-way subtraction that
-- locked them out of the round for good.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fringe_scan_live_slot
  ON fringe_scan (participant_id, round_id) WHERE is_voided = false;
CREATE INDEX IF NOT EXISTS ix_fringe_scan_round ON fringe_scan (round_id);
CREATE INDEX IF NOT EXISTS ix_fringe_scan_participant ON fringe_scan (participant_id);

-- ADR-110 #obj-swagstation — the swag counter: fringe's twin that hands out ITEMS, not
-- points. Items are [{ "label": "Tote bag", "limit": 1 }, ...], 1-6 entries, validated at
-- the API edge like award tiers; the limit is per participant per round.
CREATE TABLE IF NOT EXISTS swag_station (
  id            uuid PRIMARY KEY,
  station_name  text NOT NULL CHECK (length(station_name) BETWEEN 3 AND 50),
  items         jsonb NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_swag_station_name_lower
  ON swag_station (lower(station_name));

-- ADR-110 #obj-swaground — the fringe round's twin: a fresh allowance per round.
CREATE TABLE IF NOT EXISTS swag_round (
  id                        uuid PRIMARY KEY,
  station_id                uuid NOT NULL REFERENCES swag_station (id),
  round_number              integer NOT NULL CHECK (round_number >= 1),
  status                    text NOT NULL CHECK (status IN ('open', 'closed', 'ended')),
  opened_at                 timestamptz NOT NULL DEFAULT now(),
  closed_at                 timestamptz,
  opened_by_facilitator_id  uuid NOT NULL REFERENCES facilitator_account (id),
  UNIQUE (station_id, round_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_swag_round_single_active
  ON swag_round (station_id) WHERE status IN ('open', 'ended');

-- ADR-110 #obj-swagclaim — immutable; every reported value is snapshotted (the scan's twin).
CREATE TABLE IF NOT EXISTS swag_claim (
  id                             uuid PRIMARY KEY,
  participant_id                 uuid NOT NULL REFERENCES participant (id),
  round_id                       uuid NOT NULL REFERENCES swag_round (id),
  station_id                     uuid NOT NULL REFERENCES swag_station (id),
  facilitator_id                 uuid NOT NULL REFERENCES facilitator_account (id),
  station_name_snapshot          text NOT NULL,
  round_number_snapshot          integer NOT NULL CHECK (round_number_snapshot >= 1),
  item_label_snapshot            text NOT NULL,
  facilitator_username_snapshot  text NOT NULL,
  client_claim_uuid              uuid NOT NULL UNIQUE,
  claimed_at                     timestamptz NOT NULL DEFAULT now(),
  -- ADR-159 — the handout became reversible. Voided claims no longer consume allowance.
  is_voided                      boolean NOT NULL DEFAULT false,
  -- ADR-159 (mirrors ADR-138) — set when the counter took back its own handout inside the
  -- window; never by a superadmin, whose reversals live in void_audit_entry instead.
  undone_at                      timestamptz
);
CREATE INDEX IF NOT EXISTS ix_swag_claim_allowance
  ON swag_claim (round_id, participant_id, item_label_snapshot);
CREATE INDEX IF NOT EXISTS ix_swag_claim_round ON swag_claim (round_id);

-- §2.12 #obj-pointconfig — singleton enforced by the constant-column unique index.
-- ADR-270 — fringe settings only: the tournament's rates and pacing moved onto the tournament.
CREATE TABLE IF NOT EXISTS point_config (
  id                        uuid PRIMARY KEY,
  singleton                 boolean NOT NULL DEFAULT true CHECK (singleton),
  -- ADR-116 — the day's participation floor: what turning up to a fringe activity is worth
  -- when you do not place. A floor belongs to the day rather than the station, because the
  -- failure it prevents is an admin configuring a station with placings only and nothing for
  -- everybody else. Defaulted so older dumps stay loadable.
  fringe_participation_points integer NOT NULL DEFAULT 5
                              CHECK (fringe_participation_points >= 1),
  -- ADR-176 — the passport bonus: one payment for visiting this many DISTINCT stations.
  -- Defaulted to 0 — OFF — for the same reason as the champion bonus above: a day that is
  -- not running a passport must be unaffected by the column existing. The threshold has a
  -- non-zero default so the pair is never half-configured; it is inert while the bonus is 0.
  fringe_passport_bonus_points integer NOT NULL DEFAULT 0
                              CHECK (fringe_passport_bonus_points >= 0),
  fringe_passport_stations    integer NOT NULL DEFAULT 4
                              CHECK (fringe_passport_stations BETWEEN 2 AND 20),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by_superadmin_id  uuid NOT NULL REFERENCES superadmin_account (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_point_config_singleton ON point_config (singleton);

-- §2.13 #obj-voidauditentry — append-only; never updated, never deleted.
-- ADR-117 #obj-scoreadjustment — the superadmin's manual correction ledger. An operational
-- escape hatch: when a bug, an outage or a human error leaves the scoreboard wrong, this is
-- how it is put right during the day rather than argued about afterwards.
--
-- Append-only ON PURPOSE. There is no void flag and no update path: a mistaken adjustment is
-- corrected by an equal and opposite one, so the ledger always shows what was done and when.
-- Every entry is attributed to a station and carries the superadmin's own words for why.
-- ADR-118 — the operations switch. Absent row means "everything is on": this table is a
-- record of a deliberate pause, never a bootstrap gate, so a fresh database runs at full
-- service without anyone configuring it. The point_config singleton idiom.
CREATE TABLE IF NOT EXISTS service_state (
  id                        uuid PRIMARY KEY,
  singleton                 boolean NOT NULL DEFAULT true CHECK (singleton),
  is_social_paused          boolean NOT NULL DEFAULT false,
  -- ADR-147 — station offline mode, off by default for the same reason the pause is: an
  -- absent row, and an untouched switch, mean the plainest possible behaviour. Turning this
  -- on is what installs a service worker on facilitator phones; turning it off retires
  -- every one of them at its next successful read.
  is_station_offline_enabled boolean NOT NULL DEFAULT false,
  -- No `by whom` twin: that would be a second join on superadmin_account for a fact nobody
  -- asks. The pair below belongs to the social pause, which three hundred people can see.
  station_offline_updated_at timestamptz,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by_superadmin_id  uuid NOT NULL REFERENCES superadmin_account (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_service_state_singleton ON service_state (singleton);

CREATE TABLE IF NOT EXISTS score_adjustment (
  id                         uuid PRIMARY KEY,
  participant_id             uuid NOT NULL REFERENCES participant (id),
  activity_id                uuid NOT NULL REFERENCES fringe_activity (id),
  -- Signed, and never zero: an adjustment of nothing is not a correction, it is noise in
  -- the ledger. Bounded so a slipped keypress cannot silently decide the whole event.
  points                     integer NOT NULL CHECK (points <> 0 AND points BETWEEN -100 AND 100),
  reason                     text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  activity_name_snapshot     text NOT NULL,
  created_by_superadmin_id   uuid NOT NULL REFERENCES superadmin_account (id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  -- ADR-248 — the batch this was posted with, or NULL for one entered at the desk on its own.
  -- No REFERENCES clause here: `award_batch` is defined below this table and Postgres resolves a
  -- column's foreign key when the column is created, so the key is added by name at the foot of this
  -- file. Both paths — a fresh database and one older than the batch — end at the same named
  -- constraint rather than two spellings of it.
  batch_id                   uuid
);
CREATE INDEX IF NOT EXISTS ix_score_adjustment_participant
  ON score_adjustment (participant_id);

CREATE TABLE IF NOT EXISTS void_audit_entry (
  id                            uuid PRIMARY KEY,
  -- ADR-248 — 'awardbatch': a reversed batch is a taken-back decision, which is what this register is
  -- for. The widened list is re-applied to older databases in the additive section below.
  target_type                   text NOT NULL CHECK (target_type IN ('fringescan', 'swagclaim', 'awardbatch')),
  target_id                     uuid NOT NULL,
  action                        text NOT NULL CHECK (action IN ('void', 'unvoid')),
  reason                        text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  performed_by_superadmin_id    uuid NOT NULL REFERENCES superadmin_account (id),
  performed_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_void_audit_target ON void_audit_entry (target_type, target_id);

-- Sessions (ADR-004) — opaque token, soft invalidation, exactly one actor reference.
CREATE TABLE IF NOT EXISTS session (
  id              uuid PRIMARY KEY,
  token           text NOT NULL UNIQUE,
  actor_type      text NOT NULL CHECK (actor_type IN ('participant', 'facilitator', 'superadmin')),
  participant_id  uuid REFERENCES participant (id),
  facilitator_id  uuid REFERENCES facilitator_account (id),
  superadmin_id   uuid REFERENCES superadmin_account (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz NOT NULL,
  expires_at      timestamptz,
  CHECK (
    (CASE WHEN participant_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN facilitator_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN superadmin_id  IS NULL THEN 0 ELSE 1 END) = 1
  )
);
CREATE INDEX IF NOT EXISTS ix_session_active ON session (token) WHERE expires_at IS NULL;

/*
 * ADR-140 — the hall screen's credential.
 *
 * Deliberately NOT a row in `session`: a session belongs to a person who signed in, carries a
 * TTL measured in days and resolves to an Actor that `requireAnyActor` lets into every shared
 * read in the app, chat included. A projector is a thing in a room. It is issued a key by a
 * superadmin, it is revoked by hand rather than by expiry, and what it may read is an
 * allowlist of six endpoints rather than everything a human may read. Separate table, separate
 * guard, no path from one to the other.
 */
CREATE TABLE IF NOT EXISTS screen_key (
  id             uuid PRIMARY KEY,
  label          text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  token          text NOT NULL UNIQUE,
  created_by     uuid NOT NULL REFERENCES superadmin_account (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  -- Soft delete, like every other invalidation here: a revoked key stays readable so the
  -- audit question "what was projecting that day" still has an answer.
  expires_at     timestamptz,
  -- ADR-160 — the scenes this screen may show. Defaulted to all nine so every key minted
  -- before this column existed keeps doing exactly what it did; the feature is subtraction.
  -- The non-empty CHECK is the schema's half of "revoke it instead to turn the screen off".
  enabled_scenes jsonb NOT NULL DEFAULT '["board","individuals","onCourt","finished","upNext","groups","road","photosLatest","photosTop"]'::jsonb
    CHECK (jsonb_typeof(enabled_scenes) = 'array' AND jsonb_array_length(enabled_scenes) >= 1)
);

CREATE INDEX IF NOT EXISTS ix_screen_key_active ON screen_key (token) WHERE expires_at IS NULL;

-- ADR-046 — the chat room (promoted from fds.md §9.5 deferred scope). `id` is a UUIDv7, so it
-- is the key, the sort order and a reconnecting stream's resume cursor all at once. The author
-- label is snapshot at write time so a later rename cannot rewrite what the room saw.
CREATE TABLE IF NOT EXISTS chat_message (
  id                    uuid PRIMARY KEY,
  author_type           text NOT NULL CHECK (author_type IN ('participant', 'facilitator', 'superadmin')),
  participant_id        uuid REFERENCES participant (id),
  facilitator_id        uuid REFERENCES facilitator_account (id),
  superadmin_id         uuid REFERENCES superadmin_account (id),
  author_label_snapshot text NOT NULL,
  cluster_code_snapshot text REFERENCES cluster (code),
  body                  text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at            timestamptz NOT NULL DEFAULT now(),
  hidden_at             timestamptz,
  CHECK (
    (CASE WHEN participant_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN facilitator_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN superadmin_id  IS NULL THEN 0 ELSE 1 END) = 1
  )
);
CREATE INDEX IF NOT EXISTS ix_chat_message_visible ON chat_message (id) WHERE hidden_at IS NULL;

-- ADR-074 #obj-announcement — a staff announcement, which is not a chat message.
--
-- Its own table for the reason ADR-063's room was: an announcement carries per-participant dismissal
-- state, which a chat row has nowhere to put, and it is delivered as a toast over the banner rather
-- than as a line in a room. Authored only by a superadmin, so there is no author-type check to make.
CREATE TABLE IF NOT EXISTS announcement (
  id                    uuid PRIMARY KEY,
  superadmin_id         uuid NOT NULL REFERENCES superadmin_account (id),
  -- Frozen at write time (AGENTS.md non-negotiable #7), like every other snapshot in the schema.
  author_label_snapshot text NOT NULL,
  body                  text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- ADR-074 — retracting is soft, never a delete: the row stays for the audit trail and drops out of
  -- every read, the same rule the rest of the schema follows.
  retracted_at          timestamptz
);
CREATE INDEX IF NOT EXISTS ix_announcement_live
  ON announcement (id) WHERE retracted_at IS NULL;
-- ADR-074 — there is deliberately no dismissal table. Whether a reader has clicked a toast away is
-- kept in that browser's own storage, so the server holds no per-participant row per announcement and
-- the live read is identical for everybody (which is what lets it be cached once for all of them).

-- ADR-063 #obj-teamchatmessage — a team's own room, in its own table.
--
-- Separate from `chat_message` on purpose: a room column on the shared table would mean one
-- forgotten predicate leaks every team's private conversation into the global room, and no test
-- can be as reliable as a route that cannot reach the rows at all. The columns are simpler too —
-- a team room is its members, so the author is always a participant and the global room's
-- three-way exclusive author CHECK is not needed.
CREATE TABLE IF NOT EXISTS team_chat_message (
  id                    uuid PRIMARY KEY,
  team_id               uuid NOT NULL REFERENCES team (id),
  -- ADR-063 — the room doubles as the team's history, so a row is either something a member SAID
  -- or an event that happened to the roster. `participant_id` is the subject either way: the
  -- speaker, or the person who joined or left. That is why it stays NOT NULL.
  kind                  text NOT NULL DEFAULT 'said'
                          -- ADR-154 — the three staff kinds exist because a room reading
                          -- "Priya left" when an organiser moved her is a worse record than
                          -- no record at all. A roster repair is not a thing the member did.
                          CHECK (kind IN ('said', 'joined', 'left',
                                          'staff_added', 'staff_removed', 'captain_changed')),
  participant_id        uuid NOT NULL REFERENCES participant (id),
  -- Frozen at write time (AGENTS.md non-negotiable #7): a nickname or title changed later must
  -- not rewrite what the room saw an hour ago.
  author_label_snapshot text NOT NULL,
  title_snapshot        text NOT NULL,
  -- Only a spoken line has a body. An event's sentence is UI copy and lives in
  -- `packages/contracts/src/messages.ts` — storing it here would put user-facing text in the
  -- database, where `duplicated-copy` cannot see it and no one can change it.
  body                  text CHECK (body IS NULL OR length(body) BETWEEN 1 AND 500),
  created_at            timestamptz NOT NULL DEFAULT now(),
  hidden_at             timestamptz,
  CHECK ((kind = 'said') = (body IS NOT NULL))
);
-- (team_id, id) because every read is one room's tail: the team narrows it and the UUIDv7 id
-- orders it, so no created_at sort and no second index.
CREATE INDEX IF NOT EXISTS ix_team_chat_message_visible
  ON team_chat_message (team_id, id) WHERE hidden_at IS NULL;

-- ADR-047 — the photo gallery (promoted from fds.md §9.5). Note what is absent: no image bytes.
-- Photos are files under GALLERY_DATA_DIR named by these ids; the database only indexes them,
-- because streaming blobs through PGlite's one serialized connection would queue a gallery
-- burst ahead of a facilitator's match score.
CREATE TABLE IF NOT EXISTS gallery_photo (
  id                      uuid PRIMARY KEY,
  uploader_type           text NOT NULL CHECK (uploader_type IN ('participant', 'facilitator')),
  participant_id          uuid REFERENCES participant (id),
  facilitator_id          uuid REFERENCES facilitator_account (id),
  uploader_label_snapshot text NOT NULL,
  cluster_code_snapshot   text REFERENCES cluster (code),
  caption                 text NOT NULL DEFAULT '' CHECK (length(caption) <= 140),
  width                   integer NOT NULL CHECK (width > 0),
  height                  integer NOT NULL CHECK (height > 0),
  bytes                   integer NOT NULL CHECK (bytes > 0),
  -- ADR-050 — the archival original's identity. The bytes themselves are a `raw` row in
  -- gallery_blob; only what is needed to FIND and DEDUPE them lives here, so the listing stays
  -- narrow. `original_filename` is kept unaltered so Corporate's archive is recognisable, and
  -- `sha1_raw` is globally unique: an identical file is the same photo however many people try
  -- to share it, and storing it twice buys nothing but 12 MB.
  original_filename       text NOT NULL,
  sha1_raw                char(40) NOT NULL CHECK (sha1_raw ~ '^[0-9a-f]{40}$'),
  raw_byte_size           integer NOT NULL CHECK (raw_byte_size > 0),
  -- ADR-052 — false when the client had to re-encode an oversized original to fit the archive cap.
  -- Recorded because an archive that cannot say which files are pristine is not much of an archive.
  raw_is_original         boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  hidden_at               timestamptz,
  -- ADR-125 — when this photo last became visible, which is what the gallery's LED watermark is
  -- taken over. It is NOT `created_at`: a photo hidden by a moderator and later restored has a
  -- creation time in the past, so keying the dot on creation would let it reappear in the grid
  -- without ever lighting anything. Equal to `created_at` for the overwhelming majority of rows,
  -- and moved only by a restore.
  visible_since           timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (CASE WHEN participant_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN facilitator_id IS NULL THEN 0 ELSE 1 END) = 1
  )
);
CREATE INDEX IF NOT EXISTS ix_gallery_photo_visible ON gallery_photo (id) WHERE hidden_at IS NULL;
-- The duplicate guard. Unique over ALL photos including hidden ones: a hidden duplicate still
-- occupies the space the check exists to protect.
CREATE UNIQUE INDEX IF NOT EXISTS ux_gallery_photo_sha1 ON gallery_photo (sha1_raw);
CREATE INDEX IF NOT EXISTS ix_gallery_photo_uploader ON gallery_photo (participant_id)
  WHERE hidden_at IS NULL;

CREATE TABLE IF NOT EXISTS gallery_vote (
  id             uuid PRIMARY KEY,
  photo_id       uuid NOT NULL REFERENCES gallery_photo (id),
  participant_id uuid NOT NULL REFERENCES participant (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gallery_vote_active
  ON gallery_vote (photo_id, participant_id) WHERE expires_at IS NULL;

CREATE TABLE IF NOT EXISTS gallery_report (
  id             uuid PRIMARY KEY,
  photo_id       uuid NOT NULL REFERENCES gallery_photo (id),
  participant_id uuid NOT NULL REFERENCES participant (id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gallery_report_once
  ON gallery_report (photo_id, participant_id);

-- ADR-048 — photo bytes live in Postgres, in their OWN table (mitigation M1). The split is the
-- safety property: metadata and bytes are separate tables, so a listing physically cannot read a
-- byte, and one careless `select()` cannot turn the grid into a gigabyte scan through PGlite's
-- single serialized connection. `STORAGE EXTERNAL` keeps TOAST out-of-line but drops its
-- compression, because WebP and JPEG are already compressed.
CREATE TABLE IF NOT EXISTS gallery_blob (
  id         uuid PRIMARY KEY,
  photo_id   uuid NOT NULL REFERENCES gallery_photo (id),
  -- 'raw' is the untouched original, kept for archival and NEVER served to the gallery; the
  -- public route validates against a narrower enum so it cannot be requested there (ADR-050).
  rendition  text NOT NULL CHECK (rendition IN ('full', 'thumb', 'raw')),
  -- The served renditions are always webp or jpeg. `raw` is whatever the camera produced, which
  -- is why this list is permissive rather than a closed set of three.
  mime       text NOT NULL,
  byte_size  integer NOT NULL CHECK (byte_size > 0),
  payload    bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gallery_blob ALTER COLUMN payload SET STORAGE EXTERNAL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gallery_blob_rendition
  ON gallery_blob (photo_id, rendition);

-- ADR-177 — the day's programme: the run sheet, as rows.
--
-- `starts_at` is NULLABLE, which is the one surprising thing here and is deliberate. The real
-- programme opens with a line that has no time at all ("before departure: have an early lunch,
-- no food is provided"). A nominal 12.00 would be a lie the UI would then have to render, and a
-- separate `is_preamble` flag would be a second way of saying the same thing. NULL means exactly
-- what it says: this item has no fixed time. Reads sort NULLS FIRST, and a timeless item is
-- never "now" and never "next", which is correct.
--
-- `display_order` ranks ONLY the timeless items (ADR-190). For anything with a clock the order
-- IS `starts_at`, for the original reason: a hand-maintained order that can disagree with the
-- clock is a second source of truth, and the one it would disagree with is the one the
-- participant is standing in. But that argument says nothing about the items with no clock to
-- disagree with, and those were left ordered by `created_at` — the accident of which one was
-- typed first — with no way to change it. So the column exists and the sort consults it after
-- `starts_at`, where it can only ever break a tie that the clock did not already settle.
--
-- `is_active` rather than a delete, matching the court and activity toggles: when rain moves the
-- programme, a superadmin switches an item off and it stays on the page struck through. Somebody
-- who memorised a 3pm item needs to see that it is cancelled, not find it silently missing.
CREATE TABLE IF NOT EXISTS agenda_item (
  id         uuid PRIMARY KEY,
  starts_at  timestamptz,
  ends_at    timestamptz,
  title      text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  location   text CHECK (location IS NULL OR length(location) BETWEEN 1 AND 60),
  detail     text CHECK (detail IS NULL OR length(detail) BETWEEN 1 AND 300),
  is_active  boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- An end without a start is not a shorter item, it is a broken one.
  CHECK (ends_at IS NULL OR starts_at IS NOT NULL),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS ix_agenda_item_order ON agenda_item (starts_at, created_at);


-- ADR-248 — the award batch: one decision, posted once, reversed as a whole.
--
-- A team award is not a score adjustment's twin by accident. It is the same object with a team for a
-- subject, so the bounds, the roster snapshot and the append-only property are copied across rather than
-- re-derived, and a reader who knows one ledger knows the other. What the batch adds is the unit a human
-- would actually want to take back — "the 3:40pm promotion award", not one line of it. The rows are
-- never deleted, because ADR-117's reason for append-only stands untouched: a ledger you can rewrite is a
-- ledger that cannot be audited, so the *header* carries the reversal and every reader filters on it.
CREATE TABLE IF NOT EXISTS award_batch (
  id                            uuid PRIMARY KEY,
  -- ADR-009's client key in the `fringe_scan` idiom (`client_scan_uuid uuid NOT NULL UNIQUE` above):
  -- minted by the console before it posts, because the one genuinely new failure a twenty-row write
  -- introduces is a timeout after the inserts, and a second tap must not double it.
  client_batch_uuid             uuid NOT NULL UNIQUE,
  label                         text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  reason                        text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  created_by_superadmin_id      uuid NOT NULL REFERENCES superadmin_account (id),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  -- Reversible like a void, never deleted. `reversed_reason` is required by the route rather than by a
  -- CHECK, so the message can name the batch — the division `edit_reason` uses on a match.
  is_reversed                   boolean NOT NULL DEFAULT false,
  reversed_at                   timestamptz,
  reversed_by_superadmin_id     uuid REFERENCES superadmin_account (id),
  reversed_reason               text CHECK (reversed_reason IS NULL OR length(reversed_reason) BETWEEN 1 AND 200),
  -- The flag and the stamp are one fact, and a reversal names who did it: ADR-245's reasoning about a
  -- closed stage, reused because it is the same shape of decision.
  CHECK (is_reversed = (reversed_at IS NOT NULL)),
  CHECK (is_reversed = false OR reversed_by_superadmin_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS team_award (
  id                uuid PRIMARY KEY,
  team_id           uuid NOT NULL REFERENCES team (id),
  -- No reason, no label and no author on the row: the batch owns all three (owner's D8), and a row that
  -- restated its header would be two answers to one question the moment somebody corrected the header.
  batch_id          uuid NOT NULL REFERENCES award_batch (id),
  points            integer NOT NULL CHECK (points <> 0 AND points BETWEEN -100 AND 100),
  -- ADR-005, applied to a new event: who was ON the team when this was paid, so the money does not move
  -- when the roster does. The shape is a match roster snapshot's, because the CTE that reads it is the
  -- same one that reads those — `entry->>'participantId'`.
  roster_snapshot   jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_team_award_team ON team_award (team_id);
CREATE INDEX IF NOT EXISTS ix_team_award_batch ON team_award (batch_id);


-- =============================================================================================
-- ADR-275 — THE TOURNAMENT (core). docs/design/tournament-engine.md §2.
--
-- The core's tables point at the app in exactly one place (`tournament_entrant.team_id`) and at
-- nothing the scheduler owns. Match-to-match references are slot rows with real foreign keys, not
-- JSON (ADR-273): a seat names what fills it, and `seated_entrant_id` freezes it once someone sits.
-- Actors are stored as (kind, id, label) snapshots: a tournament event outlives the account row.
-- =============================================================================================

-- Venue courts. A facilitator's default court station points here (`facilitator_account`).
CREATE TABLE IF NOT EXISTS tournament_court (
  id             uuid PRIMARY KEY,
  court_number   integer NOT NULL UNIQUE CHECK (court_number BETWEEN 1 AND 20),
  label          text NOT NULL CHECK (length(label) BETWEEN 1 AND 30),
  is_enabled     boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament (
  id                uuid PRIMARY KEY,
  name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  status            text NOT NULL CHECK (status IN ('draft', 'live', 'closed')),
  -- Which game this tournament is for. Orthogonal to format (bracket shape on tournament_scheduler).
  -- ADR-293: one open tournament per kind, so different game types may run concurrently.
  kind              text NOT NULL DEFAULT 'captains_ball' CHECK (kind IN ('captains_ball', 'dumb_courts')),
  -- ADR-313 — the Start configuration saved with a draft. Start finalises it into the scheduler;
  -- until then it is only the form's saved answer, and schedules nothing.
  draft_setup       jsonb,
  -- ADR-321 — dumb courts only: the point tiers court masters award from (label + points, 1-4).
  dumb_tiers        jsonb,
  -- Active-day points a result pays, unless a stage carries its own.
  win_points        integer NOT NULL CHECK (win_points BETWEEN 0 AND 100),
  draw_points       integer NOT NULL CHECK (draw_points BETWEEN 0 AND 100),
  loss_points       integer NOT NULL CHECK (loss_points BETWEEN 0 AND 100),
  created_by_kind   text NOT NULL CHECK (created_by_kind IN ('facilitator', 'superadmin', 'system')),
  created_by_id     uuid NOT NULL,
  created_by_label  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  closed_at         timestamptz,
  close_reason      text CHECK (close_reason IS NULL OR length(close_reason) BETWEEN 1 AND 200),
  -- ADR-336 — when the day stopped taking new matches (the one-way switch to court awards), or NULL.
  paused_at         timestamptz,
  -- Bumped by every write, so a reader can tell a stale picture from a current one.
  revision          integer NOT NULL DEFAULT 0
);
-- At most one open tournament per kind: different game types may run concurrently (ADR-293).
-- Supersedes ux_tournament_one_open (ADR-273 "one open at a time"), scoped to (kind) instead of (true).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_one_open_per_kind ON tournament (kind) WHERE status <> 'closed';

CREATE TABLE IF NOT EXISTS tournament_entrant (
  id               uuid PRIMARY KEY,
  tournament_id    uuid NOT NULL REFERENCES tournament (id),
  team_id          uuid NOT NULL REFERENCES team (id),
  -- The name the room knew the team by when it entered; a later rename does not rewrite history.
  name_snapshot    text NOT NULL,
  entry_order      integer NOT NULL CHECK (entry_order >= 1),
  withdrawn_at     timestamptz,
  withdraw_reason  text CHECK (withdraw_reason IS NULL OR length(withdraw_reason) BETWEEN 1 AND 200),
  UNIQUE (tournament_id, team_id),
  UNIQUE (tournament_id, entry_order)
);

CREATE TABLE IF NOT EXISTS tournament_stage (
  id                   uuid PRIMARY KEY,
  tournament_id        uuid NOT NULL REFERENCES tournament (id),
  code                 text NOT NULL CHECK (length(code) BETWEEN 1 AND 20),
  ordinal              integer NOT NULL CHECK (ordinal >= 1),
  label                text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  kind                 text NOT NULL CHECK (kind IN ('pool', 'bracket', 'swiss', 'open')),
  allows_draws         boolean NOT NULL,
  advance_count        integer NOT NULL DEFAULT 0 CHECK (advance_count >= 0),
  -- NULL = the tournament's own rates; all three or none.
  win_points           integer CHECK (win_points IS NULL OR win_points BETWEEN 0 AND 100),
  draw_points          integer CHECK (draw_points IS NULL OR draw_points BETWEEN 0 AND 100),
  loss_points          integer CHECK (loss_points IS NULL OR loss_points BETWEEN 0 AND 100),
  -- ADR-320 — the stage's internal table points (ranking only, never paid); NULL = default 3/1/0, all three or none.
  table_win_points     integer CHECK (table_win_points IS NULL OR table_win_points BETWEEN 0 AND 100),
  table_draw_points    integer CHECK (table_draw_points IS NULL OR table_draw_points BETWEEN 0 AND 100),
  table_loss_points    integer CHECK (table_loss_points IS NULL OR table_loss_points BETWEEN 0 AND 100),
  -- ADR-325 — where this stage's teams come from when an earlier stage decides them: the feeder and
  -- how many it sends on. Both NULL for a stage dealt from the entered teams; both set, or neither.
  intake_stage_id      uuid REFERENCES tournament_stage (id),
  intake_count         integer CHECK (intake_count IS NULL OR intake_count >= 2),
  status               text NOT NULL CHECK (status IN ('pending', 'active', 'completed')),
  completed_at         timestamptz,
  completion_reason    text CHECK (completion_reason IS NULL OR length(completion_reason) BETWEEN 1 AND 200),
  UNIQUE (tournament_id, code),
  UNIQUE (tournament_id, ordinal),
  CHECK ((win_points IS NULL) = (draw_points IS NULL) AND (draw_points IS NULL) = (loss_points IS NULL)),
  CHECK ((intake_stage_id IS NULL) = (intake_count IS NULL))
);

CREATE TABLE IF NOT EXISTS tournament_group (
  id            uuid PRIMARY KEY,
  stage_id      uuid NOT NULL REFERENCES tournament_stage (id),
  code          text NOT NULL CHECK (length(code) BETWEEN 1 AND 10),
  label         text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  superseded_at timestamptz
);
-- ADR-334 — one live group per code in a stage; replaced groups keep their code as history.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_group_stage_code_live
  ON tournament_group (stage_id, code) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS tournament_group_entrant (
  group_id     uuid NOT NULL REFERENCES tournament_group (id),
  entrant_id   uuid NOT NULL REFERENCES tournament_entrant (id),
  seed         integer NOT NULL CHECK (seed >= 1),
  PRIMARY KEY (group_id, entrant_id)
);

-- ADR-325 — who actually came through to a fed stage, frozen when the stage feeding it closes.
-- Append-only: a later correction moves a table, never the people already sent on (P-09, P-11).
CREATE TABLE IF NOT EXISTS tournament_stage_entrant (
  stage_id   uuid NOT NULL REFERENCES tournament_stage (id),
  entrant_id uuid NOT NULL REFERENCES tournament_entrant (id),
  place      integer NOT NULL CHECK (place >= 1),
  PRIMARY KEY (stage_id, entrant_id),
  UNIQUE (stage_id, place)
);

CREATE TABLE IF NOT EXISTS tournament_match (
  id                 uuid PRIMARY KEY,
  tournament_id      uuid NOT NULL REFERENCES tournament (id),
  stage_id           uuid NOT NULL REFERENCES tournament_stage (id),
  group_id           uuid REFERENCES tournament_group (id),
  code               text NOT NULL CHECK (length(code) BETWEEN 1 AND 20),
  round              integer NOT NULL CHECK (round >= 1),
  sequence           integer NOT NULL CHECK (sequence >= 1),
  origin             text NOT NULL CHECK (origin IN ('structure', 'ad_hoc')),
  is_placement       boolean NOT NULL DEFAULT false,
  status             text NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'superseded')),
  court_id           uuid REFERENCES tournament_court (id),
  planned_start_at   timestamptz,
  planned_minutes    integer NOT NULL CHECK (planned_minutes BETWEEN 1 AND 180),
  started_at         timestamptz,
  ended_at           timestamptz,
  started_by_kind    text CHECK (started_by_kind IS NULL OR started_by_kind IN ('facilitator', 'superadmin', 'system')),
  started_by_id      uuid,
  started_by_label   text,
  score_a            integer NOT NULL DEFAULT 0 CHECK (score_a >= 0),
  score_b            integer NOT NULL DEFAULT 0 CHECK (score_b >= 0),
  result_kind        text CHECK (result_kind IS NULL OR result_kind IN ('score', 'walkover', 'bye')),
  winner_side        text CHECK (winner_side IS NULL OR winner_side IN ('a', 'b')),
  is_voided          boolean NOT NULL DEFAULT false,
  cancel_reason      text CHECK (cancel_reason IS NULL OR length(cancel_reason) BETWEEN 1 AND 300),
  version            integer NOT NULL DEFAULT 0,
  UNIQUE (tournament_id, code),
  -- A finished match has a result; nothing else does.
  CHECK ((status = 'completed') = (result_kind IS NOT NULL)),
  -- The starter is one actor snapshot: all three columns, or none (ADR-281).
  CHECK ((started_by_kind IS NULL) = (started_by_id IS NULL) AND (started_by_id IS NULL) = (started_by_label IS NULL))
);
-- One live match per court, the old table's rule kept.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_match_live_court
  ON tournament_match (court_id) WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS ix_tournament_match_tournament ON tournament_match (tournament_id, sequence);

-- ADR-273 — requirement 10: what fills a seat, as real references.
CREATE TABLE IF NOT EXISTS tournament_slot (
  match_id                uuid NOT NULL REFERENCES tournament_match (id),
  side                    text NOT NULL CHECK (side IN ('a', 'b')),
  source_kind             text NOT NULL
                            CHECK (source_kind IN ('entrant', 'winner_of', 'loser_of', 'group_place', 'stage_place', 'pairing', 'vacant')),
  source_entrant_id       uuid REFERENCES tournament_entrant (id),
  source_match_id         uuid REFERENCES tournament_match (id),
  source_group_id         uuid REFERENCES tournament_group (id),
  source_stage_id         uuid REFERENCES tournament_stage (id),
  source_place            integer CHECK (source_place IS NULL OR source_place >= 1),
  source_round            integer CHECK (source_round IS NULL OR source_round >= 1),
  label                   text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  seated_entrant_id       uuid REFERENCES tournament_entrant (id),
  seat_override_reason    text CHECK (seat_override_reason IS NULL OR length(seat_override_reason) BETWEEN 1 AND 200),
  PRIMARY KEY (match_id, side),
  CHECK (source_kind <> 'entrant' OR source_entrant_id IS NOT NULL),
  CHECK (source_kind NOT IN ('winner_of', 'loser_of') OR source_match_id IS NOT NULL),
  CHECK (source_kind <> 'group_place' OR (source_group_id IS NOT NULL AND source_place IS NOT NULL)),
  CHECK (source_kind <> 'stage_place' OR (source_stage_id IS NOT NULL AND source_place IS NOT NULL)),
  CHECK (source_kind <> 'pairing' OR (source_stage_id IS NOT NULL AND source_place IS NOT NULL AND source_round IS NOT NULL))
);

-- Active-day points to an entrant: append, and void — never edit, never delete (ADR-117's rule).
CREATE TABLE IF NOT EXISTS tournament_award (
  id               uuid PRIMARY KEY,
  tournament_id    uuid NOT NULL REFERENCES tournament (id),
  entrant_id       uuid NOT NULL REFERENCES tournament_entrant (id),
  match_id         uuid REFERENCES tournament_match (id),
  kind             text NOT NULL CHECK (kind IN ('result', 'manual')),
  points           integer NOT NULL CHECK (points <> 0 AND points BETWEEN -100 AND 100),
  reason           text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  created_by_kind  text NOT NULL CHECK (created_by_kind IN ('facilitator', 'superadmin', 'system')),
  created_by_id    uuid NOT NULL,
  created_by_label text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  voided_at        timestamptz,
  CHECK (kind <> 'result' OR match_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_tournament_award_entrant ON tournament_award (entrant_id);

-- ADR-321 — dumb-court bookkeeping for one manual award: the court and tier it came from, and the
-- client-minted id that makes a double-tap replay instead of double-pay. The award itself is an
-- ordinary tournament_award; this is the only dumb-specific table (the core stays minimal).
CREATE TABLE IF NOT EXISTS tournament_dumb_award (
  award_id     uuid PRIMARY KEY REFERENCES tournament_award (id),
  court_id     uuid NOT NULL REFERENCES tournament_court (id),
  tier_label   text NOT NULL CHECK (length(tier_label) BETWEEN 1 AND 20),
  client_uuid  uuid NOT NULL UNIQUE
);

-- ADR-336 — THE ONE-WAY SWITCH, recorded where it happened. One row per switch: the bracket that was
-- retired, the award day that replaced it, the tiers it started with and the person who confirmed it.
-- Append-only, and there is deliberately no `resumed_at`: nothing in the app can put a bracket back.
-- The row is also the mode's memory — `readOperatingMode` asks it before it asks the tournament rows,
-- and the drain reads its reason to close the bracket the moment the last court finishes.
CREATE TABLE IF NOT EXISTS tournament_mode_change (
  id                     uuid PRIMARY KEY,
  -- The fixture day this switch ended, and the award day it created.
  fixtures_tournament_id uuid NOT NULL REFERENCES tournament (id),
  dumb_tournament_id     uuid NOT NULL REFERENCES tournament (id),
  -- ADR-336 §4 — the buttons the award day started with, snapshotted: a later edit rewrites no history.
  tiers                  jsonb NOT NULL,
  reason                 text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  switched_by_id         uuid NOT NULL,
  switched_by_label      text NOT NULL,
  switched_at            timestamptz NOT NULL,
  -- Minted by the desk before it posts (ADR-009's idiom): a double tap replays the first switch.
  client_uuid            uuid NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_tournament_mode_change_switched ON tournament_mode_change (switched_at DESC);

-- ADR-336 §5.4 — a facilitator's ask to switch the day. Soft-resolved, never deleted: a declined ask
-- is part of what the room did that afternoon. One pending ask at a time (the partial index below),
-- and an ask expires on its own so a forgotten one cannot be confirmed against a different hour.
CREATE TABLE IF NOT EXISTS tournament_mode_request (
  id                uuid PRIMARY KEY,
  requested_by_id   uuid NOT NULL,
  requested_by_label text NOT NULL,
  reason            text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  -- Where the ask was made from, when it was made from a court. Informative, never authority.
  court_id          uuid REFERENCES tournament_court (id),
  client_uuid       uuid NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL,
  -- Ten minutes from creation: an ask is about the room as it is now.
  expires_at        timestamptz NOT NULL,
  resolved_at       timestamptz,
  resolution        text CHECK (resolution IN ('confirmed', 'declined', 'expired')),
  resolved_by_label text,
  decline_reason    text CHECK (decline_reason IS NULL OR length(decline_reason) BETWEEN 1 AND 200),
  CHECK ((resolved_at IS NULL) = (resolution IS NULL))
);
-- One pending ask at a time: two marshals pressing at once get the first ask back, not a queue.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_mode_request_pending
  ON tournament_mode_request ((true)) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_tournament_mode_request_created ON tournament_mode_request (created_at DESC);

-- The tournament's own history: every decision, who made it, and why. Append-only.
CREATE TABLE IF NOT EXISTS tournament_event (
  id             uuid PRIMARY KEY,
  tournament_id  uuid NOT NULL REFERENCES tournament (id),
  at             timestamptz NOT NULL,
  actor_kind     text NOT NULL CHECK (actor_kind IN ('facilitator', 'superadmin', 'system')),
  actor_id       uuid NOT NULL,
  actor_label    text NOT NULL,
  kind           text NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
  match_id       uuid REFERENCES tournament_match (id),
  reason         text,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_tournament_event_tournament ON tournament_event (tournament_id, at DESC);

-- =============================================================================================
-- ADR-275 — THE SCHEDULER. It points at the core; nothing in the core points back (ADR-272).
-- =============================================================================================
CREATE TABLE IF NOT EXISTS tournament_scheduler (
  tournament_id        uuid PRIMARY KEY REFERENCES tournament (id),
  format               text NOT NULL CHECK (format IN ('open', 'round_robin', 'groups_knockout', 'single_elimination',
                         'double_elimination', 'consolation', 'swiss', 'flighted_quads', 'ironman', 'points_rush', 'pipeline')),
  options              jsonb NOT NULL DEFAULT '{}'::jsonb,
  pipeline_spec        jsonb,
  status               text NOT NULL CHECK (status IN ('active', 'terminated')),
  match_minutes        integer NOT NULL CHECK (match_minutes BETWEEN 1 AND 180),
  changeover_minutes   integer NOT NULL CHECK (changeover_minutes BETWEEN 0 AND 60),
  rest_minutes         integer NOT NULL CHECK (rest_minutes BETWEEN 0 AND 120),
  deadline_at          timestamptz,
  auto_advance         boolean NOT NULL DEFAULT true,
  planned_at           timestamptz,
  terminated_at        timestamptz,
  terminated_by_label  text,
  terminate_reason     text CHECK (terminate_reason IS NULL OR length(terminate_reason) BETWEEN 1 AND 200),
  revision             integer NOT NULL DEFAULT 0,
  CHECK ((status = 'terminated') = (terminated_at IS NOT NULL))
);

-- A human placement the planner keeps where it was put.
CREATE TABLE IF NOT EXISTS tournament_scheduler_pin (
  match_id     uuid PRIMARY KEY REFERENCES tournament_match (id),
  pinned_by    text NOT NULL,
  pinned_at    timestamptz NOT NULL DEFAULT now(),
  -- Released, never deleted (AGENTS-database.md §3): a pin is live while this is NULL.
  released_at  timestamptz
);

-- =============================================================================================
-- ADR-276 — THE POINTS BRIDGE. App-side: who on a team a tournament payment reached.
-- =============================================================================================
CREATE TABLE IF NOT EXISTS tournament_match_roster (
  match_id         uuid NOT NULL REFERENCES tournament_match (id),
  entrant_id       uuid NOT NULL REFERENCES tournament_entrant (id),
  team_id          uuid NOT NULL REFERENCES team (id),
  -- ADR-005: who was on the team at kick-off, so a roster change cannot move a played match.
  roster_snapshot  jsonb NOT NULL,
  PRIMARY KEY (match_id, entrant_id)
);

CREATE TABLE IF NOT EXISTS tournament_award_roster (
  award_id         uuid PRIMARY KEY REFERENCES tournament_award (id),
  team_id          uuid NOT NULL REFERENCES team (id),
  roster_snapshot  jsonb NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Additive columns (ADR-168)
--
-- `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists, so a column added to
-- a definition above never reaches a database provisioned by an older snapshot — the table is
-- there, so the create is skipped, and the new column silently is not. Every column added after
-- its table was first released is therefore repeated here as an idempotent `ADD COLUMN IF NOT
-- EXISTS`, which `ensureSchema` runs on every boot.

-- ADR-190 — an explicit place in the queue, for the items that have no time to sort them.
ALTER TABLE agenda_item ADD COLUMN IF NOT EXISTS display_order integer;
--
-- This is still not a migration system: it adds, it never alters or drops. Keep each line
-- identical in type and default to the definition above, or the two will disagree depending on
-- how old the database is.
ALTER TABLE cluster         ADD COLUMN IF NOT EXISTS retired_at timestamptz;
-- ADR-176 — the passport bonus pair. Inert on an older database until a superadmin saves the
-- config, because the bonus half defaults to 0.
ALTER TABLE point_config    ADD COLUMN IF NOT EXISTS fringe_passport_bonus_points integer NOT NULL DEFAULT 0;
ALTER TABLE point_config    ADD COLUMN IF NOT EXISTS fringe_passport_stations     integer NOT NULL DEFAULT 4;

-- ADR-173 — the first CHECK this file has had to CHANGE rather than add.
--
-- `avatar_look` gained an optional sunburst group, and the constraint above only reaches a
-- database created after this line was written. An older one still carries the seven-part-only
-- rule and would reject every sunburst as a 500 from a constraint violation.
--
-- Drop-then-add is idempotent as a pair even though `ADD CONSTRAINT` alone is not, and it is
-- safe to re-run: the new rule accepts everything the old one did. The name is the one Postgres
-- generates for an inline column CHECK, which is why it can be named at all.
ALTER TABLE participant DROP CONSTRAINT IF EXISTS participant_avatar_look_check;
ALTER TABLE participant ADD  CONSTRAINT participant_avatar_look_check
  CHECK (avatar_look ~ '^[1-9][0-9]?(-[1-9][0-9]?){4}-[0-9a-f]{6}-[0-9a-f]{6}(-[0-9a-f]{6}-[0-9]{1,2}-[0-9]{1,2}|-s-[0-9a-f]{6}-[0-9]{1,2}-[0-9]{1,2}(-[0-9]{1,2})?|-[cwp]-[0-9a-f]{6}(-[0-9]{1,2}){5})?$');

-- ADR-248 — a batch may pay people as well as teams in a single decision ("the ones the rain cost us").
-- Nullable, and NULL keeps meaning "posted one at a time at the desk", which is what every row already in
-- the ledger was: NOT NULL would have rewritten the day's history to satisfy a new column. The row's own
-- `reason` is filled from the batch rather than dropped, because the CHECK two hundred lines up is the
-- participant ledger's rule and each ledger keeping its own is the whole idea of sharing a header.
ALTER TABLE score_adjustment ADD COLUMN IF NOT EXISTS batch_id uuid;
-- The key the definition above could not carry, added the way ADR-173 adds a changed CHECK: a pair that
-- is safe to re-run, because `ADD CONSTRAINT` alone has no IF NOT EXISTS. It follows the award tables, so
-- the table it points at exists by then whichever snapshot a database was first built from.
ALTER TABLE score_adjustment DROP CONSTRAINT IF EXISTS score_adjustment_batch_id_fkey;
ALTER TABLE score_adjustment ADD  CONSTRAINT score_adjustment_batch_id_fkey
  FOREIGN KEY (batch_id) REFERENCES award_batch (id);
-- ADR-248 — the third time this file has had to CHANGE a CHECK rather than add one, on ADR-173's pattern.
-- It is also the widening `'swagclaim'` itself never got: a database provisioned before that value was
-- added to the definition above accepts no audit row for a swag undo, and finds out at the worst moment.
-- Drop-then-add is idempotent as a pair, and the new list accepts everything the old one did.
ALTER TABLE void_audit_entry DROP CONSTRAINT IF EXISTS void_audit_entry_target_type_check;
ALTER TABLE void_audit_entry ADD  CONSTRAINT void_audit_entry_target_type_check
  CHECK (target_type IN ('fringescan', 'swagclaim', 'awardbatch'));
-- ADR-270 — 'tournamentmatch' left the list with the old match table. A database stamped by an
-- older snapshot is refused at boot (ADR-271) rather than narrowed here: narrowing a CHECK over rows
-- that may hold the old value is a migration, not an additive repair.
-- ADR-274 — a pin is released rather than deleted; the column came after the table first shipped.
ALTER TABLE tournament_scheduler_pin ADD COLUMN IF NOT EXISTS released_at timestamptz;
-- ADR-281 — a pairing seat's columns, required the way the other kinds' already are. Named, so the
-- pair below is safe to re-run on a database built before the definition above carried it.
ALTER TABLE tournament_match DROP CONSTRAINT IF EXISTS tournament_match_starter_check;
ALTER TABLE tournament_match ADD  CONSTRAINT tournament_match_starter_check
  CHECK ((started_by_kind IS NULL) = (started_by_id IS NULL) AND (started_by_id IS NULL) = (started_by_label IS NULL));
ALTER TABLE tournament_slot DROP CONSTRAINT IF EXISTS tournament_slot_pairing_check;
ALTER TABLE tournament_slot ADD  CONSTRAINT tournament_slot_pairing_check
  CHECK (source_kind <> 'pairing' OR (source_stage_id IS NOT NULL AND source_place IS NOT NULL AND source_round IS NOT NULL));
-- ADR-293 — one open tournament per kind. Adds the kind column (idempotent) and swaps the
-- single-tournament index for a per-kind one. Any database stamped before schema version 3
-- is refused at boot (ADR-264/271); run DB_INIT_RESET=stale to trade it in.
-- NOTE: the column is additive with a DEFAULT so it is safe on a fresh database built from this file.
-- The old index (ux_tournament_one_open) no longer exists in the CREATE section above; this drop
-- is here to clean up any database that was previously built with the old definition.
DROP INDEX IF EXISTS ux_tournament_one_open;

-- ADR-310 — the scheduler's format list grows 'pipeline': one row whose structure was
-- composed stage by stage instead of built by a whole-tournament format. The
-- drop-then-add pair is safe to re-run (ADR-173's pattern); the name is the one
-- Postgres generates for the inline CHECK above, and the new list accepts
-- everything the old one did.
ALTER TABLE tournament_scheduler DROP CONSTRAINT IF EXISTS tournament_scheduler_format_check;
ALTER TABLE tournament_scheduler ADD  CONSTRAINT tournament_scheduler_format_check
  CHECK (format IN ('open', 'round_robin', 'groups_knockout', 'single_elimination',
                    'double_elimination', 'consolation', 'swiss', 'flighted_quads', 'ironman', 'points_rush', 'pipeline'));

-- ADR-313 — the draft's saved Start configuration, added additively so a database built before
-- it gains the column on the next boot (a nullable column rewrites nothing that already stands).
ALTER TABLE tournament ADD COLUMN IF NOT EXISTS draft_setup jsonb;

-- ADR-320 — a stage's internal table points, added additively like draft_setup above:
-- nullable, so a database built before them gains the columns on the next boot and
-- every stage already standing keeps ranking on the default 3/1/0.
ALTER TABLE tournament_stage ADD COLUMN IF NOT EXISTS table_win_points integer;
ALTER TABLE tournament_stage ADD COLUMN IF NOT EXISTS table_draw_points integer;
ALTER TABLE tournament_stage ADD COLUMN IF NOT EXISTS table_loss_points integer;

-- ADR-325 — a stage's intake (which earlier stage feeds it, and how many it takes), added additively:
-- nullable, so every stage already standing keeps meaning "dealt from the entered teams". The
-- pairing CHECK is the drop-then-add pair ADR-173 uses, since ADD CONSTRAINT has no IF NOT EXISTS.
ALTER TABLE tournament_stage ADD COLUMN IF NOT EXISTS intake_stage_id uuid REFERENCES tournament_stage (id);
ALTER TABLE tournament_stage ADD COLUMN IF NOT EXISTS intake_count    integer;
ALTER TABLE tournament_stage DROP CONSTRAINT IF EXISTS tournament_stage_intake_count_check;
ALTER TABLE tournament_stage ADD  CONSTRAINT tournament_stage_intake_count_check
  CHECK (intake_count IS NULL OR intake_count >= 2);
ALTER TABLE tournament_stage DROP CONSTRAINT IF EXISTS tournament_stage_intake_pair_check;
ALTER TABLE tournament_stage ADD  CONSTRAINT tournament_stage_intake_pair_check
  CHECK ((intake_stage_id IS NULL) = (intake_count IS NULL));

-- ADR-321 — dumb courts: the tier list column, and the widened kind list (an existing database's
-- inline CHECK still names only 'captains_ball'; Postgres calls it tournament_kind_check, and the
-- new list accepts everything the old one did).
ALTER TABLE tournament ADD COLUMN IF NOT EXISTS dumb_tiers jsonb;

-- ADR-336 — the pause instant. Additive, so no CURRENT_SCHEMA_VERSION bump and no seed regeneration.
ALTER TABLE tournament ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE tournament DROP CONSTRAINT IF EXISTS tournament_kind_check;
ALTER TABLE tournament ADD  CONSTRAINT tournament_kind_check
  CHECK (kind IN ('captains_ball', 'dumb_courts'));

-- ADR-342 — an ask never expires, so the deadline column stops being written. A database provisioned
-- before this ruling still carries `expires_at NOT NULL`; this is the one loosening line in the file,
-- safe on every boot and every age of database, because dropping a NOT NULL cannot invalidate a row.
-- The column itself stays (the file never drops columns) and new rows leave it NULL.
ALTER TABLE tournament_mode_request ALTER COLUMN expires_at DROP NOT NULL;

-- ADR-264 — the schema's own version, stamped by whichever build last applied
-- this snapshot (db/bootstrap.ts). One row, held by the singleton key. It is
-- what lets a boot tell "built by an older snapshot" from "built by this one"
-- without guessing from which tables happen to exist. DDL only, as everywhere
-- in this file: the row itself is written by the code that applies the file.
CREATE TABLE IF NOT EXISTS schema_state (
  singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version    integer NOT NULL CHECK (version >= 0),
  applied_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
