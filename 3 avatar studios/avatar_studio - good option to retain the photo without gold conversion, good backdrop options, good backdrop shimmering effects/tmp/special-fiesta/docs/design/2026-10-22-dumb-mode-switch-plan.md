# Switching the day to dumb mode mid-tournament — implementation plan (ADR-332)

**Date:** 2026-10-22 · **Status:** plan only; nothing built · **Event:** 5 Nov 2026
**Assessment this plans against:** `dumb-mode-mid-tournament-switch-assessment.md` (ADR-328)
**Register entry:** ADR-332 in `docs/addenda/ADDENDA.md`

## 1. Core motivation

The assessment's surface ask is "let facilitators switch courts to dumb awards". The motivation under
it is **day-of resilience inside a hard window**. The programme gives the tournament and fringe
activities 110 minutes (13:10–15:00, see `2026-10-22-tournament-day-of-lockins.md` §2). When fixtures
stop being workable (weather, time, missing teams, a venue problem) the people standing at the courts
must be able to move the whole room to "courts award points" in minutes, instead of asking the desk to
discard the day and set up a second one. Every minute of desk time costs matches.

There is a second, quieter motivation: **remove the accidental mode that exists today.** Nothing stops
a superadmin starting a dumb tournament beside a live captain's-ball one (ADR-293 allows one open
tournament per kind). When that happens the reads shadow the fixtures — `/matches/feed` and `/lineups`
answer dumb mode (`routes-tournament/reads.ts:120-127`, `:197-200`) and the station picker routes every
court to the award page (`lib/hooks/useStaffTools.ts:35-41`) — while the bracket stays live underneath,
still planned, with no agreed precedence. The switch has to be an explicit, guarded, audited act, and
the parallel start has to stop being possible by accident.

## 2. Owner decisions that bind this plan (2026-10-22)

| Question | Answer |
|---|---|
| Who may flip every court? | A facilitator **asks** and the desk **confirms**. The desk may also initiate the switch itself. |
| Reversible? | Owner's concern: dumb mode records no winners or losers, so on a return "what is our basis for team seeds?" — answered in §6. |
| Results after a return to fixtures | **Undecided.** Owner wants to think more. §7 lays out the options and an interim; it is not settled here. |
| Pre-arm the dumb tiers at setup? | Not asked. Assumed yes (assessment option E, recommended under every option). Reopen if wrong. |

## 3. What already exists and is reused unchanged

- The `dumb_courts` kind, `activateDumb` (`tournament-scheduler/scheduler.ts:121`), the tier column
  `tournament.dumb_tiers` and the tier editor (`SetupPanel.tsx`).
- The award and void routes with `client_uuid` replay (`routes-tournament/dumb.ts`), the points bridge
  (`freezeRosters`) and the court award page.
- `/dumb/status`, which already drives the facilitator station picker (`useStaffTools.ts`).
- `closeTournament`, which refuses over a live match and demands a reason when matches are unplayed
  (`packages/tournament/src/core/stages.ts:276`).
- The podium, which is already empty while any match is unplayed (`lib/finalStandings.ts`
  `tablePodium`), so an abandoned bracket is never crowned.
- Announcements (`routes-superadmin/announcements.ts`, `lib/statusBus.ts`).
- The append-only `tournament_event` log (event `kind` is free text up to 40 characters).

## 4. Model: a pause in the core, a mode at the edge

The test from ADR-329 applies: *does it still work with the scheduler stopped?* Pause does, so it is a
core fact. Choosing which tournament the room is looking at is cross-tournament orchestration, so it
belongs to the composition root, not the core or the scheduler (ADR-272).

### 4.1 Core (format-blind)
- `Tournament` gains `pausedAt: string | null`.
- Commands `pauseTournament` and `resumeTournament` in `core/stages.ts` beside `closeTournament`:
  superadmin only, reason required, events `tournament_paused` / `tournament_resumed`
  (added to `EventKind`).
- `startMatch` and `startPair` (`core/lifecycle.ts`) refuse a paused tournament with a new refusal
  `tournament_paused`; the copy goes in `packages/contracts/src/messages.ts`, never inline.
- Everything else stays allowed while paused: scoring and completing a live match, corrections,
  voids, awards, desk close. A pause stops *starting*, not *finishing*.

### 4.2 Scheduler
- `reconcile` (`tournament-scheduler/planning.ts:184`) returns early while the open tournament is
  paused, so nothing is re-planned or offered. On resume it plans from "now".
- It reads a core field only, so the arrow stays scheduler → core.

### 4.3 Edge: `apps/api/src/tournament-mode/`
New domain folder. It may import the core, the core adapter and the scheduler; none of them import it.
`check-standards.mjs` rule `tournament-direction` is extended to forbid the reverse.

- `tournament_mode_change` — append-only log of every switch: `from_mode`, `to_mode`, `reason`,
  actor (kind/id/label), `request_id` (nullable), `fixture_tournament_id`, `dumb_tournament_id`,
  `live_match_ids` (jsonb, how each was disposed of), `tier_snapshot` (jsonb), `client_uuid`
  **UNIQUE**, `at`. Never updated, never deleted. A return (§6) is a second row, not an edit.
- `tournament_mode_request` — a facilitator's ask: `id`, `requested_by_id/label`, `reason`,
  `court_id` (nullable), `client_uuid` UNIQUE, `created_at`, `resolved_at`, `resolution`
  (`confirmed` | `declined` | `expired`), `resolved_by_label`, `decline_reason`. Soft-resolved
  (non-negotiable 4). Partial unique index `WHERE resolved_at IS NULL` gives one pending ask at a time.
- `readOperatingMode(db)` → `'fixtures' | 'switching' | 'dumb'`: the latest mode-change row if there is
  one, otherwise derived from what is open (a dumb-only day is `dumb`, anything else `fixtures`). Cached
  with the existing `TOURNAMENT_TAG` so a switch invalidates it with the rest of the day.

### 4.4 Schema
`schema.sql` edited in place, additive only: `tournament.paused_at timestamptz`, the two tables above,
and matching `ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` repair lines in
the self-repair section so a database built earlier gains them on the next boot. Because that is
additive, **no `CURRENT_SCHEMA_VERSION` bump** (now 4) and no demo-seed regeneration are needed. The
Drizzle mirror under `db/schema/` is kept in step in the same change.

## 5. The switch

### 5.1 Precedence becomes explicit
Every surface that today asks "is a dumb tournament live?" asks `readOperatingMode` instead:

| Surface | Today | After |
|---|---|---|
| `GET /matches/feed`, `GET /lineups` (`reads.ts`) | dumb if any dumb tournament is live | follows the mode |
| `GET /dumb/status` (`dumb.ts:159`) | active if a dumb tournament is live | `active` iff mode is `dumb`, so the web picker needs no change |
| Desk console (`findDeskTournamentAnyKind`, `tournament/load.ts`) | prefers captain's ball | in `dumb` mode shows the dumb interval, with the paused bracket beside it |
| Desk `POST /close`, `POST /awards` (`desk-day.ts`) | resolves captain's ball first | resolves the tournament the mode names |
| Desk Start of a dumb draft | allowed beside a live bracket | **refused**, with copy pointing at the switch |

The last row closes assessment option A: the parallel start is no longer a way to get the mode.

### 5.2 The desk switch
`POST /api/admin/tournament/mode/switch { to: 'dumb', reason, tiers, clientUuid, requestId? }`,
superadmin only, one transaction:

1. Pause the fixture tournament (core command).
2. Snapshot the tiers. They prefill from tiers pre-armed on the fixture draft (stored in the existing
   `dumb_tiers` column of the captain's-ball row, edited with the existing `TierEditor`) and are
   editable at switch time. The snapshot is written to the mode row, so later edits rewrite no history.
3. Create and activate the dumb tournament over the fixture tournament's non-withdrawn entrants.
4. Write the mode-change row; resolve `requestId` as `confirmed` if present.
5. Publish an announcement ("Courts are now awarding points. See Results.") through the existing
   announcements path, so participant surfaces need no new code.

`createDraft` (`tournament/setup.ts:73`), `activateDumb` and `runCommand` (`tournament/commands.ts`)
each open their own transaction today. The change adds transaction-accepting variants of each; the
existing functions become thin wrappers so no caller changes.

Double tap: the same `clientUuid` replays the first result and switches once.

### 5.3 Live matches
The switch never reroutes a court out from under a match being scored.

- The pause already stops any new start. If matches are `in_progress`, the mode is written
  `switching`, and the response lists them by court.
- Court pages of live matches keep scoring and completing as today. The completion route
  (`actions.ts:107`) checks, after a successful completion, whether the mode is `switching` with no
  live match left, and if so finishes the transition (steps 3–5 above deferred to that point).
- The desk may instead hand a live match back or call it off first. The desk hand-back
  shipped as ADR-330 (ADR-329 F4), so a structure match stuck on a dead phone can be returned to the
  queue, still owed, before the switch. Re-verify the route when phase 2 is written.

### 5.4 The facilitator ask
- `POST /api/tournament/mode/requests { reason, courtId?, clientUuid }` — any facilitator. A second ask
  while one is pending returns the pending one with its author and time, so two marshals do not stack.
- `GET /api/tournament/mode` — the mode and the pending ask, for facilitators and the desk. Polled by
  the existing station picker and court page, like `/dumb/status`.
- Desk **confirm** is the §5.2 switch with `requestId`. **Decline** is
  `POST /api/admin/tournament/mode/requests/:id/decline { reason }`.
- An ask expires after a short window (proposal: 10 minutes) so a forgotten ask cannot be confirmed
  hours later against a different situation.
- UI: "Ask to switch courts to dumb awards" on the station picker and the court page (reason required,
  one confirm naming what will happen). On Tournament Control a banner with the ask, who made it, and
  Review / Decline; Review opens the §5.2 form. Once the mode is `dumb`, the court page of a court with
  no live match redirects to the dumb court page.
- Authority is explicit and distinct from holding a station (assessment §8): the ask is a facilitator
  capability, the switch and the decline are superadmin. Facilitators on fringe and swag stations are
  untouched — only courts change.

## 6. Reversal, and the seeds question

The owner's concern was: when going back, "what is our basis for input team seeds?" **There is none to
derive, and none is needed.** The plan never rebuilds a bracket.

- The fixture tournament is **paused, not closed and not replaced.** Its stages, groups, matches, frozen
  seats and played results all stand. A seat that reads "Winner of #7" still resolves from the paused
  bracket's own results. Resuming continues exactly where it stopped.
- Dumb awards pay cluster points through the ordinary award ledger. They never advance anyone, repair a
  bracket, or write a result into one (ADR-321). So a dumb interval gives the bracket nothing to seed
  from and takes nothing from it.
- Building a **fresh** bracket after a dumb interval *would* need seeds, and dumb mode produces no
  basis for them. That case is out of scope. If it were ever wanted, seeding would be by original entry
  order, never by tier totals, because tier totals are a points ledger and not a strength ranking.

What a return actually costs is elsewhere:

1. **Time.** After a dumb interval the unplayed fixtures may no longer fit before 15:00. Fitting them
   needs ADR-329 F13 (retime unstarted matches, phase 3) or F12 (restage unstarted stages, phase 4), or
   the day is abandoned. The planner already reports fit against the hard stop (P-14).
2. **Results** (§7).
3. **More than one dumb interval.** `dumbDay` (`dumb.ts:45`) shows only the latest dumb tournament, so
   a day that switches twice would lose the first interval's award lines from Results.

The mechanics of a return are small: close the dumb interval, resume the fixture tournament (core
command), write a second mode-change row, re-plan from now. Because the cost is in 1–3, not in the
mechanics, the recommendation is:

- Build the pause (§4) now, since it is what makes the switch safe at all.
- Treat the switch as **one-way for 5 Nov**: a day that goes dumb ends dumb, and closes with the
  existing Close-with-reason. The podium is already empty for an unfinished bracket, so nobody is
  crowned from a table that never finished. Communications must say the tournament ended incomplete.
- Build the return act only after a go/no-go gate (phase 5), and only if the owner wants it once the
  Results decision is made.
- The 15:05 exhibition match (SMT vs the winner) is off-app (ADR-329 F6). If the bracket is abandoned
  there is no winner to name; that is the owner's call on the day, not something the app computes.

## 7. Results for a mixed day — options, owner to decide

Even a one-way switch needs this answered, because the day already contains matches before the switch.
Today Results shows either matches or award lines, never both: the feed answers `mode: 'matches'` or
`mode: 'dumb'` (`reads.ts:115-130`), and once a dumb tournament is closed its lines still show only
because `dumbDay` falls back to the last closed one.

| Option | What a participant sees | Cost |
|---|---|---|
| **A. Follow the mode** (interim) | Before the switch: match results. After: the award ledger only. Matches played earlier disappear from Results. | None beyond §5.1. Loses information the participant saw. |
| **B. Sectioned** | Award ledger first, then an "Earlier: match results" section. | Widen the feed `mode` enum with `'mixed'`; one participant render. |
| **C. One merged timeline** | Matches and "Team XXX is awarded XXX points!" lines in time order. | As B, plus a merged sort and a new row type; the hall screen reads `items` too and would need a decision. |

The feed contract already carries `items` and `awards` side by side (`MatchFeedPage.tsx`,
`DumbResults`), so B and C are a render and enum change, not a data-model change.

**Recommendation: ship A as the interim with phases 1–3, and build B as phase 4.** It is the smallest
surface that does not erase what the room has already seen. **This is not decided**; the owner asked to
think about it, and phase 4 does not start until they do.

## 8. Phases

Each phase is tests first (non-negotiable 2), has a positive and a wrong-party test per route,
`data-testid` at authoring (`tournament-mode-banner__review`, `ask-switch__submit` and so on), a
behaviour-tracking ADR in the same change, and passes `npm run verify`.

1. **Pause and precedence.** Core pause/resume and the start refusal, scheduler skip, `readOperatingMode`,
   the precedence table in §5.1, the refusal of a parallel dumb Start. No switch yet; the desk can pause
   by hand.
2. **The desk switch.** §5.2 and §5.3: pre-armed tiers, `switching` completion, idempotency,
   announcement, the mode-change log.
3. **Facilitator ask.** §5.4: the ask, confirm, decline, expiry, banner, court-page redirect.
4. **Mixed-day Results** (B), after the owner decides.
5. **Return to fixtures** (gated): resume, close the dumb interval, multi-interval feed, and the retime
   dependency on ADR-329 phase 3. Go/no-go after phase 3.

## 9. Verification

- **Core** (`packages/tournament/src/tests`): pause refuses start and pair-start, allows score,
  complete, correct, void, award and close; resume lifts it; only a superadmin may pause.
- **Integration** (`apps/api/src/tests/tournament-mode-switch.test.ts`, real PGlite, through
  `app.request()`):
  - `POST /matches` refused while paused; the scheduler does not re-plan while paused;
  - a live match keeps scoring after the switch is requested, and the transition completes on the last
    completion;
  - a duplicate `clientUuid` switches once and a duplicate ask returns the pending one;
  - wrong-party negatives: a facilitator on desk switch and decline, a participant on the ask, a
    facilitator confirming;
  - `/dumb/status`, `/lineups` and `/matches/feed` follow the mode, and a parallel dumb Start is refused;
  - dumb awards after the switch land on the cluster board through the roster frozen at award time.
- **Authorization matrix** (`authorization-matrix.test.ts`): the new routes listed with their roles.
- **Hook tests** for the ask and the picker redirect.
- **Size loop** (`tournament-sizes.test.ts`): a hybrid day switched mid-group-stage at 7–12 teams,
  asserting no stranded live match, no lost or double-paid award, and that a participant can still read
  what they saw.
- **Playwright** (`e2e/…/mode-switch.spec.ts`, written failing first): a facilitator asks, the desk
  confirms, the court page reroutes, a tier is awarded, the Results line appears. Persisted state read
  back from the API, not the screen (AGENTS-testing §1.1).
- **Bite checks** recorded in the ADR: remove the start refusal, the `client_uuid` unique index, the
  live-court guard, and the dumb-Start refusal, and watch a test fail each time.

## 10. Risks and open questions

- **Results** (§7) — owner undecided; phase 4 waits on it.
- **Return** (§6) — recommended one-way for 5 Nov; confirm that is acceptable.
- **Ask expiry** (§5.4) — 10 minutes is a proposal.
- **Pause is a core change.** It touches `Tournament`, two commands, one refusal code and two
  guards. It is small, but it is the only core change in the plan and should be reviewed as one.
- **Not in this plan:** a per-court switch (the ask is venue-wide, per the assessment), a new tier
  vocabulary, offline queuing of a switch, and any hall-screen treatment of dumb mode (unchanged since
  ADR-321).
