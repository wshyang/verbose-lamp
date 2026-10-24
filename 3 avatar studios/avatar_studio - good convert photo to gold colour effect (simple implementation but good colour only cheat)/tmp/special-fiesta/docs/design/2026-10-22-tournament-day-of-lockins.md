# Tournament day-of lock-ins — findings

**Date:** 2026-10-22 · **Status:** findings only; no code changed · **Event:** 5 Nov 2026
**Resolution plan:** ADR-329 in `docs/addenda/ADDENDA.md` (plan only; nothing built).

## 1. Question and method

Where would a real disruption on the day force a change of plan that the app refuses to let us
make? Read-only walk of the tournament engine (`packages/tournament/src/core`), the scheduler
(`packages/tournament/src/scheduler`, `apps/api/src/tournament-scheduler`), the desk and court
routes (`apps/api/src/routes-tournament`) and the superadmin and facilitator screens
(`apps/web/src/routes-superadmin/tournament`, `routes-facilitator/CourtPage.tsx`). Nothing was
run; each finding cites the line that blocks it. Re-verify before planning a fix, because the
code moves.

## 2. The constraint that matters

Agenda (SGT, from `seed-demo.sql` `agenda_item`):

| Time | Item |
|---|---|
| 12:00 | Arrival and registration |
| 13:10–15:00 | Captain's Ball tournament and fringe activities — **110 min hard window** |
| 15:00 | Activities conclude |
| 15:05–15:20 | Exhibition: SMT vs the winning team |
| 15:25–15:35 | Closing speech |
| 15:35–15:45 | Prize presentation |

Demo seed: 3 courts, 7 teams, default pipeline "group stage then knockout" (15 min group
matches, 20 min knockout). Any block that costs more than a few minutes of desk time on the day
costs matches.

## 3. Owner dispositions (2026-10-22)

| Finding | Disposition |
|---|---|
| F5 level knockout score | **Facilitator decides at the court** (scissors-paper-stone or coin toss). Plan it. |
| F6 exhibition match | **Off the app.** Out of scope. |
| F9 scheduler stop one-way, F10 withdraw one-way, F11 no late team, F14 close final | **YAGNI.** Teams cannot withdraw, the tournament is not closed early, late teams are not entertained. Not planned. |
| F12 pipeline frozen after Start | **Plan it**, scoped to stages that have not started: "if a stage hasn't started we should not be locked into it." |
| F13 timing | **Plan it**: amend the timing of matches that have not started, to speed the rest of the day. |
| F1–F4, F7, F8 | Not yet dispositioned; to be walked through in planning. |

(F-numbers keep the numbering of the first assessment, so F6, F9–F11 and F14 have no section
below: they are closed by the dispositions above.)

## 4. Findings

### F1 · Walkover can only go to side A — hard block
`MatchesPanel.tsx:67` hardcodes `winnerSide: 'a'` (button reads "Walkover to {side A}").
The engine takes either side (`recordWalkover`, `corrections.ts:121`). If A's team does not
appear, there is no screen path to give B the win.

### F2 · Closing a stage cannot overrule the table — hard block
`lib/api/tournament.ts:121` always posts `overrides: []`. The route and engine accept overrides
with a reason (`completeStage`, `stages.ts:198`; `desk-day.ts:93`), and the engine even widens
an override to every fixture reading that place. No screen sends one. Consequences on the day:
a qualifier who is absent or hurt cannot be replaced; a tie on the cut line (which the
scheduler refuses to settle itself, `tie_on_cut`) cannot be settled by the desk's coin toss.

### F3 · A seat that must change cannot be changed, and the warning is invisible — hard block
- `reseat` is implemented (`corrections.ts:173`) and routed (`desk-matches.ts:102`) but no
  screen calls it (no `reseat` anywhere under `apps/web/src`).
- When a correction would have moved an already-frozen seat the engine emits a `seat_conflict`
  event (`corrections.ts:25`). That event is not surfaced in any view, contract or screen
  (only `corrections.ts` and `types.ts` mention it), so the desk is not told a conflict exists.

### F4 · Desk "Call off" on a bracket match kills the bracket — hard block
`POST /matches/:id/cancel` (`desk-matches.ts:112`) always runs `cancelMatch`, which is
permanent. A cancelled match has no winner, so a downstream `winner_of` seat never resolves:
start is refused (`seat_unresolved`) and walkover is refused (`corrections.ts:134`). The
engine's hand-back (`releaseMatch`, `lifecycle.ts:286`) puts a structure match back in the
queue and permits a superadmin, but it is only reachable through the facilitator route
(`actions.ts:129`, `requireFacilitator`). The superadmin cannot reach it. Related: a live
match can only be handed back by the facilitator who started it (`lifecycle.ts:292`), so a
facilitator whose phone dies strands their match.

### F5 · A level knockout score cannot be finished by a person — hard block
`decideWinner` (`lifecycle.ts:219`) refuses a level, non-zero knockout score with `play_on`;
only 0–0 accepts a named winner. The court console says "drawn — play on, the next point
decides it" (`CourtPage.tsx:312`). `assertResultMatchesScore` (`lib/matchResult.ts`) enforces
the same at the route. Our SOP is a coin toss or scissors-paper-stone, so the facilitator
today has to fabricate a point. Note the tension: ADR-114/152 deliberately make the score
decide the match, so this is a decision to amend, not an oversight.

### F7 · Open stage has no close button — needs verification
`DayPanel.tsx:127` hides "Close this stage" for `kind === 'open'` and the scheduler skips open
stages (`scheduler.ts:151`), but the engine does not forbid it (`checkCompletable`,
`stages.ts:184`). A stage fed by an open stage depends on that close for its roster
(`stage_not_fed`). Not exercised here; confirm whether the hide is deliberate (ADR-325) before
treating it as a defect.

### F8 · A fed open stage refuses knocked-out teams — design question
`checkRoster` (`lifecycle.ts:60`) refuses any team that did not come through the feeder
(`not_in_stage`). Deliberate (ADR-325), but it means no filler or friendly match for teams
knocked out while courts sit idle. Only matters if we run open play after the bracket.

### F12 · A stage cannot be edited after Start — plan (scope: not-yet-started stages)
No route edits stages, groups or fixtures after `activate` (`desk-setup.ts:124`); the only
lever is closing and recreating the tournament, which loses the tables (one open tournament
per kind, `setup.ts:73`). Two facts shape any fix:
1. **"Started" must be measured on matches, not `stage.status`.** The next stage flips to
   `active` the moment its feeder closes (`stages.ts:165`), before any of its matches runs.
2. **Seats freeze when the feeder closes** (`seatDownstream`, `stages.ts:99`) and the roster is
   frozen into `tournament_stage_entrant`. A stage that is unstarted but already fed has
   frozen people in it, so editing it means re-dealing from the roster, not from forecasts.

### F13 · Timing cannot be changed for explicit-length stages, or the hard stop — plan
`applyContingency` retimes only stages that inherited the scheduler's length
(`planning.ts:51`, `control.ts:65`); a stage carrying its own length (default knockout: 20 min)
is skipped, so running late cannot shorten it. The hard stop (`deadline_at`) and rest minutes
are written once at activation and have no edit path. The planner already reads per-match
`plannedMinutes`, so the data model supports per-match timing; the write path is missing.

## 5. Traps (not blocks, but they compound)

- Withdrawn teams still rank in group tables (`groupStandings` filters nothing on
  `withdrawnAt`). The console still shows a Withdraw button even though policy is to not
  withdraw; if it is ever used, the team can be seated into the knockout and then refused at
  start.
- A live match cannot change court without losing its score (hand-back resets to 0–0,
  `lifecycle.ts:293`).
- A court switched off with a pinned match still plans that match onto it until the pin is
  released.

## 6. Accepted (YAGNI, per owner)

Scheduler resume, withdraw reinstatement, reopening a closed tournament, adding a late team,
and an in-app exhibition match are intentionally absent and stay absent.
