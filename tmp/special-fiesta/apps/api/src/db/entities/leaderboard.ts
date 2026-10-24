import { sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { SCOREBOARD_TAG, cachedRead } from '../../lib/cache.js';
import { firstOrDefault, rowsOf } from '../rows.js';

/**
 * ADR-006 — the leaderboard is computed on read, never materialised, so void/unvoid and
 * winner edits are correct by construction (fds.md F44 acceptance criteria).
 *
 * ADR-038 — computed on read is not recomputed per poll: these reads are decorated with
 * a seconds-deep memo that every scoring write invalidates (`SCOREBOARD_TAG`), so the
 * aggregate runs once per change or per few seconds — not once per phone. Void a match
 * and the very next read recomputes; that is the same freshness ADR-006 promised, minus
 * the three hundred identical queries between changes.
 *
 * This file holds the ONE deliberate exception to "no raw SQL" in AGENTS-database.md §1: a
 * set-based aggregate over scans and awards. Everything else goes through Drizzle's builder.
 *
 * Point attribution:
 *   fringe      → non-voided fringe_scan.points_awarded_snapshot, credited to the scanner
 *   tournament  → team awards (ADR-248), paid to the roster each batch froze (ADR-005), and the
 *                 rebuilt tournament's non-voided awards, paid to the roster the points bridge froze
 *                 (ADR-276) — a match result's at kick-off.
 *   passport    → one bonus once a participant's non-voided scans cover enough DISTINCT
 *                 stations (ADR-176). Counted in the fringe column, because that is where
 *                 the stamps that earned it are counted.
 */

interface RawRow {
  [key: string]: unknown;
}

async function runQuery<T extends RawRow>(db: Executor, statement: ReturnType<typeof sql>) {
  const result = await db.execute<T>(statement);
  return rowsOf(result) as T[];
}

/** Per-participant points from both sources, before any grouping. */
const participantPoints = sql`
  WITH fringe_points AS (
    SELECT s.participant_id,
           sum(s.points_awarded_snapshot)::int AS points,
           max(s.scanned_at) AS last_at
    FROM fringe_scan s
    WHERE s.is_voided = false
    GROUP BY s.participant_id
  ),
  -- ADR-176 — the passport bonus, DERIVED on read for the same reason as the champion bonus
  -- below, and the reason is sharper here.
  --
  -- A passport is a THRESHOLD, and a threshold can be crossed backwards. Void one scan and a
  -- participant who had four distinct stations now has three, so the bonus has to vanish.
  -- Stored as a row it would not, and the compensating write would have to find every
  -- passport that void invalidated — the exact class of bug ADR-006 exists to make
  -- impossible. Derived, the next read simply fails the HAVING and the points are gone.
  --
  -- DISTINCT activity_id, not a count of scans: two rounds at the same station are two scans
  -- and one stamp. The point of the bonus is breadth.
  --
  -- point_config is a singleton (ux_point_config_singleton), so the CROSS JOIN multiplies
  -- nothing; with no config row yet, or the bonus set to 0, this CTE is empty and the feature
  -- is off. last_at is the participant's latest scan rather than the moment the threshold was
  -- crossed: it is drawn from the same rows as fringe_points.last_at and so can never exceed
  -- it, which means it cannot move the ADR-029 tie-break either way.
  passport_points AS (
    SELECT s.participant_id,
           c.fringe_passport_bonus_points AS points,
           max(s.scanned_at) AS last_at
    FROM fringe_scan s
    CROSS JOIN point_config c
    WHERE s.is_voided = false
      AND c.fringe_passport_bonus_points > 0
    GROUP BY s.participant_id, c.fringe_passport_bonus_points, c.fringe_passport_stations
    HAVING count(DISTINCT s.activity_id) >= c.fringe_passport_stations
  ),
  -- ADR-248 — a team award, paid to the roster the batch froze for it. Same jsonb grammar a
  -- completed match writes and the same reader, because an award and a fixture result are meant
  -- to agree about who was on the team. A reversed batch pays nobody: the rows stay in the
  -- ledger as the record of a decision and stop being a score, which is what putting the flag on
  -- the batch instead of on each line buys.
  --
  -- No stage filter, for the reason the roster arm above has none: this is the day's board, and
  -- the day's board prices everything the day held.
  team_award_points AS (
    SELECT (entry->>'participantId')::uuid AS participant_id,
           -- ADR-337 — the award is the TEAM's, and the team is paid it once. Each member of the
           -- frozen roster holds one share of it, so the cluster this participant belongs to is
           -- credited its own fraction and no more. GREATEST(…, 1) is a guard, not a rule: a
           -- frozen roster is never empty.
           sum(ta.points::numeric / GREATEST(jsonb_array_length(ta.roster_snapshot), 1)) AS points,
           max(ta.created_at) AS last_at
    FROM team_award ta
    JOIN award_batch ab ON ab.id = ta.batch_id
    CROSS JOIN LATERAL jsonb_array_elements(ta.roster_snapshot) AS entry
    WHERE NOT ab.is_reversed
    GROUP BY 1
  ),
  -- ADR-276 — what the rebuilt tournament paid: every award it has not voided (a result, a bye, a
  -- desk award), to the roster the points bridge froze for it — a result's at its match's kick-off.
  -- A corrected or voided match voids its awards rather than editing them, so this arm needs no
  -- knowledge of corrections at all: the ledger already says what is still being paid.
  tournament_award_points AS (
    SELECT (entry->>'participantId')::uuid AS participant_id,
           -- ADR-337 — as above: a match result or a court award is the TEAM's points, sliced
           -- across the roster the bridge froze for it (the kick-off roster for a result), so
           -- the sum over a cluster's members is that cluster's share of the team's award.
           sum(a.points::numeric / GREATEST(jsonb_array_length(r.roster_snapshot), 1)) AS points,
           max(a.created_at) AS last_at
    FROM tournament_award a
    JOIN tournament_award_roster r ON r.award_id = a.id
    CROSS JOIN LATERAL jsonb_array_elements(r.roster_snapshot) AS entry
    WHERE a.voided_at IS NULL
    GROUP BY 1
  ),
  -- The tournament column: team awards (ADR-248) and the tournament's own payments, one sum per person.
  tournament_points AS (
    SELECT participant_id, sum(points) AS points, max(last_at) AS last_at
    FROM (
      SELECT participant_id, points, last_at FROM team_award_points
      UNION ALL
      SELECT participant_id, points, last_at FROM tournament_award_points
    ) paid
    GROUP BY participant_id
  ),
  -- ADR-117 — the superadmin's manual corrections. Signed, so this subtracts as readily as
  -- it adds, and attributed to a station, which is why it lands in the fringe column rather
  -- than a third one: a correction to what a station awarded belongs beside that award.
  --
  -- ADR-248 — the join to award_batch is the only thing a batch needs to be reversible here and
  -- nowhere else: an orphan row (batch_id IS NULL) is a correction made at the desk, and the
  -- coalesce keeps paying it. Without this line a reversed batch would still be on the board,
  -- which is the failure the whole feature exists to prevent.
  adjustment_points AS (
    SELECT a.participant_id,
           sum(a.points)::int AS points,
           max(a.created_at) AS last_at
    FROM score_adjustment a
    LEFT JOIN award_batch ab ON ab.id = a.batch_id
    -- "or no batch at all" rather than a coalesce: an orphan row was never in a batch, and the two
    -- spellings of "nothing to check" read differently here even though they agree everywhere.
    WHERE a.batch_id IS NULL OR NOT ab.is_reversed
    GROUP BY a.participant_id
  ),
  totals AS (
    SELECT p.id AS participant_id,
           p.nickname,
           p.cluster_code,
           p.gender,
           p.avatar_variant,
           p.avatar_look,
           p.avatar_photo,
           p.title,
           coalesce(f.points, 0) + coalesce(adj.points, 0) + coalesce(pp.points, 0)
             AS fringe_points,
           coalesce(t.points, 0) AS tournament_points,
           -- ADR-029 — when this participant last scored, which is when they reached the
           -- total they hold now. Ties are broken by who got there first. A correction is a
           -- change to the total, so it counts as reaching it.
           greatest(f.last_at, t.last_at, adj.last_at, pp.last_at) AS reached_at
    FROM participant p
    LEFT JOIN fringe_points f ON f.participant_id = p.id
    LEFT JOIN tournament_points t ON t.participant_id = p.id
    LEFT JOIN adjustment_points adj ON adj.participant_id = p.id
    LEFT JOIN passport_points pp ON pp.participant_id = p.id
  )
`;

export interface ClusterStandingRecord {
  cluster_code: string;
  display_name: string;
  fringe_points: number;
  tournament_points: number;
  total_points: number;
  participant_count: number;
  reached_at: Date | string | null;
}

/** F16/F49 — all clusters always appear, including zero-point ones (fds.md §8.4). */
async function clusterStandingsFromDb(db: Executor): Promise<ClusterStandingRecord[]> {
  return runQuery<ClusterStandingRecord & RawRow>(
    db,
    sql`${participantPoints}
      SELECT c.code AS cluster_code,
             c.display_name,
             -- ADR-337 — a cluster's column is still the sum of its members' rows; what changed is
             -- that a member's row now holds their SHARE of a team award, so the sum is the
             -- cluster's share of its teams' awards and no longer scales with roster size.
             --
             -- collapse(6) is the ordering value, not a display value. A team of seven slices 100
             -- into 14.285714… each, and seven of those sum to 99.99999999999999: two clusters that
             -- are mathematically level can differ in the fourteenth decimal. Compared raw, the
             -- board would rank them on float noise instead of on ADR-029's tie-break, so the
             -- fraction is collapsed to six decimals before it is ordered or carried. No scoring
             -- decision can turn on the sixth decimal; the paint rounds to a whole number later.
             round(coalesce(sum(t.fringe_points), 0)::numeric, 6) AS fringe_points,
             round(coalesce(sum(t.tournament_points), 0)::numeric, 6) AS tournament_points,
             round(coalesce(sum(t.fringe_points + t.tournament_points), 0)::numeric, 6) AS total_points,
             count(t.participant_id)::int AS participant_count,
             max(t.reached_at) AS reached_at
      FROM cluster c
      LEFT JOIN totals t ON t.cluster_code = c.code
      GROUP BY c.code, c.display_name
      -- ADR-029 — level on points, the cluster that got there first is ahead. ADR-337 — the sort
      -- key is the collapsed value above, never the painted integer: sorting the rounded number
      -- would tie two clusters that are 0.4 apart and hand the rank to the tie-break instead.
      ORDER BY total_points DESC, max(t.reached_at) ASC NULLS LAST, c.code ASC`,
  );
}

/** ADR-038 — one aggregate serves every phone that polls inside the window. */
export const readClusterStandings = cachedRead(clusterStandingsFromDb, {
  name: 'leaderboard.clusterStandings',
  ttlMs: 5_000,
  swrMs: 25_000,
  tags: [SCOREBOARD_TAG],
});

export interface IndividualStandingRecord {
  participant_id: string;
  nickname: string;
  cluster_code: string;
  gender: 'male' | 'female';
  avatar_variant: number;
  avatar_look: string;
  avatar_photo: string | null;
  /** ADR-061 — carried so the avatar peek can name them properly (ADR-062). */
  title: string;
  total_points: number;
  reached_at: Date | string | null;
}

/** F16 — top-10 individual scorers. */
async function topIndividualsFromDb(
  db: Executor,
  limit = 10,
): Promise<IndividualStandingRecord[]> {
  return runQuery<IndividualStandingRecord & RawRow>(
    db,
    sql`${participantPoints}
      SELECT participant_id, nickname, cluster_code, gender, avatar_variant, avatar_look,
             avatar_photo, title,
             round((fringe_points + tournament_points)::numeric, 6) AS total_points,
             reached_at
      FROM totals
      WHERE (fringe_points + tournament_points) > 0
      ORDER BY total_points DESC, reached_at ASC NULLS LAST, lower(nickname) ASC
      LIMIT ${limit}`,
  );
}

/** ADR-038 — same shield as the cluster standings; the limit is part of the key. */
export const readTopIndividuals = cachedRead(topIndividualsFromDb, {
  name: 'leaderboard.topIndividuals',
  ttlMs: 5_000,
  swrMs: 25_000,
  tags: [SCOREBOARD_TAG],
  key: (limit = 10) => `limit-${limit}`,
});

/**
 * ADR-161 — every participant, for the export. Two deliberate differences from the board's
 * top ten: no limit, and no `> 0` filter. A record of the day that silently omits everybody
 * who scored nothing is not a record of the day — it cannot answer "did my whole cluster
 * turn up", which is exactly the question an organiser asks a week later.
 *
 * Uncached, unlike its top-ten sibling: that shield (ADR-038) exists because every phone in
 * the building polls the board, whereas this is read by one superadmin a handful of times,
 * and a five-second-stale export is a worse trade than one more query.
 */
export async function readAllIndividuals(db: Executor): Promise<IndividualStandingRecord[]> {
  return runQuery<IndividualStandingRecord & RawRow>(
    db,
    sql`${participantPoints}
      SELECT participant_id, nickname, cluster_code, gender, avatar_variant, avatar_look,
             avatar_photo, title,
             round((fringe_points + tournament_points)::numeric, 6) AS total_points,
             reached_at
      FROM totals
      ORDER BY total_points DESC, reached_at ASC NULLS LAST, lower(nickname) ASC`,
  );
}

export interface ParticipantTotalsRecord {
  fringe_points: number;
  tournament_points: number;
  scan_count: number;
  /** ADR-176 — DISTINCT stations, which is what a passport counts. */
  stations_visited: number;
  passport_stations_required: number;
  passport_bonus_points: number;
}

/** F4/F15 — own totals and cluster contribution. */
async function participantTotalsFromDb(
  db: Executor,
  participantId: string,
): Promise<ParticipantTotalsRecord> {
  const rows = await runQuery<ParticipantTotalsRecord & RawRow>(
    db,
    sql`${participantPoints}
      SELECT t.fringe_points,
             t.tournament_points,
             (SELECT count(*)::int FROM fringe_scan s
               WHERE s.participant_id = t.participant_id AND s.is_voided = false) AS scan_count,
             -- ADR-176 — the passport counts stations, not scans, so this is DISTINCT.
             (SELECT count(DISTINCT s.activity_id)::int FROM fringe_scan s
               WHERE s.participant_id = t.participant_id AND s.is_voided = false)
               AS stations_visited,
             -- The config travels with the progress so the card can say what is still needed
             -- without a second request. No config row yet reads as a passport that is off.
             (SELECT coalesce(max(c.fringe_passport_stations), 0)::int FROM point_config c)
               AS passport_stations_required,
             (SELECT coalesce(max(c.fringe_passport_bonus_points), 0)::int FROM point_config c)
               AS passport_bonus_points
      FROM totals t
      WHERE t.participant_id = ${participantId}`,
  );
  return firstOrDefault(rows, {
    fringe_points: 0,
    tournament_points: 0,
    scan_count: 0,
    stations_visited: 0,
    passport_stations_required: 0,
    passport_bonus_points: 0,
  });
}

/** ADR-038 — the home card polls this; between scans the answer cannot change. */
export const readParticipantTotals = cachedRead(participantTotalsFromDb, {
  name: 'leaderboard.participantTotals',
  ttlMs: 5_000,
  swrMs: 15_000,
  tags: [SCOREBOARD_TAG],
  key: (participantId) => participantId,
});
