# Tournament overhaul — staged plan (memory backup)

- Repo: `/Users/SIAW_Woei_Shyang/Downloads/special-fiesta`
- Branch: `arena/1952d326-special-fiesta`. Push to `origin` on the same branch.
- Base commit: `2bf76f4`. Written 2026-10-15 (Asia/Singapore).
- Next free ADR number: **ADR-270**. Current `CURRENT_SCHEMA_VERSION` is **1** (`apps/api/src/db/bootstrap.ts:60`).
- Reference samples live in the untracked `tournament_reference/5` and `tournament_reference/6`. They are not committed.

## 0. Context

The current tournament system grew piece by piece (ADR-089 through ADR-247): tournament, plan, entry, fixture, stage and match tables. It is wired directly into:
- the leaderboard SQL
- teams and roster repair
- the clusters freeze
- corrections
- operations and the dashboard
- the hall screen
- the up-soon alerts

It also includes a "manual day" / "drawn day" rebuild (ADR-1xx / 1yy) that was shelved and never mounted.

The owner wants it replaced with a **modular, lightly coupled engine**. During a tournament, a **match scheduler** drives it. The tournament type chosen at start decides how the scheduler behaves, and the scheduler can be switched off to hand full control back to people.

The work has two halves:
1. Remove the old backend and superadmin surfaces, then commit and push.
2. Build the new engine and re-wire the surfaces to it.

## 1. Owner decisions (binding)

1. Remove all tournament backend code: the API, the superadmin surfaces and the DB schema. **Teams stay**: `team`, `team_membership`, the team routes and team chat are all untouched.
2. **Participant frontend code stays byte-for-byte unchanged**, both now and after the rebuild. Its backend wiring may be missing between the two halves. The hall screen (`routes-screen/`) is treated the same way.
   - The facilitator frontend is also untouched by the cleanup. It changes later only for the new Line-ups subtab.
3. **Formats this sprint:** all nine samples plus open play.
   - open play
   - round robin
   - groups → knockout (World Cup)
   - single elimination
   - double elimination
   - consolation (8 teams)
   - Swiss
   - flighted quads
   - ironman
   - points rush
4. **Facilitators while the scheduler runs:** they may start the queued match, pull forward any ready match, or stage an ad-hoc pair on their court. The scheduler re-plans around these. Ad-hoc matches count like any other match.
5. **Resetting databases is acceptable.** The schema version is bumped, a stale database is reset with `DB_INIT_RESET=stale` or `./dev-reset.sh`, and the demo seed is regenerated.
6. **Superadmin Tournament tab** gets three subtabs:
   - **Control:** run the real tournament.
   - **Simulator:** like the samples; defaults to the number of teams registered now.
   - **Timetable:** a global view of future line-ups and the court schedule.
   - The facilitator court console gains a **Line-ups** subtab for that court.
7. Regression suites may be skipped during the sprint. **Everything must pass** (full suites and Playwright) before the sprint ends.
8. The scheduler may have its own tables and modules that FK into the core, **never the reverse**. The core is independent of the scheduler.

## 2. Progress so far

**2026-10-15 update:** Phase 1 committed and pushed as `28863ed` (ADR-270 removal, ADR-271 stale refusal; numbers shifted by 2 because the owner's own commits took ADR-268/269, so the engine ADRs are ADR-272–277). Engine core (`packages/tournament/src/core`) written with 42 tests. Next: scheduler formats + planner, then adapters.

**Resume notes (2026-10-15) — SUPERSEDED, see the next block.**

**Resume notes 10 (2026-10-15, Phases 6–7 — the sprint's last block):**
- Web: `a369e70` (client + hooks, ADR-283), `173db85` (Control, Timetable, Simulator, ADR-279), `8e8927d` (court Line-ups, ADR-284), `e84238b` (court stations, ADR-285), `c9bf7f0` (demo courts, ADR-286), `65cb3d5` (Courts panel ADR-288, manual Move/Release ADR-289).
- Pre-existing failures fixed on the way, both failing on the base commit `2bf76f4` too: sign-out landed on `/signin` (router transitions, `a07f0c2`, ADR-287); light-console primary/danger buttons unreadable at 1.26:1 (`5b2df9a`, ADR-291). Parallel-suite isolation: team-chat specs scoped to the Teams light, nickname labels de-duplicated.
- e2e: `full-event/full-event.spec.ts` rebuilt (ADR-290, 9 passed on its own stack), `superadmin/tournament-tabs.spec.ts`, `facilitator/court-lineups.spec.ts`, `acceptance/console-button-contrast.spec.ts`. Parallel areas 104 passed. `exclusive/service-worker.spec.ts` needs a built bundle (README in `e2e/`).
- Not built: the Simulator's "Use this plan" (ADR-289 says so; format and timing are re-entered on Control).
- T7.4 done (2026-10-16), on the final tree `027e85f`: `./verify.sh` green (typecheck, lint, standards, web build, API 788 passed / 3 skipped, web 1649 passed, every coverage floor met) and, since ADR-292, the engine's 85 tests in the gate too. Playwright on Chromium: parallel areas 106 passed / 46 skipped by the specs' own engine and width rules / 0 failed; exclusive 8 passed / 2 skipped (against the built bundle, as `e2e/README.md` says); full-event 9 passed. WebKit was not run (not installed on this host).

**Resume notes 9 (2026-10-15, Phase 5 done — API complete):**
- Pushed: `dbef7bb` (points bridge, ADR-276), `4f8f89a` (shared surfaces, ADR-280), `aa1fa54` (schema guarantees + coverage restored, ADR-281).
- This commit (ADR-282): `lib/upSoonWatch.ts` (ADR-121 restored over the day picture, 5 s) and `tickSchedule` (60 s re-plan), both started in `index.ts`. Tests: `tournament-clocks.test.ts` 5. API 786 passed; coverage above every floor (branches 94.65%).
- The API is complete for every owner requirement. Next: Phase 6 web — T6.1 `apps/web/src/lib/api/tournament.ts` (desk client over `/api/admin/tournament`) + hooks; T6.2 Control subtab; T6.3 Timetable; T6.4 Simulator (`simulate()` in the browser via `@psd/tournament/scheduler`, defaults from registered team count and enabled courts); T6.5 facilitator Line-ups subtab (GET `/api/tournament/lineups` filtered by court client-side, or the planned `/courts/:id/lineups`); T6.6 superadmin nav re-wire. Kept participant/facilitator/screen code stays untouched — new facilitator subtab is an addition.

**Resume notes 8 (2026-10-15, T5.3 superadmin API done):**
- Pushed through `e414f92` (compatibility routes, ADR-277).
- This commit (ADR-279): `/api/admin/tournament` — `routes-tournament/{desk,desk-setup,desk-matches,desk-day}.ts`, `views/tournamentAdmin.ts`, `tournament/setup.ts` (courts, draft, discard), `load.ts` gains `findDeskTournament`/`listEvents`, contract module `packages/contracts/src/tournament.ts` (requests + `AdminTournamentConsoleView`/`TimetableView`/`ContingencyPreviewView`), seven messages; withdrawal now calls off matches that name the team before seating. Tests: `tournament-desk.test.ts` 13; full API suite 755 passed.
- Next: T5.4 points bridge (ADR-276): composition root writes `tournament_match_roster` at kick-off (`written.startedMatches`) and `tournament_award_roster` on every new award (`written.newAwards`); leaderboard `tournament_points` arm unions non-voided awards ⨝ award roster; then re-wire final standings / operations / dashboard / repair / alerts up-soon / station labels. Then T5.5 tick.

**Resume notes 7 (2026-10-15, T5.2 compatibility routes done):**
- Pushed through `be010a4` (scheduler adapter, ADR-278).
- This commit (ADR-277): `apps/api/src/routes-tournament/{index,reads,actions,support,refusals}.ts` mounted at `/api/tournament`; `GET /api/teams/:teamId/matches` restored; `lib/matchResult.ts` restored at the edge; core `claims.ts` (`startPair`, `callOff`) + `releaseMatch`; `findDayTournament` in the core adapter; ADR-131 push pairs restored against engine command names; four matrix rows. Tests: `tournament-routes.test.ts` 12, `core-claims.test.ts` 7; full API suite 742 passed.
- Next: T5.3 `/api/admin/tournament/*` — courts CRUD (`tournament_court`), create draft + enter teams, activate (format, options, timing) → `afterWrite`, contingency preview/apply, move/release pin, terminate, corrections (`correctResult`, `recordWalkover`, `setMatchVoided`, `reseat`), `completeStage`, `withdrawEntrant`, `awardPoints`/`voidAward`, `closeTournament`, timetable read (placements + fit), events read. Every write → `afterWrite` + push pairs. Then T5.4 points bridge (ADR-276; roster snapshots written by the composition root on start/award; leaderboard tournament arm).

**Resume notes 6 (2026-10-15, T5.1 scheduler adapter done):**
- Pushed through `f576846` (views + 10 field tests).
- This commit (ADR-278): `apps/api/src/tournament-scheduler/{scheduler,materialise,planning,control}.ts` — `activate`, `reconcile` (auto-advance as `system`, Swiss owed bye / next round via core `recordBye`/`appendRound`, plan + write placements, diff), `previewContingency`/`applyContingency`, `terminate`, `moveMatch` (core `placeMatch` + pin while active) / `releasePin` (`released_at`, no DELETE). Engine gains `core/rounds.ts` (byes as completed one-seat `bye` results; `appendRound`) and `core/placement.ts`; groups→knockout seeding keeps group-mates apart (1A v 2B). Tests: engine 77, `tournament-scheduler.test.ts` 10 on PGlite; four bite checks recorded in ADR-278.
- ADR-276 (points bridge) and ADR-277 (compatibility contract + surfaces) still to be appended when T5.4 / T5.2 ship.
- Next: T5.2 routes at the old paths (see notes 5), with the composition root calling `reconcile` after each write; then T5.3 `/api/admin/tournament/*` (create draft + enter teams, activate, contingency preview/apply, move/release, terminate, corrections, stage completion, withdraw, award, close, simulate is client-side).

**Resume notes 5 (2026-10-15, T4.3 views written):**
- Pushed through `bfdc692` (core adapter + its PGlite test, 6 passing; Swiss pairing index fix).
- This commit: `apps/api/src/views/tournament.ts` — `ViewContext {state, teamOf, courtLabels, formatId}` and `matchView`, `fixtureView`, `tournamentView`, `courtView`, `bracketView` mapping engine state to the kept wire types (ADR-277 mapping rules in its header). No unit test yet — add `apps/api/src/tests/tournament-views.test.ts` (build a state with the engine fixtures shape, assert each field the kept frontends render).
- Next: T5.1 `apps/api/src/tournament-scheduler/` (activate: `findFormat(id).build(entrants)` → mint ids, rewrite code refs to ids → `insertStructure` + scheduler row; reconcile: `plan()` with minutes since a day epoch → write `planned_start_at/court_id` for scheduled, unpinned matches; Swiss `planNextSwissRound`; auto-advance via core `completeStage` as system actor; contingency preview = `diffPlacements`; terminate). Then T5.2 routes at old paths: GET /api/tournament/{courts,courts/:id/current-match,courts/:id/recent-teams,schedule,matches/feed,matches/:id,lineups,bracket}, POST /api/tournament/{matches,matches/:id/score|complete|cancel}, GET /api/teams/:teamId/matches; matrix rows + PUSH_PAIRS + publishFeedMatch.

**Resume notes 4 (2026-10-15, T4.2 written, untested):**
- Pushed: `d815058` (ADR-275 tables + `tournament/load.ts`), `ccf9297` (backdrop venues plan doc; implementation deferred until after this sprint).
- UNCOMMITTED: `apps/api/src/tournament/persist.ts` (state diff → Drizzle writes; `insertStructure` for activation) and `apps/api/src/tournament/commands.ts` (`runCommand`: load → engine → persist in one transaction). Typecheck/lint/standards green; NO integration test yet — write `apps/api/src/tests/tournament-core-adapter.test.ts` first (real PGlite: insert a tournament + entrants + structure, run startMatch/scoreStep/completeMatch through `runCommand`, read rows back; refusal path writes nothing).
- Then T4.3 views (`apps/api/src/views/tournament.ts` → existing MatchView/FixtureView/CourtView/TournamentView/TournamentBracketView/UpSoonView), T5.1 scheduler adapter (`apps/api/src/tournament-scheduler/`: activate = format.build → mint ids → `insertStructure`; reconcile = `plan` over unpinned future matches → write planned court/start; contingency preview/apply; terminate), T5.2 routes at the old paths.

**Resume notes 3 (2026-10-15, Phase 4 in progress):**
- T4.1 done, UNCOMMITTED in tree: ADR-275 block in `apps/api/src/db/schema.sql` (core `tournament_court/tournament/entrant/stage/group/group_entrant/match/slot/award/event`; scheduler `tournament_scheduler/_pin`; bridge `tournament_match_roster/award_roster`), Drizzle `apps/api/src/db/schema/tournament.ts` (exported from the barrel), `RETIRED_TABLES` trimmed to names not redefined. Standards + bootstrap/db-init tests green. ADR-275/276 text not yet appended to ADDENDA.
- Next T4.2: `apps/api/src/tournament/` — `load.ts` (rows → engine `TournamentState`, ids/slots mapping), `persist.ts` (diff state' vs state → Drizzle writes in one tx, version CAS, revision bump, events), `commands.ts` (run engine command with actor + minted ids), `courts.ts` (court CRUD). Then T4.3 views mapping to the kept wire types (see engine spec §7).
- A background agent is writing `docs/design/2026-10-15-backdrop-venues-plan.md` (owner's side request: modular venue backdrops; plan only, implementation after this sprint).

**Resume notes 2 (2026-10-15, start of Phase 4):**
- Pushed: `28863ed` (removal, ADR-270/271) and `ff0b7ab` (engine package, ADR-272/273/274; 68 tests; plumbing + `tournament-direction` standards rule done).
- Next: Phase 4 (T4.1 schema.sql core tables + Drizzle `db/schema/tournament.ts`; T4.2 `apps/api/src/tournament/` repos+commands; T4.3 read models + compatibility views mapping to MatchView/FixtureView/CourtView/TournamentView/TournamentBracketView/UpSoonView). ADR-275 data model in DB; ADR-276 points bridge; ADR-277 compatibility contract + surfaces.

**(old) Resume notes (2026-10-15, mid-Phase 3):**
- Pushed: `28863ed` (removal). Uncommitted, in tree: `docs/design/tournament-engine.md` (spec; ADR refs already renumbered to 272–277), `packages/tournament/` (core done + 42 tests green at 99.5% stmts; `scheduler/types.ts` written; `scheduler/index.ts` is a stub).
- Root plumbing for `@psd/tournament` NOT done yet (T2.1 remainder): root `typecheck`/`test` scripts, api+web tsconfig `paths`, `Dockerfile`/`Dockerfile-prd` COPY, `check-standards` SCAN_ROOTS + import-direction rule, `npm install` to link the workspace.
- Next: format plugins (`scheduler/formats/*`, shared bracket helpers), registry, planner (`scheduler/planner.ts`), `simulate()`, tests per format invariants; then ADR-272 (modules), ADR-273 (data model), ADR-274 (formats+planner) appended to ADDENDA.
- Hooks in this environment: every new file triggers a fact-gate (answer: importers + "proceed with execution"); git commit/push need the sandbox disabled (gpg keybox, ssh).


- **Exploration is complete:**
  - a full removal inventory of the old system, with every coupling point (summarised in §5 Phase 1);
  - an analysis of reference 5 and reference 6 (summarised in §3).
- **Owner questions are answered** (§1). No code has changed yet; plan mode is on.
- **Facts verified during exploration:**
  - PGlite runs `DO $$ … $$` blocks.
  - `resetSchema` drops only the tables named in the *current* `schema.sql`.
  - `ensureSchema` re-stamps the version on every apply, so a stale database would be silently re-stamped.
  - `eslint .` would also lint the untracked `tournament_reference/`.
  - `seed-demo.sql` holds three `court` rows, `point_config` tournament columns, and no tournament rows (ADR-203).
  - The kept surfaces depend on contract shapes that must not change.

## 3. What to take from the references, and what to fix

**Keep:**
- Discriminated slot sources: winner of a match, loser of a match, group place.
- Pure format generators kept separate from time and court assignment.
- Byes as structure, never phantom matches.
- One ranking rule, with a one-sentence explanation per row.
- Preview uses the same pipeline as create.
- An append-and-void awards ledger.
- Commands that return the full state.

**Fix** (gaps in both references):
- There is no stage entity, no correction path and no real manual mode.
- Nothing is frozen at kick-off, so a correction silently re-seats matches that were already played.
- Match-to-match references sit in JSONB with no foreign key.
- Re-planning ignores teams in live matches, and reference 5 also treats cancelled matches as busy.
- There is only one global court count.
- There is no concurrency control and no actor or audit trail.
- Draws are allowed in elimination matches.
- Rank slots can never resolve; Swiss pairing is never implemented.
- In reference 6, desk-staged match codes collide, and a tied final can end with no champion.

## 4. Target architecture

### 4.1 Modules and the dependency rule

```
packages/tournament (@psd/tournament) — pure TypeScript, no I/O, used by API and browser
  src/core/        types, slots + seating, match lifecycle, result rules, standings,
                   stage completion, correction impact, awards
  src/scheduler/   format registry (plugins), planner, simulate()
                   → imports core; core NEVER imports scheduler
apps/api/src/tournament/             core adapter: Drizzle repos, transactional commands,
                                     read models (imports @psd/tournament core only)
apps/api/src/tournament-scheduler/   scheduler adapter: activate, reconcile, contingency,
                                     terminate (imports the core adapter + scheduler)
apps/api/src/routes-tournament/ + routes-superadmin/tournament*.ts
                                     composition root: the only place both meet; also
                                     dispatches app effects (SSE, up-soon, leaderboard, roster bridge)
apps/api/src/views/tournament.ts     wire views, including the compatibility views for kept frontends
```

- A new `check-standards` rule enforces the import direction.
- The app is coupled to the tournament through one seam: `tournament_entrant.team_id → team`, plus a name snapshot.
- The core adapter never imports the team or participant modules. The composition root passes team data in.

### 4.2 Data model

Tables live in `schema.sql`. The Drizzle mirror is split across `db/schema/tournament.ts`, `tournamentScheduler.ts` and `tournamentBridge.ts`.

**Core tables:**

| Table | Columns and constraints |
|---|---|
| `tournament_court` | `id`, `court_number` (1–20, unique), `label`, `is_enabled`, `created_at`. Venue courts; facilitator default stations point at these. |
| `tournament` | `id`, `name`, `status` (`draft`/`live`/`closed`), win/draw/loss active-day points, `starts_at`, creator actor, `closed_at`, `close_reason`, `revision`. Partial unique index: at most one tournament that is not closed. |
| `tournament_entrant` | `id`, `tournament_id`, `team_id` (FK → `team`), `name_snapshot`, `entry_order`, `withdrawn_at`, `withdraw_reason`. Unique on (tournament, team) and on (tournament, entry_order). |
| `tournament_stage` | `id`, `tournament_id`, `ordinal`, `label`, `kind` (`pool`/`bracket`/`swiss`/`open`), `allows_draws`, `advance_count`, optional win/draw/loss overrides, `status` (`pending`/`active`/`completed`), completion actor, time and reason. |
| `tournament_group` | `id`, `stage_id`, `code`, `label`. |
| `tournament_group_entrant` | `group_id`, `entrant_id`, `seed`. |
| `tournament_match` | `id`, `tournament_id`, `stage_id`, `group_id` (nullable), `code`, `round`, `sequence`, `origin` (`structure`/`ad_hoc`), `status` (`scheduled`/`in_progress`/`completed`/`cancelled`), `court_id` (nullable), `planned_start_at` (nullable), `planned_minutes`, `started_at`, `ended_at`, starter actor, `score_a`, `score_b`, `result_kind` (`score`/`walkover`/`bye`), `winner_side` (`a`/`b`/null, where null means a draw), `is_voided` plus reason, `version`. Partial unique index: one live match per court. |
| `tournament_slot` | `match_id` + `side` (`a`/`b`) as the primary key; `source_kind` (`entrant`, `winner_of`, `loser_of`, `group_place`, `stage_place`, `pairing`, `vacant`); FKs `source_entrant_id`, `source_match_id`, `source_group_id`, `source_stage_id`; `source_place`; `label`; `seated_entrant_id` (nullable); `seated_at`; `seat_override_reason`. This is **requirement 10**: dependencies as real FKs forming a DAG. |
| `tournament_award` | `id`, `tournament_id`, `entrant_id`, `match_id` (nullable), `kind` (`result`/`manual`), `points`, `reason`, actor, `created_at`, void time, actor and reason. |
| `tournament_event` | `id`, `tournament_id`, `at`, actor (kind, id, label), `kind`, `match_id` (nullable), `reason`, `payload` (jsonb). Append-only history. |

- An actor is stored as (`kind` ∈ facilitator/superadmin/system, `id`, label snapshot).
- Scheduler writes use the seeded `system` facilitator row, never a sentinel string.

**Scheduler tables** (FK into the core only):

| Table | Columns |
|---|---|
| `tournament_scheduler` | `tournament_id` (PK, FK), `format`, `options` (jsonb), `status` (`active`/`terminated`), `match_minutes`, `changeover_minutes`, `rest_minutes`, `deadline_at`, `auto_advance`, `planned_at`, terminate time, actor and reason, `revision`. |
| `tournament_scheduler_pin` | `match_id` (PK, FK → `tournament_match`), `pinned_by`, `pinned_at`. Human placements that the planner must not move. |

**App-side bridge** (app FKs into the core; this is how "points to teams, members paid behind the scenes" is kept out of the core):

| Table | Columns |
|---|---|
| `tournament_match_roster` | `match_id`, `entrant_id`, `team_id`, `roster_snapshot`. Frozen at kick-off, keeping the ADR-005 rule. |
| `tournament_award_roster` | `award_id` (PK), `team_id`, `roster_snapshot`. Records who an award pays. |

The leaderboard's tournament column becomes the sum of non-voided `tournament_award` rows joined to the bridge rosters, plus the existing award batches.

### 4.3 Core behaviour (requirements 1–6 and 10)

**Lifecycle**
- `scheduled` → `in_progress` (start). Guards: the court is enabled and free, both slots are seated, and neither entrant is already playing.
- `in_progress` → `completed`. The score is the result. A winner is required when the stage forbids draws.
- `in_progress` → `cancelled`. Needs a reason; allowed for the facilitator who started the match, or a superadmin.
- Void and unvoid are superadmin actions and need a reason.
- Every write uses a compare-and-set on `version`. Score taps keep the existing from/to contract.

**Seating**
- A slot resolves from its source.
- It is frozen into `seated_entrant_id` when its match starts or its stage completes.
- A correction never moves an entrant who is already seated. Dependent matches that have already started are flagged in the event log for the desk; dependents that haven't started re-resolve.

**Corrections (requirement 4)**
- A superadmin may rewrite the score or winner, or record a walkover or void; a reason is always required.
- Result awards are voided and re-issued in the same transaction.

**Standings**
- Ordering: points (W/D/L rates) → score difference → points scored → entry order. Entry order is the visibly arbitrary final tie-break (P-10).
- Each row gets a one-line explanation.
- Results played by an entrant who later withdraws still stand.

**Stage advancement (requirement 5)**
- Completing a stage seats the `group_place` and `stage_place` slots from the table. Overriding the table needs a reason.
- When `auto_advance` is on, the scheduler completes a stage once every match is done, unless a tie straddles the cut line. In that case it waits for a superadmin.

**Awards (requirement 6)**
- Result awards are created at completion, using the stage rates or else the tournament rates. Zero-point awards are not written.
- A superadmin can make manual signed awards with a reason, and void them.
- The core only knows entrants. The bridge pays team members through the roster snapshots.

### 4.4 Scheduler (requirements 7–9)

**Format plugin interface**
- `{ id, label, team bounds, options schema, validate, build(entrants, options) → stages, groups and matches with code-referenced slots, onRoundOrStageComplete?(state) → more matches (Swiss), restPolicy }`.

**Formats**
- **open:** no structure and no scheduler row; manual only.
- **round_robin:** circle method with a rotating bye.
- **groups_knockout:** snake-seeded groups, top N advance, cross-group pairing, byes go to group winners, optional third place.
- **single_elimination:** classic or adjacent seeding, byes to the top seeds, optional third place.
- **double_elimination:** 4–16 teams, winners and losers brackets, a grand final, no bracket reset.
- **consolation:** exactly 8 teams — quarter-finals, consolation semis and a 5th-place match, semi-finals, final, 3rd place.
- **swiss:** ⌈log2 n⌉ rounds by default. Each next round is paired from the standings when the previous one completes, avoiding rematches. The bye goes to the lowest-ranked team that hasn't had one, and counts as a win.
- **flighted_quads:** team count a multiple of 4. Each flight plays SF 1v4 and SF 2v3, then a final and a 3rd-place match.
- **ironman:** single elimination with byes and zero rest; back-to-back matches are flagged.
- **points_rush:** pools of 3; group winners ranked overall; final between #1 and #2, optional #3 v #4.

**Planner** (pure and deterministic)
- List scheduling from now, over the enabled courts.
- A live match holds its court until the later of now and its start plus its duration.
- Pinned matches stay where they are.
- Matches whose teams aren't known yet get a forecast placement based on their dependencies.
- Applies rest and changeover time, interleaves groups by round, and back-fills gaps.
- The next-up match on each court stays put between re-plans.
- Output: placements, a fit summary (remaining matches, court-minutes, projected finish against the deadline) and a diff against the current plan.

**Adapter**
- **activate:** `build` → `core.createStructure` → plan.
- **reconcile:** runs after every write and on a 60-second tick.
- **contingency (requirement 8):** preview, then apply. Covers courts off, on or added, and changes to match or changeover minutes. Live matches are pinned.
- **terminate (requirement 9):** irreversible and needs a reason. Placements stay where they are and people take over: staging, moving and re-seating matches, and pairing later Swiss rounds by hand.

### 4.5 HTTP and the compatibility contract

Kept frontends keep their paths and wire types. The compatibility views map the new model onto them:
- A stage with `allows_draws = false` becomes `MatchStage 'knockout'` (`'third_place'` for a third-place match); `true` becomes `'group'`.
- Match status maps to the `FixtureView` statuses: `pending`, `claimed`, `played`, `walkover`, `skipped`.
- The planned court and time map to `suggestedCourtLabel` and `estimatedStartAt`.
- `winner_of`/`loser_of` slots map to `teamA/BFromSequence`. Other unresolved seats show the forecast label in `teamAName`, with `teamAId` set to null.
- `TournamentView.format`: round robin maps to `'round_robin'`; every other format maps to `'world_cup'`. The status comes from the kind of the active stage.

**Routes**
- **Facilitator (existing paths):**
  - `GET /api/tournament/courts`, `/courts/:id/current-match`, `/courts/:id/recent-teams`, `/schedule?courtId`.
  - `POST /api/tournament/matches` claims the queued match for that pair; otherwise it creates an ad-hoc match in the active stage.
  - `POST /matches/:id/score`, `/complete`, `/cancel`.
  - New: `GET /courts/:id/lineups`.
- **Participant and hall screen (existing):**
  - `GET /api/tournament/matches/feed`, `/lineups`, `/bracket`, `/api/teams/:teamId/matches`.
  - SSE frames `feed.match` and `team.upsoon`, and `teamUpSoon` on `/me/alerts`.
- **Superadmin (new, under `/api/admin/tournament/…`):**
  - draft and entrants, start, structure and standings, timetable;
  - match corrections, complete or re-seat a stage, manual matches, move or pin;
  - courts, contingency preview and apply, scheduler terminate;
  - awards, close, the event log, and a simulate preview.

**For every route:**
- a positive test and a wrong-party negative test;
- a row in `authorization-matrix.test.ts`;
- a new `PUSH_PAIRS` entry: match writes must call `publishFeedMatch`, award writes must call `pushLeaderboard`.

### 4.6 Surfaces

**Superadmin `/admin/tournament`**, with a subtab strip:

- **Control** (`/admin/tournament`)
  - *Setup:* format and its options, entrants picked from the current teams, points, timing and courts, then Start.
  - *Live:*
    - scheduler status and fit;
    - stages and standings, with complete and override;
    - the matches table: correct, void, walkover, cancel, move, re-seat, stage a new match;
    - courts and contingency with a preview diff;
    - awards, terminate scheduler, close, and the event log.
- **Timetable** (`/admin/tournament/timetable`): one lane per court across the day, with a now-line.
- **Simulator** (`/admin/tournament/simulator`): runs the engine in the browser. Teams default to the registered count and courts to the enabled count. "Use this plan" pre-fills Setup.

Other superadmin changes:
- The separate tabs **Courts**, **Court queue** and **Matches** are removed; they are folded into Control.
- **Points** keeps only the fringe settings.

**Facilitator:**
- New `/staff/court/:courtId/lineups` subtab: this court's queue, times and seat forecasts.
- `CourtPage` gains only the subtab strip and corrected scheduled/ad-hoc wording.

## 5. Staged work

Each subtask is one coherent commit, unless noted otherwise.

### Phase 0 — backup

0.1 Copy this plan to `docs/design/2026-10-15-tournament-overhaul-plan.md` and save a project memory recording the §1 decisions.

### Phase 1 — removal ("remove, then commit and push")

The gate for each subtask is: typecheck (this covers test files) + lint + standards + `build:web`. Suites are skipped per the owner. The phase ends with a single push.

**1.1 Delete these API files and directories:**
- `routes-tournament/`
- `routes-superadmin/{tournament,courtQueue}.ts`
- `lib/{courtProjection,matchResult,upSoonWatch}.ts`, `lib/tournament/`
- `views/tournament.ts`
- `db/entities/{courts,matches,schedule,stages,stagePairing,tournamentPlan}.ts`
- `db/schema/{tournament,manual,manualDraw}.ts`
- `manual/`, `manual-draw/`

Also unmount them in `app.ts`, and remove the up-soon interval from `index.ts`.

**1.2 Trim the shared API code:**
- `leaderboard.ts`: drop the roster and champion CTEs; keep `team_award_points` in the tournament column.
- `pointConfig`: fringe fields only.
- `awards`: drop the stage linkage and `awardSubjectOutsideTournament`.
- `teams.ts`: drop the withdrawal block.
- `rosterRepair`: drop the live-match warning.
- `clusters.hasScoringStarted`: scans and awards only.
- `accounts.ts` and `routes-auth`: the court station label returns null until the rebuild.
- `lib/operations` and `entities/operations`: drop the match and outside-team parts.
- `finalStandings`: drop team tables and the podium.
- `alerts`: `teamUpSoon` always returns "not up soon".
- `corrections`: drop the match parts.
- `config`: drop courts.
- `directory`: trim the bootstrap status.
- `routes-superadmin/teams` and `awards`.
- `routes-teams`: drop `/:teamId/matches`.
- `routes-participants`, the cache tags, and the `views` barrel.

**1.3 Schema changes:**
- Remove `court`, the tournament columns of `point_config`, the `tournament*` and `manual_*` tables, `award_batch.stage_id` and `team_award.stage_id`, the `'tournamentmatch'` audit target (the CHECK and its additive pair), and the `knockout_pairing` ALTERs.
- Update the Drizzle mirror.
- Bump `CURRENT_SCHEMA_VERSION` → 2.
- `resetSchema` also drops a `RETIRED_TABLES` list.
- **`ensureSchema` refuses a non-empty database stamped with an older version**, naming the remedy. This gets a new ADR, and the bootstrap tests are adjusted.

**1.4 Contracts:**
- Delete schemas, messages and types that no longer have an importer.
- **Keep** every symbol imported by the kept web files: `MatchView`, `FixtureView`, `CourtView`, `TournamentView`, `UpSoonView`, `TeamUpSoonView`, `TournamentBracketView`, the `Bracket*View` types, `readMatchOutcome`, the `STATUS_*` events, `SCREEN_SCENES`, `screenCopy` and `emptyStates`.
- Delete `manualDay.ts` and `manualDraw.ts`.

**1.5 Superadmin web:**
- **Delete:** `TournamentPage`, `CourtQueuePage`, `CourtsPage`, `MatchesPage` (with their tests), `useAdminTournament`, `useCourtQueue`, `acceptance/void-match`, `components/manual*`, `useManualDay`/`useManualDraw`, and `lib/api/manual*`.
- **Trim:** `lib/api/admin.ts`, `useAdminConfig`, `useAdminCorrections`, `PointConfigPage`, `DashboardPage`, `OperationsOverviewPanel`, `FinalStandingsPage` with `standingsCsv`, the team-repair consequences, `AuditPage`, `useAdminAccounts`, the routes in `App.tsx`, and the `AdminShell` tabs.
- **Never touch:** `routes-participant/`, `routes-screen/`, `routes-facilitator/`, `components/participant/`, or the hooks and API files those import.

**1.6 Tests:**
- Remove `seedTournamentReady`, `ensureFreeCourt` and `scoreOnce` from the harness.
- Delete the tournament-only test files and trim the mixed ones.
- Re-seed the authorization matrix from fringe data and drop the tournament rules.
- Fix the security, screen-key, status-stream and conditional-read tests, and any web tests that touch the deleted pages.

**1.7 Scripts, seed and e2e:**
- Remove the old match entries from `check-standards` `PUSH_PAIRS`.
- `seed-demo.mjs`: no courts; point config is fringe-only.
- Update `EXPORT_TABLES` in `demo-export-cli`.
- Regenerate `seed-demo.sql` with `./refresh-demo-seed.sh --skip-record`.
- Remove the court-marshal stress persona.
- Delete `e2e/exclusive/knockout-pairing.spec.ts` and the tournament legs of `e2e/full-event`; both are rebuilt in Phase 7.

**1.8 Docs:**
- ADR-270: the removal, including what is broken until the rebuild.
- ADR-271: the stale-version refusal.
- Add supersession-index rows for the removed identifiers.
- Mark the tournament rows in the `AGENTS.md` §4 invariants as superseded (append; never renumber).
- Add a superseded note to the shelved-handoff doc.
- `fds.md` is not edited; the divergence is recorded in the ADR.

**1.9 Commit and push:**
- Run the gates.
- Commit. The message must name the layers that were actually run and say the suites were skipped by the owner's direction.
- Push.

### Phase 2 — engine core (`packages/tournament/src/core`), tests first

2.1 Package plumbing:
- `package.json`, `tsconfig`, Vitest with a coverage floor;
- root typecheck and test scripts;
- `@psd/tournament` paths in the api and web tsconfigs;
- `COPY` lines in `Dockerfile` and `Dockerfile-prd`;
- add the package to `check-standards` `SCAN_ROOTS`, plus the import-direction rule;
- add `tournament_reference/**` to the ESLint ignores;
- an ADR for the module boundaries.

2.2 Types, the slot model, and resolution and seating.

2.3 Lifecycle, results, draw policy, walkover and bye.

2.4 Standings with explanations, and stage completion with overrides.

2.5 Correction impact and awards, plus an ADR for the data model and dependency slots.

### Phase 3 — scheduler (`packages/tournament/src/scheduler`), tests first

3.1 The `FormatPlugin` interface, the registry, and open, round_robin and single_elimination.

3.2 groups_knockout, points_rush and flighted_quads.

3.3 double_elimination, consolation and ironman.

3.4 swiss, with rounds generated dynamically.

3.5 The planner, fit summary, diff and `simulate()`, plus an ADR for formats and the planner.

Every format gets invariant tests:
- each entrant appears the expected number of times;
- the dependency graph has no cycles;
- no phantom byes;
- a third-place match exists only when two semi-final losers exist;
- Swiss never produces a rematch.

### Phase 4 — core adapter (`apps/api/src/tournament`)

4.1 Core tables in `schema.sql`, the Drizzle mirror, and standards passing.

4.2 Repos and transactional commands (revision, event log, actor).

4.3 Read models and the compatibility views in `views/tournament.ts`.

Integration tests run on real PGlite.

### Phase 5 — scheduler adapter and composition root

5.1 Scheduler tables and the adapter: activate, reconcile, contingency, terminate.

5.2 Facilitator and participant compatibility routes, plus court line-ups.

5.3 Superadmin routes.

5.4 The bridge and the re-wiring:
- roster snapshots and the leaderboard's tournament column;
- the final-standings podium;
- alerts and the up-soon watcher;
- operations, the dashboard, team repair and facilitator station labels.

5.5 A tick in `index.ts` that runs reconcile and up-soon.

Every route gets a positive test, a wrong-party test, a matrix row and its push pairs. ADRs: the points bridge, and the compatibility contract.

### Phase 6 — web

6.1 `lib/api/tournamentAdmin.ts` and the hooks `useTournamentControl`, `useTournamentTimetable` and `useTournamentSimulator`, with tests.

6.2 Control subtab.

6.3 Timetable subtab.

6.4 Simulator subtab.

6.5 Facilitator Line-ups subtab, plus the `CourtPage` subtab strip and wording.

6.6 Re-wire the rest of the superadmin console: dashboard readiness, the final-standings podium, the operations panel, and the court options for a facilitator's station. Plus an ADR for the surfaces.

### Phase 7 — finish

7.1 `seed-demo.mjs` creates courts through the new API (no tournament is started, per ADR-203). Regenerate `seed-demo.sql`.

7.2 Playwright, in `e2e/exclusive/` and the rebuilt full-event suite:
- setup → start;
- facilitator score, complete and ad-hoc;
- contingency preview and apply;
- terminate → manual control;
- stage advance;
- participant line-ups;
- the simulator.

7.3 Docs:
- `docs/design/tournament-engine.md`;
- bring the ADR impact sections in line with what shipped;
- update the `AGENTS.md` invariants.

7.4 Close the sprint:
- `./verify.sh`, `npm run test:e2e` and `npm run test:e2e:full-event` are green;
- the coverage floors are met by adding tests, never by lowering a floor;
- commit and push.

## 6. Verification

- **Per subtask:** `npm run typecheck && npm run lint && npm run standards && npm run build:web`, plus `npm test -w @psd/tournament` for the engine.
- **Proof that the kept frontends are untouched, at every commit:**
  ```
  git diff --stat 2bf76f4 -- apps/web/src/routes-participant apps/web/src/routes-screen apps/web/src/components/participant
  ```
  must be empty. The same check applies to the participant-imported files `lib/api/{participants,teams}.ts`, `lib/hooks/{useBoard,useTeams,useAlertsStore,useStatusStream,useHallScreen}.ts`, `lib/live/boardLive.ts` and `lib/api/statusStream.ts`.
- **End of sprint, automated:**
  - `./verify.sh`: typecheck, lint, standards, web build, and the API and web suites with the coverage ratchets;
  - `npm run test:e2e`;
  - `npm run test:e2e:full-event`.
- **End of sprint, by hand** (start with `./dev.sh` and seed the demo):
  1. Superadmin: run the simulator, then set up and start a tournament.
  2. Facilitator: the court console and the Line-ups subtab.
  3. Participant: Line-ups, the feed, and the LED and toast.
  4. Wet weather: disable a court, preview the re-plan, then apply it.
  5. Terminate the scheduler, then stage a match by hand.

## 7. Risks and mitigations

- **Stale databases reusing table names** (`tournament`, `tournament_match`, `tournament_stage`): boot refuses an older stamp, `RETIRED_TABLES` are dropped on reset, and the version is bumped.
- **The kept frontends drifting from the new backend:**
  - the compatibility views are typed against the existing wire types;
  - the participant jsdom tests stay untouched and must pass;
  - Playwright covers the participant line-ups and feed.
- **Correctness of nine formats:** invariant tests per format, plus a visual check in the simulator.
- **Courts confused by planner churn:** the next-up match per court stays put between re-plans, human moves are pinned, and contingency shows a diff before it is applied.
- **Coverage ratchets after large deletions:** measure at the end of Phase 1, and add tests rather than lowering floors.
- **Concurrency** (two marshals at once, or the scheduler tick racing a person): version compare-and-set, and one transaction per command.
- **Scope:** each phase can ship on its own, and Phase 1 is pushed alone. Formats are plugins, so if time is short the last-in order is Swiss → double elimination → consolation. Each can be dropped without touching the core.
