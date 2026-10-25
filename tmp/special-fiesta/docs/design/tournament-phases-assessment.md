# Phased tournaments, promotions and team awards — schema assessment and design

An assessment **and** a design, not a build. Asked 2026-10-12, against `7f777d5`.
Every line reference below was read in this checkout; nothing here is quoted from memory or from an
earlier assessment. Where a number is an estimate rather than a measurement it says so.

The question arrived as "can we add phases?" and it has an unexpected answer: **the schema already has
phases, but it stores them as a three-value enum, and the enum is what locks the facilitators in.**

---

## 1. Short answer

1. **The tournament schema is in good shape, and normalised further than most app schemas of this size.**
   One fact per column, real FKs, CHECKs doing the work the UI would otherwise have to remember,
   append-only ledgers where a mutable row would lie, and a deliberate `plan` / `activated` split
   (ADR-150). There is exactly one transitive dependency in the six tables (§3 F7) and one
   denormalised label (F8), and both are snapshots — the house style, not an oversight. There is no
   repeating group anywhere: the one candidate, per-phase rates, is missing rather than badly stored.
2. **Ten findings, of which five are worth acting on regardless of this feature.** The most
   consequential is not a normalisation issue at all: rule 11, the gate that is supposed to keep
   `schema.sql` and Drizzle in step, compares **table names only** — so three FK mirrors and one
   JSONB shape have already drifted, silently, and the next one will too (§3, F1–F4).
3. **The new mode needs four things that do not exist** — a phase as a row, per-phase rates, a recorded
   promotion, and a team-level point total. The last is the expensive one: **today no team has a point
   total anywhere.** "Award points to teams" is not a new button; it is a new subject for the currency
   the whole board is built on (§4).
4. **It fits without much complexity, because the shape already exists.** One table (`tournament_phase`),
   one column (`phase_id` on the fixture), one ledger (`team_award`), and a generalisation of the
   `closeGroupStage` → `advanceWinner` pair that already implements "end of phase → promote → the field
   shrinks". `closeGroupStage` *is* a phase close with the phase hard-coded (§5).
5. **Teams, not phases, is where the work is** — and the hard part has now been answered (§10 D4:
   *yes, a team award moves its members' and its cluster's totals, roster-snapshotted*), with a
   requirement the design did not have: **a batch, reversible as a whole** (§5 P7). The mechanism is a
   header row and a flag; the feature is the five readers that must filter on it, which is ADR-159's
   lesson in this repo's own words.
7. **The owner's own word for this was `stage`, not phase** — and taking that literally turned out to be
   the cheaper design too (§13 R1), because `stage` has only three values and the day needs more stages
   than three. Reading the existing `stage` + `round_number` pair as the identity of a stage buys the
   flexibility asked for in D6 without adding a column to anything.
6. **Two things the phasing fixes rather than breaks.** A match started by hand today can silently
   claim a *knockout* fixture (a coin flip the test suite had to be rewritten around,
   `apps/api/src/tests/court-queue.test.ts:191–206`), because `claimFixtureForMatch` does not scope by
   stage or tournament. And a hand-made matchup is invisible to the standings by design —
   `tests/tournament-schedule.test.ts:718` asserts exactly that — which is the lock-in the
   facilitators are describing. Scoping the claim to the current phase, and letting the facilitator
   re-pair *pending fixtures* instead of free-playing pairs, solves both without touching what the
   standings mean (§6).

---

## 2. What a tournament is, as built

Six tables carry the whole thing (`apps/api/src/db/schema.sql`):

| Table | Line | Role | One-line character |
|---|---|---|---|
| `point_config` | 266 | the day's rates | singleton; 5 rates + pacing; **not seeded** (its absence is the bootstrap gate, `AGENTS-database.md` §6) |
| `tournament` | 616 | what was activated | singleton; `format`, `status`, `group_size`, `advance_count`, `knockout_pairing`, `champion_points_snapshot` |
| `tournament_plan` | 653 | what was *intended* | singleton; the same five knobs, editable until activation (ADR-150) |
| `tournament_entry` | 670 | the field | one row per team; `group_code`, `seed`; unique on both `(tournament,team)` and `(tournament,seed)` |
| `tournament_fixture` | 683 | a scheduled matchup | `stage`, `round_number`, `group_code`, `sequence`, two team slots, two **feeder** FKs, `status`, `match_id` UNIQUE |
| `tournament_match` | 305 | what actually happened | court, pair, live score, `winner_team_id`, three JSONB snapshots, `is_voided`, edit-reason triple |

And the flows that matter for this proposal, all verified:

- **A facilitator already has full manual control of matchups.** `POST /api/tournament/matches` takes any
  `{courtId, teamAId, teamBId}` and only *tries* to claim a matching pending fixture — "No fixture found =
  a friendly, not an error" (`db/entities/schedule.ts:246–274` — the function, and its
  own summary line: "No fixture found = a friendly, not an error"). Guards are
  `routes-tournament/index.ts:377–401`.
- **A friendly scores individuals and nothing else.** `computeStandings` reads **fixtures**, filtered
  `stage = 'group'` (`schedule.ts:472–535`), so a match that claimed no fixture moves no table. The
  console says so out loud: `'Friendly — not on the schedule, cluster points only.'`
  (`apps/web/src/routes-facilitator/CourtPage.tsx:153`).
- **A phase close is a human decision, and it is guarded.** `POST /tournament/close-group-stage` refuses
  while `countUnresolvedGroupFixtures > 0` (`routes-superadmin/tournament.ts:142–152`, message
  `groupStageUnresolved`), then `closeGroupStage` ranks qualifiers, writes the whole knockout with its
  feeder links, and flips `tournaments.status` (`schedule.ts:588–642`).
- **Downstream movement is one function.** `advanceWinner` fills every seat a result feeds, moves a
  semi-final *loser* into the third-place match, and — when the fixture is a knockout with no knockout
  successor — completes the day and stamps `champion_points_snapshot` (`schedule.ts:331–360`).
- **Points are derived, never accumulated.** One set-based SQL read composes everything (`db/entities/
  leaderboard.ts:39–172`): match points from each side's *frozen roster snapshot* (ADR-005), the
  champion bonus **derived from the final** precisely so a voided final un-pays it (ADR-136), the
  passport threshold derived (ADR-176), and `score_adjustment` as the human ledger (ADR-117).
  Everything rolls up to **participant**, then to **cluster**. There is no team in that query at all.

The one structural fact to hold onto: **`stage` is not a label, it is behaviour.** Three separate rules
read it — whether a level score may end a match (`packages/contracts/src/matchResult.ts:25`,
`stageCanDraw`), which fixture is "the final" that pays the champion bonus (`leaderboard.ts:113–131`,
`finalStandings.ts:130–135`), and which fixtures the phase-close guard counts (`schedule.ts:567–581`).
Any phase design that stores phases *alongside* `stage` without deciding which one is authoritative
buys a second source of truth for three live rules.

---

## 3. Normalisation assessment

Verdict per finding: **keep** (correct as it is), **fix** (do it regardless of this feature),
**fold in** (do it as part of the phase work).

| # | Finding | Evidence | Verdict |
|---|---|---|---|
| **F1** | Rule 11 compares **table names only**. It regexes `pgTable('x')` against `CREATE TABLE x` and stops; columns, types, nullability, FKs and CHECKs are unexamined. | `scripts/check-standards.mjs:389–450` | **fix** — widen it to a column-name set per table (readable in both files with the same regex approach) |
| **F2** | Drizzle omits the two self-referencing FKs the SQL declares on the fixture. `source_fixture_a_id`/`b_id` have `REFERENCES tournament_fixture (id)` in the DDL and bare `uuid()` in the mapper — so a code path could write a dangling feeder id and TypeScript would not object (the DB still would). | `db/schema/tournament.ts:159–160` vs `schema.sql:697–698` | **fix** (two lines) |
| **F3** | Same drift on the ledger: `score_adjustment.created_by_superadmin_id` is `NOT NULL REFERENCES superadmin_account (id)` in SQL, `.notNull()` with no `.references(...)` in Drizzle. It is the *only* column in that table without a reference. | `db/schema/fringe.ts:90` vs `schema.sql:378` | **fix** (one line) |
| **F4** | The award snapshot's **type** has drifted behind its **value**: `PointsAwardedSnapshot` declares `{winPoints, lossPoints}`, the writer's input type declares all three, the projector reads `drawPoints`, and an old row without it is excused by `coalesce(…, 0)` in SQL. So the shape is enforced by three parties disagreeing politely. | `db/schema/tournament.ts:7–10`, `db/entities/matches.ts:263`, `db/entities/leaderboard.ts:51`, `routes-superadmin/corrections.ts:124–131` | **fix** — add the field (optional, with the coalesce comment), and let `matches.ts` reuse the type instead of restating it |
| **F5** | `fds.md` §2.12 still documents `point_config` as two rates; the table carries five (draw, participation, champion, passport pair, pacing). The FDS is the contract and is **not** to be edited to match the code — the addenda did the widening, and the register rows exist (ADR-116/136/152/176/109). | `fds.md:271–283` vs `schema.sql:266–302` | **keep**, but any phase work must add an addendum for the *new* widening rather than deepen this gap |
| **F6** | `tournament.status` and the fixtures' `stage`s say the same fact ("where are we") in two places, and today one writes the other: `closeGroupStage` sets `status='knockout'` in the same transaction as the fixtures it draws, and `advanceWinner` sets `'completed'` on the last knockout. Single writer, so it cannot drift — but nothing *states* that. | `schedule.ts:638–641`, `:348–352` | **keep** the design, **fold in** the writer rule: if phases arrive, `status` must become a projection of "the phase that is open", never an independent field |
| **F7** | `tournament_fixture.group_code` is transitively determined by `tournament_entry.group_code` for the two teams in the row (third-normal-form violation: fixture → teams → entries → group). | `schema.sql:670–691` | **keep** — it is a *label captured at draw time*, and ADR-149 late entry proves why it must not follow the teams: an entry re-assigned to a roomier group must not re-write fixtures already published to the hall. Name it in the comment as a deliberate snapshot, which FDS-style it is (`AGENTS-database.md` §4, snapshots beat joins) |
| **F8** | `points_for`/`points_against` in the standings are **rally points**, not the leaderboard currency, and there is no "table points" column at all — group ranking runs on wins, draws, head-to-head, point difference, seed. Two different things are called *points*. | `engine.ts:49–66`, `:377–479`, `finalStandings.ts:60–80` | **keep** both meanings, **fix** the vocabulary in new code: `*_points` for the board, `score`/`points_for` for rallies, and the new currency named `award` (see §7) |
| **F9** | `tournament` and `tournament_plan` duplicate five columns. | `schema.sql:616–668` | **keep** — the duplication *is* the ADR-150 decision ("what was activated must not change"; the `mode-edit` assessment is built on exactly this split) |
| **F10** | `champion_points_snapshot` on `tournament` is a special-cased "end-of-phase bonus" with one phase hardcoded, and `has_third_place` + `stage='third_place'` exist partly to keep that special case from firing twice. | `schema.sql:616–640`, `:686–689`, ADR-136/137 | **fold in** — this is the general feature asking to be generalised, and the generalisation *removes* the trick that `third_place` exists to defeat |
| **F11** | The plan's two numeric knobs are bounded **three times, and never the same way twice**: the group-size input claims 3–6 and the advance input 1–2 (`TournamentPage.tsx:88–112`), the plan's CHECKs say `2–8` and `0–4` (`schema.sql:657–658`), and the frozen tournament column says only `>= 0` (`:622`). The client pair enforces nothing — `knobs.change` hands the typed number to `save()` directly (`useAdminTournament.ts:48–52`), and a `type="number"` min/max does not constrain a value that never passes through a form submit — but the **fourth** place does: the wire schema says `groupSize 3–6` and `advanceCount 1–2` (`packages/contracts/src/schemas.ts:874–877`) and refuses ahead of the database. So the plan's wider CHECK ranges are unreachable from the console, and the cap that bites is zod's, not the schema file's. | as above | **fold in** — the stage row is where the bounds belong (§13 R1), and the *first* widening is the zod one, since it refuses before the database ever sees the number; "twelve to a pool, top six through" is legal in `schema.sql` and illegal in `@psd/contracts` |

Two absences worth recording, because their absence is correct rather than an oversight: there is no
`tournament_phase` (hence this document), and no index on `tournament_entry (tournament_id, group_code)`
— `computeStandings` reads every entry for the tournament and groups in memory, which is right for a
field of 8–32 teams and would be premature otherwise.

---

## 4. What the new mode needs that does not exist

| Gap | Today | What it takes |
|---|---|---|
| **G1 — a phase as a thing** | Phases are the `stage` enum plus `round_number`; "phase 1 = the group stage, phase 2..n = knockout rounds" is a reading of the code, not data. A superadmin cannot name a phase, reorder them, or have four of them. | `tournament_phase` table (§5, P1) |
| **G2 — rates that escalate** | `point_config` is a singleton of day-level rates; `requirePoints` reads it once at completion and snapshots it on the match (`routes-tournament/index.ts:363–375`). | rate columns on the phase, nullable = inherit (§5, P2) |
| **G3 — a promotion** | "Who advances" is derived at the one moment it is acted on: `rankQualifiers(standings, advance_count)` inside `closeGroupStage`. Nothing records it, so nothing can *display* it before the bracket exists, and a wildcard is impossible. | keep it derived (ADR-136's argument applies verbatim), add an **override ledger** only (§5, P3) |
| **G4 — team-level points** | Nothing. `team` has no point column, `computeStandings` has no points column, and the leaderboard's `totals` CTE is keyed by participant. A "team total" would today be a *derived sum over its members' frozen roster snapshots*, which changes when rosters change. | `team_award` ledger + a derived team total in the same query (§5, P4) |
| **G5 — bonus points at a phase end** | The champion bonus only, at the last phase only, paid by a CTE that finds "the knockout fixture nothing feeds from". | `promotion_points` on the phase + a CTE keyed on the promotion rule instead of on the final (§5, P3) |

---

## 5. The design

Six changes. Two tables, one column, one generalised function, one scoped query, one surface pair.

> **All ten decisions were answered on 2026-10-12, and the answers change P1, P2, P5 and P7. §13 is
> now the design; §5 below is kept as the reasoning that got there, including the forks that were
> closed. Read §13 before building anything, and read it as the successor to §5 rather than a footnote
> to it — the table names differ.**

### P1 · `tournament_phase` — the phase as data — **superseded by §13 R1**: one axis, keyed on the stage that exists

```sql
-- One row per phase of the day's tournament, in order. `stage` stays where it is, on the
-- fixture: it decides rules (may a match be drawn, which fixture pays the champion bonus) and
-- a phase's semantics must not become a second answer to those questions. Each phase DECLARES
-- which stage its fixtures are, so the two can be checked against each other instead of merged.
CREATE TABLE IF NOT EXISTS tournament_phase (
  id                uuid PRIMARY KEY,
  tournament_id     uuid NOT NULL REFERENCES tournament (id) ON DELETE CASCADE,
  ordinal           integer NOT NULL CHECK (ordinal >= 1),
  label             text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  kind              text NOT NULL CHECK (kind IN ('pool', 'knockout')),
  fixture_stage     text NOT NULL CHECK (fixture_stage IN ('group', 'knockout', 'third_place')),
  -- Promotion: how many go through, and what going through is worth. 0 and NULL mean
  -- "nothing happens at the end of this phase", which is how a day stays un-phased.
  promote_count     integer NOT NULL DEFAULT 0 CHECK (promote_count >= 0),
  promotion_points  integer CHECK (promotion_points IS NULL OR promotion_points >= 0),
  -- G2, the escalating stakes. NULL = inherit point_config, so an unphased day and a phased one
  -- read the same rates unless somebody types over them.
  win_points        integer CHECK (win_points IS NULL OR win_points >= 0),
  loss_points       integer CHECK (loss_points IS NULL OR loss_points >= 0),
  draw_points       integer CHECK (draw_points IS NULL OR draw_points >= 0),
  is_current        boolean NOT NULL DEFAULT false,
  closed_at         timestamptz,
  closed_by_superadmin_id uuid REFERENCES superadmin_account (id),
  close_reason      text CHECK (close_reason IS NULL OR length(close_reason) BETWEEN 1 AND 200),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, ordinal),
  -- CHECK ((closed_at IS NULL) = is_current) — which is what this section proposed, and what the
  -- implementation now reads `CHECK (is_current = false OR closed_at IS NULL)` instead. The biconditional
  -- has no way to say "the next stage, not started yet": a seeded knockout row is neither current nor
  -- closed, and the first world-cup activation refused it. One contradiction is the real invariant —
  -- open and closed at once — and the partial unique index below is what makes "one open" true.
  CHECK (is_current = false OR closed_at IS NULL),
  CHECK (closed_at IS NULL OR closed_by_superadmin_id IS NOT NULL)
);
-- The repo's own device for "exactly one, for now": the same partial unique index that makes
-- one live match per court impossible to violate (`schema.sql:337–338`).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_phase_one_open
  ON tournament_phase (tournament_id) WHERE is_current;
```

No `is_active`/soft-delete column: closing is a *fact with a timestamp*, and `agenda_item`'s
`is_active` idiom (`schema.sql:732–745`) is for things that get un-cancelled by the weather — a phase
is not a schedule line somebody can be standing in. A phase
that is re-opened is a `closed_at = null` write with a reason, and the audit trail is the point.

### P2 · `phase_id` on the fixture — one column — **superseded by §13 R1**: no new column on the fixture

```sql
ALTER TABLE tournament_fixture ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES tournament_phase (id);
```

Nullable, and that is a deliberate departure from my own instinct: NOT NULL would need a backfill
(`UPDATE … SET phase_id = <synthesised phase 1>` per existing tournament) inside the additive section,
which is where ADR-168's "adds, never alters" rule has already had to make two documented exceptions
(ADR-173's dropped-and-re-added CHECK, ADR-203's `SET DEFAULT`). A third is possible but it is not
free, and NULL here has an honest meaning the code can use: *"a fixture from before phases"*. Then:

- `computeStandings` / `groupResults` gain a phase parameter and keep working when it is null;
- the phase-close guard counts `phase_id = $1` when phases exist, `stage = 'group'` when they do not;
- `requirePoints` resolves rates as `phase.win_points ?? config.tournament_win_points` per side.

That last item is the whole of G2: **one `??` at one call site**, because the snapshot column on the
match already carries whatever was in force (`points_awarded_snapshot`), which is why per-phase rates
can be added without any migration of history.

### P3 · promotions stay derived; only the *exception* is stored

The champion bonus is derived rather than written into the ledger for a reason worth quoting, because it
applies exactly to promotions:

> A stored bonus would survive the void of the final it was paid for … the ledger it would have been
> stored in is ADR-117's record of HUMAN decisions — a machine award in there corrupts what the ledger
> means. — `db/entities/leaderboard.ts:104–108`

So: no `tournament_promotion` table for the automatic case. Promotion for any phase is
`rankQualifiers(phaseStandings, phase.promote_count)`, which already exists and already handles the
degenerate cases (ADR-089's `< 2` path in `closeGroupStage`, `schedule.ts:592–602`). The phase-end bonus
is then a second CTE in the same query as `champion_points`, reading the *closed* phases with
`promotion_points IS NOT NULL` — same shape, one more predicate. A day that wants the bonus off sets it
to NULL; a day that wants it on types a number. Both are inert until touched, which is how ADR-136 and
ADR-176 both chose to behave (`champion_points` defaults to 0 "so an existing dump behaves exactly as it
did").

What *is* stored is the human exception, because a wildcard is a decision, not a derivation:

```sql
-- A superadmin's override of who advances: a team put in that the table did not qualify, or left
-- out that it did. Append-only, exactly like score_adjustment (ADR-117), and for the same reason:
-- a corrected decision is answered by an opposite entry, never by an UPDATE, so the register shows
-- what was decided and when.
CREATE TABLE IF NOT EXISTS tournament_promotion_override (
  id             uuid PRIMARY KEY,
  phase_id       uuid NOT NULL REFERENCES tournament_phase (id) ON DELETE CASCADE,
  team_id        uuid NOT NULL REFERENCES team (id),
  is_withdrawn   boolean NOT NULL DEFAULT false,   -- 'in' by default; a withdrawal is the opposite sign
  reason         text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  created_by_superadmin_id uuid NOT NULL REFERENCES superadmin_account (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (reason <> '')
);
```

Promoted set = `derived ∪ additions − withdrawals`. It is a *set*, so it is idempotent under a re-read
and needs no compensating write when a result is corrected — the void-the-final case that ADR-136 was
built to survive keeps working, with the override rows untouched.

### P4 · `team_award` — the ledger the new surface writes, and the only new currency in the system

```sql
CREATE TABLE IF NOT EXISTS team_award (
  id              uuid PRIMARY KEY,
  team_id         uuid NOT NULL REFERENCES team (id),
  phase_id        uuid REFERENCES tournament_phase (id),   -- NULL: not tied to a phase
  points          integer NOT NULL CHECK (points <> 0 AND points BETWEEN -100 AND 100),
  reason          text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  -- ADR-005, applied to a new event: who was ON the team when this was paid, so the money does not
  -- move when the roster does. `label` names what it was for, snapshot style, like
  -- score_adjustment.activity_name_snapshot (schema.sql:369–379).
  roster_snapshot jsonb NOT NULL,
  label           text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  created_by_superadmin_id uuid NOT NULL REFERENCES superadmin_account (id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_team_award_team ON team_award (team_id);
```

Same bounds and same shape as `score_adjustment`, deliberately: it *is* the same object with a different
subject, and a reader who knows one knows the other. Two decisions embedded here, both with a reason:

- **`points` is signed and non-zero** (ADR-117's rule: "an adjustment of nothing is not a correction, it
  is noise in the ledger"). A team bonus is paid with `+12`; a mistake is answered with `-12`.
- **the award pays the team *and* its members**, because the cluster board is what three hundred people
  watch, and a team total that does not reach it would mean two answers to "how many points does
  Sandstorm have". The `roster_snapshot` makes that safe under roster churn. This was the one place
  where the assessment had to choose for the user rather than read their words — "points to teams" could
  have meant *team-only* — and **the owner has since answered it: yes, members and clusters move with
  it** (§10 D4). Their answer also brought §5 P7, which is where the batch requirement now lives.

### P5 · `closePhase` replaces `closeGroupStage`, and the pairing operation is the point — **revised by §13 R3**: parameterised by stage row, and the constraints become confirmations

`closeGroupStage(tournament)` becomes `closePhase(db, phase)`, with three differences:

1. it counts *this phase's* unresolved fixtures (with `phase_id IS NULL` falling back to the today
   predicate, so an unphased day behaves identically);
2. it draws the **next** phase from the promotion set rather than assuming "knockout bracket of
   `advance_count × groups`" — `knockoutDrafts(qualifiers, pairing)` stays as what happens when the next
   phase is `kind = 'knockout'`, and a `pool` next phase re-uses `groupFixtureDrafts` on the promoted
   field. Both generators already exist and are pure (`lib/tournament/engine.ts:110–124`, `:217–249`);
3. it stamps `closed_at`, `closed_by_superadmin_id`, `close_reason` and flips `is_current` on the new
   phase — **in the same transaction**, which is what makes the "exactly one open phase" index usable.

`champion_points_snapshot` then stops being a special case: the *last* phase's `promotion_points` is the
champion bonus, and `has_third_place` / `stage='third_place'` become expressible as a phase (its whole
purpose in ADR-137 was to keep the bonus predicate from double-paying — a problem that dissolves when
the bonus hangs off a phase rather than off "the fixture nothing feeds from"). Retiring those two is
optional and can lag a release; nothing breaks if they stay and the phase rows agree with them.

### P6 · the facilitator's lever: re-pair, don't free-play

The instinct — "let facilitators start any match and have it count" — runs straight into the FDS's own
sentence: *"fixtures live beside it, never inside it"* (`fds.md:178–182`). Making the match the unit of
the standings would move the truth into the table with the least structure on it and no phase, and would
break F7's label, the court queue's projections and ADR-152's draw rule at once.

The cheap, coherent version is to let the *pending fixtures* be re-paired, which is all "manual control
over matchups" needs to be while a phase is open:

- `POST /api/tournament/phases/:id/fixtures` — add a pairing to the open phase (writes a pending fixture
  with `sequence = nextSequence`, `stage = phase.fixture_stage`);
- `POST /api/tournament/fixtures/:id/swap` with `{otherFixtureId}` — **one statement pair**, both guarded
  `status = 'pending'`, both or neither (the same all-or-nothing discipline `releaseFixtureOfMatch` and
  `claimFixtureForMatch` already use). Swapping *slots* rather than re-writing teams keeps `sequence`,
  `stage` and the feeder links intact, so a bracket cannot be mis-wired from the console;
- the existing `walkover` and `skip` (routes-superadmin/tournament.ts:221–250) stay the "this match will
  not happen" tools, and now apply per phase;
- **and** `claimFixtureForMatch` gains `AND fixture.phase_id = <the open phase>` (or `stage = ...` while
  phases are absent). That single predicate closes the coin-flip §1 point 5 describes: today a friendly can consume a
  knockout fixture of the same unordered pair, because the query filters only on
  `status = 'pending'` and pair (`schedule.ts:254–274`).

With those, a facilitator who decides at 3:40pm that Sandstorm should play Typhoon instead of Monsoon
gets a *scheduled, standings-counting, close-guard-passing* match, and the phase closes on time.

### P7 · batches — one decision, posted once, reversed as a whole — **revised by §13 R4**: shared header, no duplicate guard, no per-row note

The owner's answer to §10 D4 was *yes, and the rosters move with it*, with one addition: awards are
handed out in batches, and a batch has to be undoable. That is a real requirement, and there is an
uncomfortable precedent for what happens when it is implemented as a column:

> **The flag was the easy half.** What makes this a feature rather than a column is that
> `createSwagClaim`'s allowance count now carries `NOT is_voided`.
> — ADR-159, `docs/addenda/ADDENDA.md:6612`

An `is_reversed` boolean nobody filters on is a checkbox that lies. So the header below is small, and
the *reader audit* is the work.

```sql
-- The unit of decision. Rows stay append-only (ADR-117 keeps that property for the ledger itself); it
-- is the BATCH that can be reversed, because "the 3:40pm promotion award" is the thing a human would
-- want to take back, not one line of it.
CREATE TABLE IF NOT EXISTS team_award_batch (
  id                uuid PRIMARY KEY,
  -- ADR-009's client key, the idiom the offline scan queue already relies on
  -- (`fringe_scan.client_scan_uuid uuid NOT NULL UNIQUE`, `schema.sql:194`), minted the same way --
  -- the console already does this for scans (`apps/web/src/lib/hooks/useFringeStation.ts:83`). It
  -- buys a retry-safe POST, which is the only genuinely new failure a multi-row write introduces: a
  -- timeout after twenty inserts is not something a second tap should double.
  client_batch_uuid uuid NOT NULL UNIQUE,
  phase_id          uuid REFERENCES tournament_phase (id),
  label             text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  reason            text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  created_by_superadmin_id uuid NOT NULL REFERENCES superadmin_account (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Reversible like a void, never deleted. `reversed_reason` is required by the route rather than by a
  -- CHECK, so the message can name the batch -- the same division `edit_reason` uses on a match.
  is_reversed       boolean NOT NULL DEFAULT false,
  reversed_at       timestamptz,
  reversed_by_superadmin_id uuid REFERENCES superadmin_account (id),
  CHECK (is_reversed = (reversed_at IS NOT NULL))
);

ALTER TABLE team_award ADD COLUMN IF NOT EXISTS batch_id uuid NOT NULL REFERENCES team_award_batch (id);
```

**Three outcomes, copied from the scan write path — and the reason it has three.** `createScan`
distinguishes `created` / `retry` / `conflict`, and ADR-116 exists because `conflict` used to be folded
into `retry`: "scan someone for turning up, then try to award them first place, and the placing vanished
with a success response" (`db/entities/scans.ts:55–88`). A batch route that answers 200 over a swallowed
row is that bug at twenty times the scale.

| Outcome | When | Response |
|---|---|---|
| `created` | new `client_batch_uuid`, every row valid, no team duplicated | 201 with the batch and its rows |
| `retry` | the same `client_batch_uuid` arrives again | 200 with the **existing** batch — "a success with nothing to do", the wording `routes-tournament/index.ts:279–282` uses for a thumb that bounced |
| `conflict` | a team appears twice in the payload, or already holds an un-reversed award for this `(phase_id, label)` | 400 naming the team and the award that holds the slot |

**One transaction, for the reason the scan code already states.** `replaceScan` voids and re-inserts in
one transaction because "a void that lands without its replacement would silently cost the participant
their points" (`db/entities/scans.ts:90–97`). Half a batch is the same accident with more victims: it
pays eight promoted teams and not the ninth.

**The reader audit, which is the feature.** Every place that counts awards must carry
`NOT b.is_reversed`, and each miss is its own bug:

| Reader | File | What a miss looks like |
|---|---|---|
| the leaderboard's award CTE | `db/entities/leaderboard.ts` (the new `team_award` CTE, beside `adjustment_points`) | the board keeps the points after the reversal — ADR-159's failure, verbatim |
| the team total, and the day's export | `apps/api/src/views/tournament.ts` `standingsGroupView`, `lib/finalStandings.ts` | the printed record of the day disagrees with the live board |
| the duplicate guard on the POST | `routes-superadmin/awards.ts` (new) | a reversed batch's teams cannot be re-awarded, so the reversal has *destroyed* the chance to correct it properly |
| the batch list, and the team's ledger | new read, mirroring `listAdjustmentsForParticipant` (`db/entities/adjustments.ts:69–78`) | a reversed batch rendered as though live |

Reversal is `UPDATE team_award_batch SET is_reversed = true, reversed_at = now(), reversed_by_… = $1
WHERE id = $2 AND is_reversed = false` — status-guarded, the same race-safe single statement
`releaseFixtureOfMatch` uses — then `invalidateTag(SCOREBOARD_TAG)` and one `void_audit_entry` row.
Re-applying is the mirror image; ADR-159's unvoid is the precedent for both directions existing.

**Two things the batch deliberately does not do.**

- **It does not swallow the automatic promotion bonus.** Those points stay derived (§5 P3), because a
  derived bonus *should* vanish when the result that earned it is voided; a batch row would survive it,
  which is exactly what ADR-136 refused to build. Nothing to roll back, then — the knob for the
  automatic award is the phase's `promotion_points`, edited with a reason like any other config.
- **It is not an edit affordance.** Correcting one wrong row inside a posted batch is a one-row
  counter-award (`points` is signed for this reason, ADR-117), not an UPDATE and not a per-row flag.
  Rows have no void; the header does. That split is what lets the ledger keep meaning "what was decided"
  while the header means "what still counts".

**And one consequence easy to miss.** `void_audit_entry.target_type` is an inline CHECK
(`schema.sql:386`), so widening it to take a batch value — a **fourth** entry in that list
(`fringescan`, `tournamentmatch`, `swagclaim`), the last added being ADR-159's `swagclaim` — will not reach a database that already has the table. It needs the
drop-and-re-add pair in the additive section (ADR-173's precedent), or the reverse button works on a
fresh database and 500s on the demo one.

---

---

## 6. Reads, wire, and screens

| Surface | Change | Cost |
|---|---|---|
| `GET /api/tournament/bracket` (ADR-150) | `TournamentBracketView` gains `phases: [{ordinal,label,kind,status,promoteCount,promotionPoints,groups,rounds}]`; today's `groups` + `rounds` become the *open phase's* pair. One client, one export, so no compatibility shape is needed — but ADR-161's spreadsheet (`lib/finalStandings.ts`) should grow a phase column, or the printed record loses the thing the day turned on. | M |
| `fixtureView`, `matchView` (`apps/api/src/views/tournament.ts`) | `phaseId`, `phaseLabel` on the fixture; `phaseLabel` on the match, replacing the `stage` the console uses for its friendly/scheduled line and for draw legality. `stage` stays as a *derived* field so `stageCanDraw` and the court console need no change. | S |
| S22–S24 court console | the pair picker gains "this phase's pending fixtures first" (already the behaviour via `upNext`) + a swap button. `CourtPage.tsx:148–153` copy changes only for the label. | M |
| **New S61 · Phases** (`/admin/tournament`, a section of the existing `TournamentPage.tsx`) | list of phases with `label`, `kind`, `promote_count`, the four rate fields, `promotion_points`, the Close-phase button (with reason), and the `+ Add phase` control. `TournamentPage.tsx` is already 538 lines, and `max-lines-per-function: 50` means this lands as an extracted panel (`PhaseRowsPanel.tsx`) rather than more JSX in it. | M |
| **New S62 · Team awards** (`/admin/team-awards`) | the same shape as the participant adjustment UI (`routes-superadmin/directory.ts:131–149` + `ParticipantDetailPage.tsx`): team picker, signed points, reason, label, and the ledger below. Plus the derived team total in the standings read. | M |
| Hall screen | one section per phase instead of "groups, then the road to the final". ADR-141's rule-14 constraint (no controls on the hall screen) is untouched — this is a read. | S |
| **S62, as built** · the award batch | rows composed in the panel (team, points, label; reason and label at batch level, per-row note optional), a preview that says "12 teams, +12 each, Phase 2 promotion", then Post; below it the batch list with Reverse / Re-apply and each batch's rows. `MatchesPage.tsx` (285 lines) is the shape, `useFringeStation`'s key minting the retry idiom. | M |
| `messages.ts` | 3 new strings (phase-has-unresolved, phase-not-open, award-needs-team); `groupStageUnresolved` generalises in place, its wording already lists the three remedies (`messages.ts:121`). | S |

`fds.md` is **not** edited by this plan: phases, promotions and team awards are addendum territory (five
of the six tournament tables already are), so the change carries **ADR-245 (phases as data, `stage` as
the rule), ADR-246 (per-phase rates inherited at the award site, snapshotted per match), ADR-247
(team awards: a second subject for one currency, roster-snapshotted)** plus supersession rows for the
two places an earlier ADR's sentence gets narrower — ADR-136's champion bonus and ADR-137's
`third_place` stage, both *in part*: the derivations stay, the special-casing goes.

---

## 7. Cost, and the order to build it in

Sized against the two precedents this pattern follows: ADR-092's tiered rewards ("~480 production LOC +
~340 test LOC across ~20 files", `tiered-rewards-assessment.md` §4) and ADR-089's scheduling work, which
this is smaller than. All numbers below are **estimates**, basis stated.

| Stage | Content | Estimate |
|---|---|---|
| 0 | the three drift fixes F1–F4 + widening rule 11 to columns, with a sabotage case per rule change (the repo's own bar: "a rule that has never failed is not trusted") | ~90 LOC + ~60 test |
| 1 | P1 + P2 (tables, `phase_id`, Drizzle mirror, `ADD COLUMN` line), `activateTournament` writes phase 1, `closePhase` generalises `closeGroupStage`; API tests per `AGENTS-testing.md` (positive + session-scoping negative for each new route) | ~260 LOC + ~220 test |
| 2 | P6: fixture add/swap endpoints + claim scoping; the two tests that pin the coin-flip get re-asserted against the phase predicate | ~150 LOC + ~120 test |
| 3 | P3 + P4: override ledger, `team_award`, the two new CTEs in `leaderboard.ts`, `readTeamTotals` | ~200 LOC + ~180 test |
| 4 | S61 + S62 + the bracket/hall view + ADR-161 export column | ~330 LOC + ~150 test |
| 5 | P7: the batch header, `client_batch_uuid`, the three outcomes, reverse/re-apply, the void-audit widening **plus the reader audit and a test per reader** | ~190 LOC + ~150 test |

**≈ 1,220 production LOC + ≈ 880 test LOC over ~27 files** — call it **7–9 dev-days** (estimate; the
ratio to ADR-092 is 2.6×, and the extra is the leaderboard CTEs, the `closePhase` rewrite and the
reversal reader-audit, all of which sit on top of existing tests — 73 in `tournament-schedule.test.ts`
alone — that must keep passing untouched while a null `phase_id` means "the old way"). Stage 5 is the
only stage whose *test* count nearly matches its LOC, and that is the point: the flag is cheap, the
readers are the feature.

**These numbers are the §5 design. §13's revised design sizes itself again at the end of that section:
≈1,300 production + ≈970 test LOC over ~30 files, 8–10 dev-days** — the phase table came out and roughly
that much went back in, because `pays_standings` edits the standings predicate, which is the highest-risk
line in the file, and because a shared batch header means one panel writing two ledgers.

Stages 1–2 leave every existing day behaving exactly as it does now: a tournament with one phase row is
the same machine with one extra row read. That is the property to protect, and it is worth a deliberate
test per stage rather than an assertion in prose: *an unphased tournament produces byte-identical
standings, bracket JSON and export to the same seeded field.*

---

## 8. Risks, in order of seriousness

| Risk | Assessment |
|---|---|
| **Competitive integrity, squared.** The `mode-edit` assessment's first risk — a team that qualified under one bar being eliminated by an edit made after they stopped trying — applies more strongly when the *promotion rule* is editable and a bonus rides on it. | Procedural, and the mitigation is the same one that doc proposed and the schema already carries: edit only while the phase is open, show the delta ("this promotes 3, not 2") before saving, require a reason, and let `close_reason` + `override.reason` be the audit. Rates for a phase must be frozen when the phase opens (write them on the phase row, never read live mid-phase) — which the per-match snapshot then makes harmless. |
| A phase with `promote_count > field size`, or 1 qualifier into a knockout | `closeGroupStage` already refuses `< 2` qualifiers by *completing the day* — a real path to reach by accident via a phase edit. Validate `1 ≤ promote_count ≤ min(pool size)` at the write, with the message naming the pool sizes. |
| Two phases, one open | The partial unique index makes it impossible rather than improbable — but only if `is_current` flips inside `closePhase`'s transaction. A test that closes a phase while forcing the old flag to stay set must fail; that is the sabotage case for P5. |
| Roster churn under a team award | The `roster_snapshot` on `team_award` is exactly what `points_awarded_snapshot` + `team_*_roster_snapshot` do for matches (ADR-005). Without it, a transfer mid-day would move an award retroactively onto a new team member's cluster. |
| The derived team total joins on a JSONB array, like the two existing CTEs | It is the third `jsonb_array_elements` in that query. It costs readability at the CTE list's end and it will need its own test for the "roster snapshot missing" case (`leaderboard.ts:59` and `:71` guard it with `IS NOT NULL`). Accepted: the alternative — a `team_points` table maintained by writes — is precisely what ADR-006 was written to forbid. |
| Coverage gates | The api thresholds are 98 / 98.9 / 94.6 / 98 (`AGENTS-testing.md`-adjacent, recorded in the supersession index) and `leaderboard.ts`'s new branches are un-forgiving: every `??` and `coalesce` arm needs a test. Stage 3's 180 test LOC is sized for it, not for the endpoints. |
| `docs` and messages drift | Three error strings and one FDS-adjacent wording change; rule 9 (`messages.ts`) means the strings must live in `@psd/contracts` and be *identical*, so the web copy is a compile-time coupling, not a grep. |

---

## 9. Explicitly out of scope

- **More than one tournament at a time.** `tournament` is a singleton by unique index and five readers
  assume `findActiveTournament` returns *the* one. Phases are children of `tournament_id` so the day this
  is needed is a schema-only change, but nothing here should be built *for* it.
- **Storing promotion or bonus rows** — §5 P3's argument; it also means no compensating-write logic,
  which is the larger share of the complexity saved.
- **Making unscheduled matches count in the standings.** It contradicts `fds.md` §2.6's "fixtures live
  beside it", and P6 gives the facilitator the same practical power with the guardrails intact.
- **Auto-scheduling across phases** (court assignment, rest fairness). `planCourtDispatch` /
  `estimateStartTimes` (ADR-108/111/191) are per-fixture and phase-agnostic already.
- **A `points` column in the group table.** The table ranks on records and head-to-head (ADR-106/115/152);
  adding a points currency there would invite a second ranking rule and a second tiebreak argument.
- **Re-opening a closed phase** as a UI verb. The transaction can do it (null the `closed_at`, clear the
  next phase); the *operator* shouldn't, on a day with a hall screen watching. If it proves necessary it
  is its own ADR.

---

## 10. Decisions needed before building — each with a default, so a silence is a yes

1. ~~Do phases replace `stage`, or sit beside it?~~ **Answered: neither — `stage` *is* the phase.**
   "I might have misspoken, I used phases because I didn't know the word stage; they are effectively
   interchangeable, we can use stage as it is and not 'replace it'." That closed the fork harder than
   either branch of this question: §13 R1 keys a stage row on the existing `stage` + `round_number` pair,
   so there is no second axis and no declaration to keep in agreement. *Original default: beside it* — the phase declares which
   `fixture_stage` it writes, and a test pins that a fixture's `stage` always equals its phase's
   declaration. Replacing it means re-writing `stageCanDraw`, two champion-bonus predicates and the FDS
   sentence about draw legality, for a cleaner model that behaves identically. This is the plan's single
   biggest fork; everything else survives either answer.
2. ~~`phase_id` nullable, or NOT NULL with a backfill?~~ **Answered with D1: there is no
   `phase_id`** — a fixture belongs to a stage row by the `(stage, round_number)` it already carries, so
   the column and its backfill question both disappear (§13 R1).
3. ~~Do per-phase rates inherit or override?~~ **Answered: "default is good, NULL = inherit."**
   *Original default: inherit from `point_config` when NULL*, so one
   number to set for a simple day and a per-phase override when somebody needs escalation.
4. ~~Does a team award move individuals' and clusters' totals?~~ **Answered 2026-10-12: yes** —
   roster-snapshotted, so members and cluster move together. The answer came with a requirement the
   plan had not had: *the only complicated thing is we need some mechanism to track adjustments that
   are given in a batch in case they need to be rolled back* — which is §5 P7, and D7–D10 below.
5. **Automatic promotion bonus on or off?** **Answered: "Default off, yes, but we also need this
   promotion bonus to be definable based on stage id"** — which is where the bonus lives in the revised
   design: `promotion_points` on the stage row, NULL = off (§13 R5). *Original default: off (NULL)*, exactly as ADR-136 defaulted the
   champion bonus to 0 and ADR-176 the passport to 0: "the day's organiser turns it on deliberately
   rather than discovering it in the standings". The mechanism and the surface are identical either way,
   which is what makes this a config line rather than a fork.
6. **Number of phases, and can a pool phase follow a knockout phase?** **Answered: "in manual mode we
   don't have any hard constraints, unless you can propose an implementation where we both have
   flexibility considering our use case during field conditions"** — the answer is §13 R1 + R3: rounds are
   unbounded integers, so the ceiling of six disappears without touching `MatchStage`, and every guard
   that would have blocked an organiser instead becomes a confirmation with a reason. *Original default:
   up to 6 rows, any kind in any order* — `closePhase` already tolerates both generators, and a limit is a guard clause nobody
   asked for. Re-pairing inside a *closed* phase stays refused.
7. ~~Does reversing a batch restore the option to award those teams again?~~ **Answered: "Yes. There
   should be no constraints, we can even award multiple times if the superadmin needs to"** — which is
   stronger than the question: the duplicate guard is deleted outright, not merely reversed-aware (§13 R4). — the
   duplicate guard counts un-reversed awards only. Refusing to re-post after a reversal would mean the
   rollback destroys the correction.
8. **Reason at the batch or at the row?** **Answered: "Reason at the batch, no per-row note (too much
   complexity)"** — so `team_award` has no note column at all. *Original default: batch-level label +
   reason, per-row note optional.* Twenty promoted teams should not require twenty copies of one sentence — and a one-row
   batch then reads exactly as the counter-entry ADR-117 prescribes.
9. **Is the batch header shared with the participant ledger?** **Answered: "shared, don't need
   segregation for something like this"** — implemented as one header over the two existing ledgers rather
   than one merged ledger (§13 R4). *Original default: yes — one header table,
   referenced by both `team_award` and `score_adjustment`* (the latter gains a nullable `batch_id`,
   ~20 LOC). The act at the desk is one decision that pays two kinds of subject; two header tables
   would leave the operator remembering which ledger a rollback lives in. Team-only headers are cheaper
   now and cost a second, parallel feature later.
10. **Who mints `client_batch_uuid`?** **Answered: "the console."** *Original default: the console*, as the station already mints
    `client_scan_uuid` (`useFringeStation.ts:83`). Server-minted, it cannot dedupe the retry it exists
    to survive: a second tap gets a second id and a second batch.

---

## 11. The whole list, for one pass

**Answered in full on 2026-10-12 — none of these defaults is live any more.** The table stays as the
record of what was asked and what each fork cost, because §13 reads better beside it than as a rewrite of
it. Two of the answers (D1, D2) were a third option neither branch offered, and — contra the last clause
below — the answer to D1 did change the shape of the schema, by removing a table and a column and putting
the stage's own row in their place.

Ten decisions: six the assessment raised, four the batch requirement created. Each with the default a
silence accepts, and what the other branch costs. Nothing here blocks anything else — all ten are
answerable from the description alone, and D1 is the only one that changes the shape of the schema.

| # | Question | Default if silent | What the other branch costs |
|---|---|---|---|
| D1 | Do phases replace `fixture.stage`, or sit beside it? | **Beside it** — the phase declares the stage its fixtures write, and one test pins that they agree | Replacing it touches `stageCanDraw`, both champion-bonus predicates and the FDS sentence on draw legality: a cleaner model, ~120 LOC of re-plumbing, and a wider blast radius across the 73 existing tests |
| D2 | `phase_id` nullable, or NOT NULL with a backfill? | **Nullable** — NULL means "a fixture from before phases" | NOT NULL needs a third non-additive statement in the ADR-168 section plus a backfill; the file's own convention has allowed that twice (ADR-173, ADR-203) |
| D3 | Per-phase rates: inherit or override? | **`NULL` = inherit `point_config`** | Rates-typed-everywhere means twelve numbers before a day can run, and an un-phased day needs a migration story it does not have |
| ~~D4~~ | ~~Does a team award move members and clusters?~~ | **Answered: yes**, roster-snapshotted | Team-only is ~60 LOC cheaper and leaves two answers to "how many points does Sandstorm have" |
| D5 | Automatic promotion bonus on or off? | **Off** (`promotion_points` NULL), per ADR-136/176's inert-default rule | On-by-default hands a day a bonus nobody chose, discovered on the board mid-afternoon |
| D6 | How many phases, and can a pool follow a knockout? | **Up to 6, any order** | A hard two-phase limit is a guard clause nobody asked for, and it is the first thing a real draw breaks |
| D7 | Does a reversal free the teams to be awarded again? | **Yes** — the duplicate guard counts un-reversed awards only | No means the rollback destroys the correction, which is ADR-159's complaint about immutability at a table with a queue |
| D8 | Reason per batch, or per row? | **Per batch**, optional note per row | Per-row reasons: twenty identical sentences or one lazy one, and the ledger's meaning thins |
| D9 | One batch header shared with the participant ledger, or team-only? | **Shared** — one header, both ledgers reference it, `score_adjustment.batch_id` nullable | Team-only is ~20 LOC cheaper now and needs a second, parallel rollback surface the first time the rain costs the day something |
| D10 | Who mints `client_batch_uuid`? | **The console** | Server-minted cannot dedupe its own retry: a second tap becomes a second batch |

---

## 12. What I did not check

- I read the schema, the six tournament/points modules and the routes above, and ran
  `npx vitest run --root apps/api src/tests/tournament-schedule.test.ts` → **73 passed** (13.5 s) on
  this tree. I did **not** run the full API or web suites, `./verify.sh`, or any e2e spec, so "existing
  tests keep passing" is a design goal in §7, not a measured baseline for the change.
- The LOC and day figures in §7 are estimates with a stated basis (the ADR-092 and ADR-089 precedents);
  the "2.2×" ratio is arithmetic on those two documents, not a measurement of this work.
- No claim here about *how a phase day should be run* — how many phases, what they are called, what the
  bonus is worth — is anything but the defaults in §10. The FDS is silent on all of it, which is why
  this lands as addenda.
- For P7 I read the scan write path, the gallery and screen-key dedupe precedents, and ADR-159. I have
  since confirmed the thing D10 rests on — `knobs.change` hands a typed number straight to `save()`
  (`apps/web/src/lib/hooks/useAdminTournament.ts:48–52`), so the console posts without any form-level
  validation, which is why `client_batch_uuid` is load-bearing rather than belt-and-braces. What I have
  **not** read is the fetch wrapper's retry behaviour on a 5xx, so "a retry lands as `retry`, not as a
  second batch" is argued from the key's uniqueness and not from the transport.
- The §13 revision has been checked against the code it cites — `countUnresolvedGroupFixtures`
  (`schedule.ts:566–581`), the `qualifiers.length < 2` branch (`:592–602`), the close route's hard
  `conflict` (`routes-superadmin/tournament.ts:142–149`), `stage='group'` in both standings queries
  (`:520`, `:577`), the snapshot reads (`leaderboard.ts:51`, `:59`, `:63`, `:71`), the round numbering
  (`engine.ts:117`, `:228–238`), the plan's bounds (`schema.sql:657–658`, `:666`) — but it has **not**
  been prototyped: no migration has been run against a real database, so the two claims that a
  `CREATE TABLE` plus three `CREATE INDEX` statements are the entire schema footprint, and that the
  resolver's `NULLS LAST` ordering is the shortest correct form of it, are still reasoning.
- I have not modelled the scheduling arithmetic for a *pool-after-pool* day (matches per phase × courts
  vs the 4.30pm boundary the `mode-edit` assessment measured at §"the missing remedy"). If phased
  formats are adopted, that projection is the next thing to measure, and `estimateStartTimes` is
  already phase-agnostic enough to answer it.

---

## 13. Decisions taken (2026-10-12) — the revised design

All ten are answered. Six of the answers simplify the plan; two of them — "use `stage` as it is" and "no
hard constraints" — turn out to require one thing the §5 design had not anticipated, and that is R2.

### R1 · a stage row is `(stage, round_number)`, and it carries what the stage cannot

Taking the owner's correction literally — one axis, `stage` stays as it is, nothing is replaced — runs
into a fact about the column: `MatchStage` is **three values**, `'group' | 'knockout' | 'third_place'`
(`packages/contracts/src/wire.ts:345`, mirroring the fixture's CHECK at `schema.sql:690`). Quarter-finals,
semi-finals and the final are all `'knockout'`, told apart only by `tournament_fixture.round_number`
(`engine.ts:117` numbers the pool rounds, `:228–238` the knockout ones). So
"a row per stage kind" gives a day three stages, and "win points increase as the phases progress" has
nothing to increase on.

The fix is not a second axis; it is to key the row on **the pair the fixture already holds**:

```sql
-- One row per stage of the day. `stage` is not replaced or shadowed: it stays the behaviour switch that
-- decides draw legality (`schedule.ts:318`, ADR-152) and the champion bonus (`leaderboard.ts:113–131`,
-- ADR-136/137). What the row carries is the day's *arrangement* of those three kinds — how many there
-- are, what each pays, how many go through, and whether it is over.
CREATE TABLE IF NOT EXISTS tournament_stage (
  id                uuid PRIMARY KEY,
  tournament_id     uuid NOT NULL REFERENCES tournament (id) ON DELETE CASCADE,
  -- MatchStage, verbatim. Not a new vocabulary, and deliberately no new value either: an extra kind is
  -- a wire change (contracts + stageCanDraw + the FDS sentence), and it stays available as the escape
  -- hatch if a day ever needs a stage that is not a pool, a knockout round or the third-place play-off.
  kind              text NOT NULL CHECK (kind IN ('group', 'knockout', 'third_place')),
  -- NULL means "every round of this kind"; a number means that round only. Group play already numbers
  -- its rounds (engine.ts:117), which is what lets "the three pool rounds, then the quarters" be three
  -- rows and one row without inventing anything.
  round_number      integer CHECK (round_number IS NULL OR round_number >= 1),
  label             text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  ordinal           integer NOT NULL CHECK (ordinal >= 1),
  promote_count     integer NOT NULL DEFAULT 0 CHECK (promote_count >= 0),
  -- R5. NULL = off, which is what the owner confirmed.
  promotion_points  integer CHECK (promotion_points IS NULL OR promotion_points >= 0),
  -- D3/§10-3. NULL = inherit `point_config`, so an un-staged day and a staged one read the same rates.
  win_points        integer CHECK (win_points IS NULL OR win_points >= 0),
  loss_points       integer CHECK (loss_points IS NULL OR loss_points >= 0),
  draw_points       integer CHECK (draw_points IS NULL OR draw_points >= 0),
  -- R2, the one column that is not in the §5 design: does a result in this stage move the table?
  pays_standings    boolean NOT NULL DEFAULT false,
  is_current        boolean NOT NULL DEFAULT false,
  closed_at         timestamptz,
  closed_by_superadmin_id uuid REFERENCES superadmin_account (id),
  close_reason      text CHECK (close_reason IS NULL OR length(close_reason) BETWEEN 1 AND 200),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, ordinal),
  -- Open and closed at once is the only contradiction worth a constraint; see §14's note on the
  -- biconditional this replaced.
  CHECK (is_current = false OR closed_at IS NULL),
  CHECK (closed_at IS NULL OR closed_by_superadmin_id IS NOT NULL)
);

-- "One row per (kind, round)" cannot be a plain UNIQUE: Postgres treats NULLs as distinct, so the
-- kind-wide rows would not collide. The repo's own device for exactly that is a partial unique index,
-- the same one behind "one live match per court" (schema.sql:337–338).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_stage_round
  ON tournament_stage (tournament_id, kind, round_number) WHERE round_number IS NOT NULL;
-- ...and its partner, so a day cannot hold two kind-wide rows for the same kind.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_stage_kind_wide
  ON tournament_stage (tournament_id, kind) WHERE round_number IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_stage_one_open
  ON tournament_stage (tournament_id) WHERE is_current;
```

**Resolution order, which is the whole of the resolver:** the round-specific row if there is one, else
the kind-wide row.

```sql
SELECT * FROM tournament_stage
 WHERE tournament_id = $1 AND kind = $2 AND (round_number = $3 OR round_number IS NULL)
 ORDER BY round_number DESC NULLS LAST   -- a specific row outranks a kind-wide one
 LIMIT 1;
```

**One thing D6 makes visible that the §5 design never asked.** `tournament_plan` caps its knobs —
`group_size BETWEEN 2 AND 8` and `advance_count BETWEEN 0 AND 4` (`schema.sql:657–658`) — and the plan is
a **singleton** (`ux_tournament_plan_singleton`, `:666`): one draft for the whole system, frozen into
`tournament` at activation (`:622`, which itself says only `>= 0`). Nothing in
`docs/addenda/ADDENDA.md` or `docs/design/tournament-scheduling-assessment.md` records *why* those two
ranges were chosen (grepped for `group_size`, `advance_count`, `2 AND 8`, "top two": no hits) — their
shape suggests four groups of four with two through, and that is a **hypothesis**, not something I read;
it is safe to act on only because the bounds themselves are the sole place the guess is written down.
Under the owner's answer they are also the last hard constraints left in the path: a day of twelve to a
pool, or top six advancing, is refused before any stage row exists — and, as F11 records, the editor's
own `min`/`max` are a hint rather than a cap, so the ranges that bite are these CHECKs. The generator
assumes nothing of the kind (`dealGroups(shuffledTeamIds, groupSize)`, `lib/tournament/engine.ts:70–71`,
capped by nothing but its own `Math.max(1, …)`), so widening the two CHECKs to `>= 2` and `>= 0` changes
no behaviour — and, like `target_type`, it is a CHECK on a table that already exists, so it belongs in the
additive section as ADR-173's drop-and-re-add pair. `tournament_stage.promote_count` is `>= 0` for the
same reason, and it is where the number now actually lives: the plan's `advance_count` seeds the first row
and stops being the truth from there.

A day that sets nothing gets one kind-wide row per kind, seeded by `activateTournament` with
`pays_standings = (kind = 'group')` — i.e. **exactly today's behaviour, expressed as data**. And because
`round_number` is an unbounded integer, D6's "no hard constraints on how many stages" is satisfied
completely: no ceiling, no new enum value, no wire change, nothing in `schema.sql`'s additive section
that is not a `CREATE TABLE` and two `CREATE INDEX` statements.

### R2 · `pays_standings`, because an escalating later stage that pays nothing is decoration

**This is the one decision in this section I made rather than read out of the answers, and it is the one
to veto if it is wrong.** The owner's requirement — win and draw points rising as the day progresses — is
inert on the §5 design as written **for the tournament's own table**, because the fixtures that feed it
are hard-coded by kind: `groupResults` selects `stage = 'group'` (`db/entities/schedule.ts:520`) and
`countUnresolvedGroupFixtures` does the same (`:577`). A semi-final result moves the bracket and never
the pool table, and only the final's winner earns the champion bonus. What this section first said —
that such a win "pays nothing" — was too strong, and §14 corrects it: `leaderboard.ts` sums
`points_awarded_snapshot` over every completed match with no stage filter at all, so a knockout win
already reaches a participant's board total. The column is about *the table* — who advances, what the
export prints — and that is exactly where the escalation the owner asked for has to land. So "+4 per win in the semis" would be a number nobody reads.

Generalising those two predicates to *what the stage row says* keeps `stage` as the switch for everything
it already governs (the draw-legality pair at `:318`/`:444` is deliberately **not** touched — draws stay a
group-stage legality, which is ADR-152's sentence and would be a wire change to alter) and makes the
question — does this stage count toward the cumulative table? — a column the organiser sets, which is also
the most direct answer to "flexibility during field conditions": a round can be run for the bracket only,
or for the table too.

Rates still resolve in exactly one place. `requirePoints` (`routes-tournament/index.ts:363–375`) reads
`point_config` today; it gains the resolved row and one `??` per rate. The amount a match paid is already
copied to `points_awarded_snapshot` and read back by the standings (`leaderboard.ts:59`, `:71`,
`schedule.ts:500`), which is why no history migration is needed and why adding a `stage_id` to
`team_award` is enough to make an award attributable to a stage: the fixture never learns it.

### R3 · manual mode: guards become confirmations, and re-pairing is the lever

- **Closing a stage with fixtures unresolved is where the flexibility has to be bought.** Today the gate
  is a hard refusal with no escape: the route counts `pending`/`claimed` fixtures for `stage = 'group'`
  (`countUnresolvedGroupFixtures`, `db/entities/schedule.ts:566–581`) and answers `conflict` with
  `groupStageUnresolved` (`routes-superadmin/tournament.ts:142–149`). Two facts worth keeping straight
  about it: the count is by **kind**, not by phase, and the `< 2` branch inside `closeGroupStage`
  (`schedule.ts:592–602`) is not leniency about unfinished fixtures at all — it is the *qualifier* count,
  and what it does is complete the tournament with no champion and no bonus, deliberately (ADR-136).
  The revised rule: the same count scoped to the stage row's fixtures, still a refusal by default, and
  `force: true` with a `reason` as the new escape — written to the row's `closed_by_superadmin_id` and
  `close_reason`, which is why §5 P1's shape was right even though its table name is not. That is the
  whole answer to "no hard constraints during field conditions": the organiser is never *blocked*, they
  are made to say so, and the saying is the audit trail.
- **Re-pairing inside the current stage**: `POST /stages/:id/fixtures` swaps the pair on pending fixtures,
  guarded on `status = 'pending' AND stage/round belong to this row AND both teams are in this tournament`.
  This replaces §5 P6's phase wording; the operation is unchanged and still the answer to the
  facilitators' actual complaint.
- **Re-staging a fixture** — moving an unplayed fixture from one stage row to another (a round pushed by
  rain, a pool promoted into the championship pool) — is allowed while `status = 'pending'` and refused
  afterwards, because nothing has settled to be re-priced. No points move: the snapshot lives on the
  match, not the fixture. This is the operation that makes "no hard constraints" true in the sense a
  facilitator means.
- **Claim scoping** stays as §5 P6 proposed, now scoped to the current row: it is the only place where
  adding a predicate *removes* a hazard rather than adding a rule — a hand-started match can no longer
  silently consume a knockout fixture (`tests/court-queue.test.ts:191–206`).

**Built, and where.** All four bullets above landed on 2026-10-12 in **ADR-247**, with two changes this
section had to learn from the code rather than the other way round: the claim is scoped to the current
row's *kind* and not to its exact key (correction 4), and the re-stage is not built because a day whose
rows are kind-wide has nowhere to move a fixture to (correction 5). §14 lists what is in the tree.

### R4 · the batch: one header over both ledgers, and no duplicate guard at all

D7 removed the constraint the §5 design leaned on ("we can even award multiple times if the superadmin
needs to"), which changes the shape more than it sounds like it does:

- `team_award_batch` becomes **`award_batch`** (D9: shared, "don't need segregation for something like
  this"), and the sharing is done **over the two existing ledgers, not by merging them**: the header owns
  label, reason, author, timestamp and the reversal; `team_award` and `score_adjustment` each gain a
  `batch_id uuid NOT NULL REFERENCES award_batch (id)` / `... NULL` (nullable on the participant ledger
  because its existing rows have no batch, and they should keep meaning "posted one at a time at the
  desk"). `createAwardBatch` inserts into both row tables in one transaction — the mixed batch the owner
  described, "the ones the rain cost us" paying teams and people at once, with each ledger's own CHECKs
  and FKs intact and no `kind` column anywhere.
- **No `note` column** on `team_award` (D8: batch-level reason only).
- **Outcomes are `created` | `retry` only.** `conflict` has nowhere to live once the duplicate guard is
  gone, and nothing is swallowed in its place: with no guard there is no row to swallow. The hazard
  inverts into the double *post*, which is exactly what the console-minted `client_batch_uuid` (D10)
  answers, in the `fringe_scan` idiom (`schema.sql:194`).
- **Validation moves from refusal to display.** The preview before Post says what the ledger already holds
  per team — *"Sandstorm: +12 from "QF promotion" already on the books; this batch makes it +24"* — and
  a team repeated inside one payload is shown as a repeat rather than rejected. That is the way to honour
  "no constraints" without becoming the bug ADR-116 was written about, which was a silent discard wearing
  a success. The checks that stay are integrity, not policy: rows non-empty, `points <> 0` (ADR-117's
  "an adjustment of nothing is not a correction, it is noise in the ledger"), reason 1–200, and the
  subject belonging to the tournament — that last one is load-bearing rather than tidy, because an award
  for a foreign team is silently worth nothing to every reader.
- **Five readers must carry `NOT b.is_reversed`** — the team-award CTE and the participant CTE in
  `leaderboard.ts`, the team and participant detail ledgers, the day's export, and the batch list — with
  a test each. The duplicate-guard reader in §5 P7's table is gone, and D7's "does a reversal free them to
  be awarded again" is moot: they were never blocked.
- The automatic promotion bonus still stays out of the batch (R5, ADR-136), the reversal still needs the
  `void_audit_entry.target_type` widening: the CHECK at `schema.sql:386` lists three values today
  (`fringescan`, `tournamentmatch`, `swagclaim`) and gains `'awardbatch'` as a fourth, which on an
  existing database is ADR-173's drop-and-re-add pair and not the `CREATE TABLE`.

**Built, and where.** All six bullets landed on 2026-10-13 in **ADR-248**, with three changes this section
had to learn from the code: the third outcome `conflict` (correction 6), the readers that mark rather than
filter (correction 7), and the reason plus the foreign key that the file's own ordering forced (correction
8). The `void_audit_entry` widening it predicted is exactly what shipped, and so is the claim that the
export needs no filter of its own because it reads the board.

### R5 · the promotion bonus is per stage row, off, and derived

`promotion_points` and `promote_count` live on the row, so the bonus is definable per stage exactly as
asked ("we also need this promotion bonus to be definable based on stage id"), and the row's `id` is the
FK the batch header and each `team_award` row carry — which is also what makes an award attributable to a
stage without `tournament_fixture` learning anything new. `NULL` = off, and off is the
default for every row a template does not fill. The bonus is **not** written as a `team_award` row: it is
computed in the leaderboard's CTE from the fixtures that were settled while the row was current, so
voiding the final still takes the bonus away, and a reversal of a batch cannot leave it behind.

### Cost, revised

| Stage | Content | Estimate |
|---|---|---|
| 0 | unchanged: F1–F4 drift fixes + rule 11 widened to columns, with a sabotage case per rule change | ~90 LOC + ~60 test |
| 1 | R1: `tournament_stage`, the three partial indexes, the resolver, Drizzle mirror, `activateTournament` seeding the kind-wide rows, `closeStage(row)` generalising `closeGroupStage` | ~200 LOC + ~200 test |
| 2 | R2: `pays_standings` through `groupResults` and `countUnresolvedGroupFixtures`, `requirePoints` reading the row, and the byte-identical-standings test for an un-staged day | ~70 LOC + ~110 test |
| 3 | R3: `POST /stages/:id/fixtures` re-pair, re-stage while pending, claim scoping, the two coin-flip tests re-asserted against the row predicate | ~170 LOC + ~130 test |
| 4 | promotion override ledger + `team_award` + the two new CTEs + `readTeamTotals` | ~200 LOC + ~180 test |
| 5 | the stage editor (S61) and the award panel (S62), bracket and hall views, ADR-161 export column | ~330 LOC + ~150 test |
| 6 | R4: `award_batch`, the client key, `created`/`retry`, mixed-ledger insert, reverse/re-apply, the void-audit widening, and one test per reader | ~240 LOC + ~180 test |

**≈ 1,300 production + ≈ 970 test LOC over ~30 files, 8–10 dev-days** (estimate; basis ADR-092's
480 + 340, so 2.7× on production LOC). Against §7's 1,220 + 880 the phase table came out and about as
much went back in — R1 is cheaper than P1+P2 by a column, a CHECK and a test, while R2 edits the
standings predicate and R4's shared header means one panel writing two ledgers. Two of the three
stages that grew are the ones whose tests matter most: stage 2 has more test LOC than prod LOC, because
"an un-staged day is byte-identical" is the only claim in this document that cannot be checked by
reading the code.

### Four ADRs, and the order

- **ADR-245** — the day is a list of stages: `tournament_stage`, keyed on `(stage, round_number)`, and
  why `stage` remains the behaviour switch rather than becoming a projection (supersedes §5 P1's
  `fixture_stage` declaration; no supersession of ADR-152 or ADR-137 — both predicates are untouched).
- **ADR-246** — `pays_standings`: which fixtures feed a table is data, not a hard-coded kind; the
  un-staged default reproduces `stage = 'group'` exactly.
- **ADR-247** — the levers on a staged day: the claim scoped to the stage being played, re-pairing a
  stage's pending fixtures, and a close that takes `force` with a `reason`. Numbered here rather than in
  the order of this list, because an ADR number is awarded when the work lands and §13 R3 landed first.
- **ADR-248** — team awards, and a batch as the reversible unit: one header over two append-only ledgers,
  `created`/`retry` on a client-minted key, no duplicate guard by owner's instruction, five readers
  filtering `is_reversed`, and the automatic promotion bonus kept derived and outside the batch. This was
  247 in the first draft of this section, and remains unbuilt.
- A fourth only if the FDS is updated in the same pass: **§2.6's sentence** "fixtures live beside it, never
  inside it" now has a second table beside the tournament, so `fds.md` gains a subsection for the stage row
  and the three-value `target_type` enum it still under-documents (`fds.md:290`, two values, already
  stale since ADR-159) is corrected while it is open.

Build 0 → 1 → 2 first and stop there if the answer to "does this day need staged rates at all" turns out
to be no: stages 0–2 are the whole normalisation repair plus the structure, ~360 LOC, and nothing in them
changes how a point is scored today.

---

## 14. Built on 2026-10-13 — stages 0 to 4

In the tree now, with `ADDENDA.md` carrying **ADR-245** (the stage rows), **ADR-246**
(`pays_standings`), **ADR-247** (the levers on a staged day) and **ADR-248** (the award batch):

- **Stage 0.** Rule 11 of `scripts/check-standards.mjs` compares *columns and foreign keys* now, not
  table names: `parseSchemaColumns` reads the `CREATE TABLE` blocks and the ADR-168 `ADD COLUMN` lines
  together, and every mapped column must exist while every enforced FK must be mirrored and no
  mirrored FK may be invented. It found exactly the three unmirrored FKs §3 predicted — once they were
  fixed it is clean over 33 tables, which is the outcome a drift rule should have. F4's
  `PointsAwardedSnapshot` gained `drawPoints` (optional, with the reason in the comment) and `matches.ts`
  now takes `Required<PointsAwardedSnapshot>` instead of restating the shape. ADR-248 finished the job twice
  over: `parseMappedColumns` no longer loses the last mapped column of a `pgTable` body (its terminator was
  the closing brace, which is not in the text the function is handed), and a foreign key named at the foot of
  `schema.sql` by `ALTER … ADD CONSTRAINT` counts as enforced. Six hundred and one files green either way,
  which is the shape a drift rule should have: it found one column, the one being added.
- **Stage 1.** `tournament_stage` as §13 R1 describes it, plus `db/entities/stages.ts` — `readStages`,
  `resolveStage`, `feedsStandings`, `stageRates`, `insertStagesForActivation`, `closeStageRow`,
  `openNextStageRow`, `countUnresolvedStageFixtures`, `stageFixturePredicate` — with `activateTournament`
  seeding rows in its transaction and `closeGroupStage` closing and advancing the row inside the
  transaction that draws the bracket.
- **Stage 2.** `groupResults` and the close guard consult `feedsStandings`; `requirePoints` became
  `pointsForCompletion`, which resolves the stage through the fixture the match claimed and inherits
  `point_config` underneath it.
- **Tests.** `apps/api/src/tests/tournament-stages.test.ts`, 9 of them: the two pure rules, the seeded
  shape per format, the partial index refusing a second open stage, the count narrowing with the
  stage's scope, the close stamping who and why and moving `is_current`, the read-through that proves
  `pays_standings` changes the table without a result being replayed, and the legacy day whose rows are
  deleted still behaving.
- **Stage 3, the levers.** `claimScope` on the fixture claim — the tournament being played, and inside it
  the kind the day is playing, with `third_place` riding along while the bracket is live; `stagePairing.ts`
  — `planRepair` deciding and `applyRepair` obeying it under a `status = 'pending' AND match_id IS NULL`
  guard on every row, behind `POST /api/admin/tournament/stages/:stageId/fixtures`; and `{ force, reason }`
  on `close-group-stage`, whose unresolved count moved out of the route into `refusalForClose` and out of
  the string `'group'` into the stage row's own predicate. ADR-247.
- **Stage 4, the awards.** `award_batch` and `team_award` (`schema.sql:835–886`, `db/schema/awards.ts`),
  `db/entities/awards.ts` — `createAwardBatch`, `reverseAwardBatch`, `reinstateAwardBatch`, `findAwardBatch`,
  `listAwardBatches`, `listTeamAwards` — `score_adjustment.batch_id`, `'awardbatch'` as
  `void_audit_entry.target_type`'s fourth value, and the two CTEs in `leaderboard.ts` that make a batch and
  its reversal move the board: `team_award_points`, and the header join on `adjustment_points`. Six routes
  under `/api/admin`, ADR-248.
- **Tests, stage 4.** `apps/api/src/tests/award-batches.test.ts`, 17 of them: a total rising and falling on
  the board and in the day's export, both ledgers paid by one batch and un-paid by one reversal, the
  register listing a reversed batch marked rather than missing, one key acknowledged twice and then refused
  a different payload, seven refusals of shape, the audit row written in each direction and read back
  through the widened filter, a team's ledger with its live total, and the field rule on a staged day. the eleven refusals
  and the two acceptances of the decision, then a played day whose pairs are re-made with the slot left
  where it is, whose in-play fixture cannot be moved and takes its neighbours down with it in refusal,
  whose close is forced with a reason that lands on the row, and whose third-place seat waits for the
  bracket window to open before any match may claim it.

Things the building changed in this document, all of them the code's correction rather than a change of
mind:

1. **`CHECK ((closed_at IS NULL) = is_current)` was wrong**, and the world-cup test refused it on the
   first activation: a seeded knockout row is neither current nor closed, and a biconditional has no
   word for *not yet started*. The table now refuses the one state that is a contradiction — open and
   closed at once — and the partial unique index keeps "one open stage". §13 R1's sketch says so where
   it stands.
2. **`pays_standings` is about the standings table, not the board** — §13 R2's original sentence
   overstated, and the paragraph above it now says which half is true. The column is still necessary:
   *who advances, and what the day's export prints* is the table, and the table was the thing that
   could not see a later phase.
3. **F11's fourth bound is the one that bites.** `@psd/contracts` refuses `advanceCount 4` today
   (`schemas.ts:874–877`), so widening the plan's CHECK ranges without widening the zod bounds would
   change nothing an organiser can feel. That work belongs to the surface stage, not to the schema one.
4. **R3 scoped the claim to the current row's `(kind, round_number)`; the build scopes it to the row's
   kind.** Two reasons, both read off the code rather than thought up. A cancelled match releases its
   fixture back to pending, and the restart has to find that row again even though the day has moved to the
   next round; and the third-place match is played *inside* the bracket window while having a kind of its
   own (ADR-137), so a row-scoped predicate would make it unplayable by anyone but the queue. The wider
   scope still cannot take a fixture meant for another match: a pair plays each other once inside a stage,
   and bracket seats are excluded by the `source_fixture_a_id IS NULL` bound that the repair shares.
5. **R3's re-stage is inert as written**, and was not built. With the rows activation seeds there is exactly
   one row per kind, so a same-kind move has no destination — and a cross-kind move (a pool lifted into the
   championship round, which is the case the bullet was really about) would have to rewire the bracket's
   feeder links, which is `advanceWinner`'s contract and not a repair's. It returns with per-round rows, or
   with a decision about what a promoted pool means; until then the operation would be a route that answers
   every request with a refusal, which is worse than no route.

6. **R4's outcomes needed a third value.** `created | retry` covers the offline queue but not R4's own
   contract sentence, "one key, one payload": the same key arriving with a *different* body has to be a
   refusal, or a console that lost its first answer gets a 200 for a batch nobody posted. `conflict` is
   decided by comparing the stored batch's rows with the ones asked for — the pre-read the retry needs is
   the same read, so the check costs nothing.
7. **Three of R4's five readers mark instead of filtering.** The table asked for `NOT b.is_reversed` in the
   team and participant ledgers and in the batch list as well as in the two board CTEs. Applied literally,
   a reversed batch would vanish from all five — which deletes a decision from the record of decisions, the
   one thing ADR-117's append-only rule exists to prevent. The two readers that *price* points filter; the
   three that *register* show the rows with `batchReversed` on them, and a team's live total is the ledger
   minus the reversed lines, computed in the view from the rows the register already has.
8. **A batch copies its reason rather than relaxing a column, and a new table cannot be pointed at from
   above.** `score_adjustment.reason` is NOT NULL with a 1–200 CHECK, and the additive section may only
   add, so each participant row repeats the batch's reason. The other half is order, not nullability:
   `schema.sql` is applied top to bottom and Postgres resolves a `REFERENCES` clause when the column is
   created, so `score_adjustment.batch_id` is declared bare and gains `score_adjustment_batch_id_fkey` at
   the foot of the file. The first version carried the reference inline, which rolled the whole snapshot
   back and surfaced as `relation "award_batch" does not exist` in 57 test files.

**Gate on the finished tree:** `./verify.sh --fast` green — typecheck, lint, standards (593 files, 18
rules, 0 violations), 831 API tests with 3 skipped, 1614 web tests. Playwright was not run: no browser in
this sandbox, and no surface has changed yet. `AGENTS-workflow.md` §4 asks for exactly that sentence in
the commit message, so it is there as well.

**Not built, deliberately, from §13:** re-staging a fixture between stage rows (correction 5); the stage
editor and the award surfaces — nothing in the console posts to any of these routes yet, so the levers and
the batch exist for the API's own clients and for the dialogs that will follow (the award preview is the
`GET /api/admin/teams/:teamId/awards` read, which arrives before its button because the button needs it);
the promotion bonus's `GET /tournament/bracket` exposure; and any automatic posting of a promotion award
into a batch, which R5 keeps derived on read for the reason ADR-136 keeps the champion bonus derived. `promote_count` is already authoritative — `closeGroupStage`
ranks qualifiers by the row's number with the tournament's column as the floor underneath it, which is
what keeps the pair from being two answers to one question — and `promotion_points` is read by nothing
but the seeded row, deliberately inert until the bonus CTE that spends it arrives with the surfaces.
