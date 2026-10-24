# The tournament engine — design spec

**Status:** design, written before the code it describes (AGENTS.md: docs first). Kept in step with what
ships; every divergence is an ADR. **Plan:** `docs/design/2026-10-15-tournament-overhaul-plan.md`.
**Register:** ADR-270 (removal), ADR-271 (stale refusal), ADR-272 (modules), ADR-273 (data model),
ADR-274 (formats + planner), ADR-275 (tables), ADR-276 (points bridge), ADR-277 (compatibility contract and
surfaces), ADR-278 (scheduler adapter: byes, round pairing, placement, cross-group seeding), ADR-279 (desk API
and the three subtabs), ADR-280–286 (shared surfaces, schema guarantees, clocks, ordering, Line-ups, court
stations, demo courts), ADR-288 (courts panel), ADR-289 (manual placement), ADR-290 (the full-event spec).

## 1. Modules and the one rule

```
packages/tournament (@psd/tournament)   pure TypeScript — no I/O, no clock, no randomness
  src/core/        the tournament as data and decisions
  src/scheduler/   formats (plugins) + the planner; imports core, never the reverse
apps/api/src/tournament/              core adapter (Drizzle, transactions, read models)
apps/api/src/tournament-scheduler/    scheduler adapter (its own tables FK the core's)
apps/api/src/routes-tournament/ …     composition root: the only code that knows both
```

- **Core never imports scheduler**; the core adapter never imports the scheduler adapter, and neither
  imports `team`/`participant` modules. `check-standards.mjs` enforces the direction.
- The app touches the tournament through one seam: an **entrant** points at an app **team** (FK), with
  its name snapshotted. Points reach people through the app-side **roster bridge** (§6).
- Time is passed in (`now` as an ISO instant) — the engine has no clock. Ids are passed in or minted by
  the adapter (`db/ids.ts`); the engine works on string ids and codes.

## 2. Core model (`core/types.ts`)

| Object | Fields that matter |
|---|---|
| Entrant | `id`, `name`, `entryOrder` (the visibly-arbitrary last tie-break, P-02/P-10), `withdrawnAt` |
| Stage | `id`, `ordinal`, `label`, `kind` `pool│bracket│swiss│open`, `allowsDraws`, `advanceCount`, `rates` (win/draw/loss active-day points, null = tournament's), `status` `pending│active│completed` |
| Group | `id`, `stageId`, `code`, `label`, `entrantIds` (seeded order) |
| Match | `id`, `code` (unique per tournament), `stageId`, `groupId?`, `round`, `sequence`, `origin` `structure│ad_hoc`, `status` `scheduled│in_progress│completed│cancelled`, `courtId?`, `plannedStartAt?`, `plannedMinutes`, `startedAt?`, `endedAt?`, `score {a,b}`, `result` `{kind: score│walkover│bye, winnerSide: a│b│null}`, `isVoided`, `version` |
| Slot | one per (match, side): `source` (below), `label`, `seatedEntrantId?`, `seatOverrideReason?` |
| Award | `id`, `entrantId`, `matchId?`, `kind` `result│manual`, `points`, `reason`, `voidedAt?` |

**Slot sources — requirement 10, a DAG of real references:**

```ts
type SlotSource =
  | { kind: 'entrant'; entrantId }                       // known at build time
  | { kind: 'winner_of'; matchId } | { kind: 'loser_of'; matchId }
  | { kind: 'group_place'; groupId; place }             // 1-based place in a group table
  | { kind: 'stage_place'; stageId; place }             // place across a whole stage (points rush)
  | { kind: 'pairing'; stageId; round; pairIndex; side } // Swiss: filled when the round is paired
  | { kind: 'vacant' };                                 // a seat nobody will fill (structure hole)
```

**Seating.** `resolveSeat(state, slot)` derives who *would* sit there now. A slot is **seated** —
frozen into `seatedEntrantId` — when its match starts, or when a stage completion seats `group_place`/
`stage_place` sources. A seated slot never moves on its own; only an attributable `reseat` (superadmin,
reason) changes it. This is the rule both references lacked: *after people are sent somewhere, later
corrections move tables, not people* (P-09, P-11).

## 3. Commands and rules (`core/commands.ts`)

Every command is `(state, command, ctx{now, actor}) → { ok: true, state', events[] } | { ok: false, refusal }`.
Pure; the adapter persists `state'` diff + events in one transaction.

| Command | Who | Guards (refusal codes) |
|---|---|---|
| `startMatch` | facilitator, superadmin | match `scheduled`; both seats resolvable and distinct; neither entrant in another live match; court given, enabled, free; stage `active` or `pending`→activates |
| `stageAdHocMatch` | facilitator (own court), superadmin | two distinct active entrants; creates `origin: ad_hoc` match in the active stage (or an `open` stage) with entrant slots |
| `scoreStep` | facilitator, superadmin | live match; `to = from ± 1`; `from` equals current (compare-and-set); idempotent when already at `to` |
| `completeMatch` | facilitator, superadmin | live; outcome from score via `readMatchOutcome` semantics: win│draw (only if `allowsDraws`)│overtime (refuse: play on)│untracked (0–0 bracket: winner named explicitly) |
| `cancelMatch` | starter facilitator, superadmin | live or scheduled; reason (superadmin) |
| `correctResult` | superadmin | completed; reason; new score (+ winner when untracked); draws only where allowed |
| `recordWalkover` | superadmin | scheduled/live; winner side; reason |
| `voidMatch`/`unvoidMatch` | superadmin | completed; reason |
| `reseat` | superadmin | slot of a non-completed match; entrant active; reason |
| `completeStage` | superadmin (or scheduler when auto) | all stage matches completed/cancelled; `overrides` (place→entrant) need a reason; refuses auto when a tie straddles the cut |
| `awardPoints`/`voidAward` | superadmin | non-zero points, ±100 bound shared with ADR-248; reason |
| `withdrawEntrant` | superadmin | reason; their unplayed matches → cancelled with reason (holes shown, P-03) |
| `closeTournament` | superadmin | no live match; reason when unfinished matches remain (P-15) |

**Result awards.** Completing (or correcting) a match writes `result` awards to both entrants at the
stage rates (else the tournament's): win/draw/loss. Zero rates write nothing. A correction voids the
old result awards and writes new ones in the same transaction; a void voids them; an unvoid re-issues.

**Correction impact.** `correctResult`/`voidMatch`/`recordWalkover` return an impact list: dependents
whose seat would now resolve differently. Unseated dependents re-resolve automatically (they were only
forecasts). Seated dependents are **flagged** in the event log and the console (`seat_conflict`), never
moved; the desk decides with `reseat`.

## 4. Standings (`core/standings.ts`)

One rule for every table (P-10): **points** (the stage's own W/D/L table points 3/1/0 for ranking — not
active-day points) → **score difference** → **points scored** → **entry order**. Each row carries a
one-sentence explanation ("Level on 6 with Reds; ahead on score difference +4"). Withdrawn entrants'
played results stand. Group tables count only matches of that group; stage tables (points rush) rank
group winners by their own record. Voided matches count for nobody; walkovers count as a win with no
score difference.

## 5. Scheduler (`scheduler/`)

**Format plugin.** `{ id, label, minTeams, maxTeams, validate(n, options), build(entrants, options) →
Structure, nextRound?(state, stageId) → Structure | null, restPolicy }`. A `Structure` is stages,
groups and match drafts whose slots reference other drafts **by code**; the core adapter mints ids.

| Format | Shape |
|---|---|
| `open` | one `open` stage, no matches; play is ad-hoc. No scheduler row. |
| `round_robin` | one pool, circle method, rotating bye (no phantom match) |
| `groups_knockout` | snake-seeded pools of `groupSize`, top `advanceCount` per pool → bracket; group winners take the top seeds (so the byes), each later place is dealt to the seed furthest from its group-mates (1A v 2B, 1B v 2A; ADR-278), optional 3rd place |
| `single_elimination` | seeded bracket (`classic` 1v16… or `adjacent` 1v2…), byes to top seeds as structure, optional 3rd place |
| `double_elimination` | 4–16; winners + losers brackets, grand final, no reset |
| `consolation` | exactly 8: QF, consolation semis + 5th place, SF, final, 3rd place |
| `swiss` | `rounds` (default ⌈log₂ n⌉); round 1 seeded; later rounds paired from standings avoiding rematches (`appendRound`); the sit-out is the lowest-ranked team without a bye, credited by `recordBye` as a completed one-seat `bye` result that pays the win rate (ADR-278) |
| `flighted_quads` | multiple of 4; per flight SF 1v4, 2v3 → final + 3rd |
| `ironman` | single elimination with byes and **zero rest**; back-to-back flagged |
| `points_rush` | pools of 3 round robin; pool winners ranked overall (`stage_place`); final #1 v #2, optional #3 v #4 |

**Stage pipelines (ADR-310).** A tournament may instead be composed stage by stage
(`scheduler/pipeline.ts`): each stage names a stage format (`pool`, `bracket` or `open`, from
`scheduler/formats/stages.ts`), an entrant source (the initial seeding, or the top *N*
advancers from an earlier stage), its own point rates, and its own match duration
(`matchMinutes`, null = inherit the tournament's). `buildPipeline(spec, entrants)` produces the
same `Structure` a whole-tournament format would, so nothing downstream can tell the difference.
The default template (`defaultPipelineSpec`) is three groups of three at 15 minutes, then the
top four — the three winners and the best runner-up, in `advancersRanked` order (place-major:
all winners ranked, then all runners-up; points, difference, scored, entry order inside each
class) — cross-seeded 1v4 / 2v3 into 20-minute semis and a final. Any stage may take either source
(ADR-325). A pool fed by an earlier stage is dealt as *seats*, not teams: its groups are
snake-dealt from `stage_place` seats ("#3 overall") when the pipeline is built, so its fixtures
already exist and wait on the feeder exactly as a bracket's do, and `completeStage` fills each
empty group with the people in those seats when the feeder closes. An override spoken for one seat
is widened to the *place* it overruled, so a team is never half in a group. An open stage fed by an
earlier stage freezes a `roster` of the teams that came through at the same moment, and a
hand-staged match there is refused for any other team (`not_in_stage`), or before the feeder closes
(`stage_not_fed`). Group and match codes are unique across the whole structure (a later pool's
colliding codes are prefixed with its stage code), because the adapter keys ids by code.
`describePipelineFlow(spec, teamCount)` derives each stage's ingress, shape, match count and egress
from the spec alone, from the same field sizes the validator uses; the stage builder shows it
read-only. Activation accepts a
`pipeline` instead of a `formatId` and records `format = 'pipeline'`; stage durations are stamped
onto each match's `planned_minutes`, and a later change to the tournament's match length retimes
only the stages that inherited it. The pipeline is materialised whole, at activation: re-cutting
an unstarted stage's *format* between stages is a later increment, and this increment's
between-stage levers are durations, pins and terminate-and-rebuild. The desk composes pipelines
in the Start form's stage builder and rehearses them in the Simulator (ADR-311).

**Planner** (`plan(input) → { placements, fit, diff }`), pure and deterministic:
- Input: `now`, enabled courts, unpinned future matches with dependencies, live matches (hold court
  until `max(now, start + minutes)`), pinned placements, `matchMinutes`, `changeoverMinutes`,
  `restMinutes` (format policy may force 0), deadline.
- List scheduling in priority order (stage ordinal → round → sequence, interleaving groups by round);
  a match is ready at max(dependency ends + changeover, each known entrant's last end + rest, now);
  earliest-available court, back-filling gaps. Unseated matches get **forecast** placements.
- The first unstarted match on each court is kept in place across re-plans unless its court is gone
  (stability for the people walking over).
- `fit`: remaining matches, court-minutes, projected finish, `fitsDeadline`, overrun minutes — advice,
  never a gate (P-13). `diff`: moved/added/removed placements vs the current plan.

**Adapter commands** (`apps/api/src/tournament-scheduler`, ADR-278):
- `activate({tournamentId, formatId, options, matchMinutes, changeoverMinutes, restMinutes, deadlineAt, now})`
  (`scheduler.ts`) → validate over the non-withdrawn entrants in entry order → build → `materialise`
  (ids from `db/ids.ts`, code references rewritten) → core `insertStructure` → `tournament_scheduler` row
  (open play's is born `terminated`) → tournament `live`. One transaction; nothing written on a refusal.
- `reconcile(now)` (`planning.ts`) → after every core write (composition root) and on a 60 s tick. No-op
  unless the scheduler is `active`. Closes every unambiguously finished stage as the `system` actor (a tie
  on a cut is refused by the core and left for a person); for Swiss, records an owed bye or pairs the next
  round (`recordBye` / `appendRound`, core commands); then plans every scheduled match that is neither live
  nor pinned onto the enabled courts, writes the placements, bumps the scheduler's `revision`, and returns
  `diffPlacements` against the placements it replaced.
- `previewContingency({enabledCourtIds, matchMinutes, changeoverMinutes, now})` (`control.ts`) → the plan
  with the proposed courts and timings, as a diff plus a fit summary; writes nothing.
  `applyContingency(same)` → switch the courts, set the timings, re-time every unplayed match of the
  tournament, reconcile. A court switched off mid-match keeps its match.
- `moveMatch({actor, matchId, courtId, start, now})` → the core's `placeMatch` (an attributable event);
  only while the scheduler runs, a pin (`tournament_scheduler_pin`) so the planner keeps it there.
  `releasePin({matchId, now})` stamps `released_at`; pins are never deleted.
- `terminate({reason, label, now})` — irreversible; placements stay frozen; every scheduling act is human
  from then on (staging, `moveMatch`, re-seating, ad-hoc matches for any later Swiss round).

## 6. Points bridge (app side, ADR-276)

`tournament_match_roster(match_id, entrant_id, team_id, roster_snapshot)` is written at kick-off (re-written
if a handed-back match kicks off again) and `tournament_award_roster(award_id, team_id, roster_snapshot)` for
every new award — a result award copies its match's kick-off roster; a desk award, walkover or bye takes the
team as it stands. Both happen inside the command's transaction (`runBridged` → `runCommand`'s
`afterPersist`), in `apps/api/src/routes-tournament/bridge.ts`, so the core stays ignorant of people. The
scheduler's own payments (Swiss byes) are frozen by `sweepRosters` after each re-plan. The leaderboard's
tournament column = non-voided `tournament_award` ⨝ `tournament_award_roster` + award batches (ADR-248).
Roster snapshots use the ADR-005 grammar (`RosterSnapshotEntry`).

## 7. Compatibility contract (kept frontends, byte-for-byte)

Served at the paths the participant, facilitator and hall-screen code already call, in the wire types it
already imports: `CourtView`, `MatchView`, `FixtureView`, `TournamentView`, `UpSoonView`,
`TeamUpSoonView`, `TournamentBracketView`. Mapping:
- `MatchView.stage`: stage `allowsDraws` → `'group'`; else `'third_place'` for a third-place match, else
  `'knockout'`. `teamAId`/`teamBId` = seated entrants' team ids.
- `FixtureView.status`: scheduled → `pending`; in_progress → `claimed`; completed → `played`
  (`walkover` for a walkover result); cancelled → `skipped`. `suggestedCourtLabel`/`estimatedStartAt`
  from the plan; `teamXFromSequence` for winner/loser seats; other unresolved seats put their forecast
  label in `teamXName` with `teamXId: null`.
- `TournamentView.format`: `round_robin` → `'round_robin'`, every other format → `'world_cup'`;
  `status`: active pool stage → `group_stage`, active bracket/swiss → `knockout`, closed → `completed`.
- `POST /api/tournament/matches` claims the queued match for that unordered pair (this court's first,
  then the earliest) if one exists, else stages an ad-hoc match (allowed while the scheduler runs, by
  the owner's decision) — the core's `startPair`.
- `POST /api/tournament/matches/:id/cancel` is the core's `callOff`: a claimed structure match goes back
  in the queue (`releaseMatch`: seats kept, score and start cleared), an ad-hoc one is cancelled. The
  wire answers `status: 'cancelled'` either way — "off this court" is all the console reads.
- Completion keeps the shared result rule at the edge (`lib/matchResult.ts`): the wire's `null` winner
  is a declared draw, which the engine command cannot express.
- The day a reader sees is the live tournament, else the one closed most recently; a draft shows
  nothing. With no tournament the courts still list, the feed and line-ups are empty, the bracket is
  `planned`, and a start is refused with the §4.2.7 copy.
- Composition root: `apps/api/src/routes-tournament/` (`support.ts` reads the day once, cached two
  seconds; `afterWrite` voids it, the feed, the board on a result, then re-plans).

## 7a. The desk's API (ADR-279)

`/api/admin/tournament`, superadmin only. Reads: `GET /` (the Control read), `GET /timetable`, `GET /events`.
Setup: courts (`POST /courts`, `PUT /courts/:id`, `PATCH /courts/:id/enabled`), a draft (`POST /`), `POST /discard`,
`POST /activate`. Matches: `POST /matches/:id/{result, walkover, void, reseat, cancel}`, `POST /matches`. The day:
`POST /stages/:id/complete`, `POST /entrants/:teamId/withdraw`, `POST /awards`, `POST /awards/:id/void`,
`POST /contingency/{preview, apply}`, `POST /matches/:id/{move, release}`, `POST /scheduler/terminate`, `POST /close`.
Every write answers with the whole Control read. Contract: `packages/contracts/src/tournament.ts`.
A draft may carry its Start configuration (`setup` on `POST /`, ADR-313): one format or a stage
pipeline, its options, the timing, and a deadline kept as a local `HH:MM` (the date is supplied by
the day Start is pressed). The server validates it against the entrant count in the format/pipeline
validator's own words before saving anything; the Control read returns it as `draftSetup`, the Start
form opens with it already in the fields, and only `POST /activate` finalises it into the scheduler.

## 8. Surfaces

- Superadmin, one Tournament tab with three subtabs (`routes-superadmin/tournament/`, ADR-279):
  - **Control** `/admin/tournament` — before a day: a draft (name, the day's own rates, the teams in seed
    order, and the Start configuration saved with it when the form's answer was a playable one), then
    Start (format, its options, timing — a saved configuration arrives already in the fields, ADR-313). Live: the scheduler and its fit, Stop for good and
    Close; the matches on court, queued (in planned order) and finished, each with its acts — Correct,
    Void/Reinstate, Walkover, Call off behind the one ReasonDialog, and **Move** / **Release to the
    planner** on a queued match (ADR-289, no reason: it changes no result); the stages and their tables
    with Close this stage; the teams with Award points and Withdraw; Courts and timings (contingency:
    preview the re-plan, then apply). In every phase, the venue's **Courts** (ADR-288: add, edit; switch
    on or off until a day is live, then that is contingency's).
  - **Timetable** `/admin/tournament/timetable` — one lane per court across the day, a now-line, pinned
    matches marked, and the matches the planner could not place listed below.
  - **Simulator** `/admin/tournament/simulator` — `@psd/tournament/scheduler`'s `simulate()` in the
    browser, re-run on every change; defaults to the registered team count and the enabled courts.
    Not built (recorded in ADR-289): a "Use this plan" that pre-fills Control's setup — a Simulator plan
    is still re-entered on Control. (A draft's own saved setup is a different thing, and does pre-fill
    Start: ADR-313.)
- Facilitator, the court console `/staff/court/:courtId` (kept, unchanged) and its **Line-ups** subtab
  `/staff/court/:courtId/lineups` (`routes-court/CourtLineupsPage.tsx`, ADR-284): this court's
  unresolved matches in play order, the next one marked, a seat not yet known named by where it comes
  from ("Winner of #7"). The subtab strip lives on the new page only; the kept console is reached back
  through it, and the subtab itself by its URL (the console is a kept file).
- Participant and hall screen: the kept surfaces, unchanged, fed by the compatibility routes (§7).
