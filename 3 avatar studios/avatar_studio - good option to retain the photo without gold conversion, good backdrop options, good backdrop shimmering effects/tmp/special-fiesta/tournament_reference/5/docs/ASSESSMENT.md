# Assessment — from problems + simulators to a core tournament engine

Date: 2026-10-14. Inputs read in full: `GREENFIELD.md` (adopted as `CLAUDE.md`),
`tournament-problems-fds.md` (problem specification P-01…P-16 — it deliberately
names problems, not a system), `FDS_BUILDER.md` (spec-construction discipline,
used for `docs/SPEC.md` structure), and all eight simulator scripts.

## 1. What the eight simulators actually are

| File | Topology (the part that is essence) | What is incidental |
|---|---|---|
| `round_robin_generator.tsx` | Circle-method round robin; every pair meets once; BYE slot for odd fields | Court packing by earliest team/court availability |
| `single_elimination_simulator.tsx` | Seeded single elimination for 9–12 teams: play-in round for lowest seeds, top seeds bye into QFs | Hardcoded 8-bracket shape; only 9–12 handled |
| `consolation_bracket_simulator.tsx` | 8-team SE + losers-of-QF consolation + 3rd-place (losers of SF) — guaranteed 2 games | Fixed at 8 teams |
| `flighted_quads_simulator.tsx` | Teams split into flights of 4; per flight: SF (1v4, 2v3) then a flight final | Only 12/16 teams |
| `ironman_simulator.tsx` | **Not a topology** — SE topology scheduled back-to-back, flagging zero-rest matches ("Ironman" warnings) | Static hardcoded schedule |
| `points_rush_simulator.tsx` | Groups of 3 (round robin) → one final between #1 and #2 on the *overall* leaderboard | Fixed 12 teams, fixed 20 min |
| `swiss_system_scheduler.tsx` | Swiss: ⌈log₂N⌉ rounds; round *r*+1 pairings depend on records after round *r* (round barrier) | Placeholder text for record pools |
| `world_cup_format_simulator.tsx` | Group round robins → phase barrier → seeded knockout (1st A v 2nd B …) | Only 10/16/32 presets |

## 2. The common core they all share (the engine)

Every simulator, stripped down, does the same four things. That is the core;
everything else is a *generator* that feeds it:

1. **A match graph.** Matches with two slots and explicit dependencies
   (`deps: ['QF1','QF2']`). A slot is filled by exactly one of:
   a concrete team/seed, `Winner of X`, `Loser of X`, a group/flight rank
   (`1st Group A`), an overall-standing rank (`#1 Overall`), a Swiss record
   pool, or a BYE. **This is the placeholder strategy the user required**:
   no simulator predicts a winner; slots reference outcomes symbolically and
   would only resolve when a real match is finalised. (A-002)
2. **A dependency-aware scheduler.** Repeatedly: among matches whose
   dependencies have finished, start each at
   `max(earliest free court, teams/deps ready + rest)` for a fixed match
   length. This one algorithm appears, near-verbatim, in six of the eight files.
3. **Resources & time inputs.** Teams, courts, match length, start time —
   plus the tournament-length/fit question (FDS P-13).
4. **A lifecycle + ledger on top (absent from the simulators, required by the
   user and by FDS family C):** stage → live score → finalise → award points,
   with voiding. The simulators are read-only; the desk workflow is the core
   engine's reason to exist.

So the build is: **one generic engine** (graph + scheduler + lifecycle +
points ledger + standings) in `shared/`, **one thin persistence/API layer**
that stores and serves only that generic shape, and **format generators +
presentation specialisation on the frontend**. Backend responses are never
mode-specific (A-003).

## 3. Format catalogue (generators over the core)

Included (each is a pure `generate(teamCount) → MatchSpec[]`):
`round-robin`, `single-elimination` (generalised to any 2–32 with seeded
play-ins/byes — fixing the original's 9–12 limit), `double-elimination`
**(newly identified: the obvious missing bracket — winners/losers brackets +
grand final; every loser gets a second life)**, `consolation` (8),
`swiss`, `world-cup` (balanced groups, no group of 1 — P-12; top-2 cross-seeded
knockout), `flighted-quads` (flights of 4), `points-rush` (groups of 3 →
overall #1 v #2, plus #3 v #4 placement), `ironman` (SE topology with zero
rest enforced and zero-rest matches flagged — honouring the original file's
actual content). Each generator validates its team count and fails loudly
rather than drawing a group of one (P-12).

## 4. How the FDS problems map (checkable against "Solved looks like")

| Problem | Where it lands |
|---|---|
| P-01 field unknown until arrival | Simulation needs no real teams (Seed placeholders); live tournament is created over named teams present; manual staging absorbs latecomers |
| P-02 one agreed list | Single backend store; teams created once per tournament, order (seed) preserved |
| P-03 withdrawn team ≠ never played | Soft-delete only; played results and points stand; scheduled matches remain visible |
| P-04 scarce areas/teams | Dependency-aware scheduler; one answer from one graph, for every operator |
| P-05 plan meets afternoon | Desk can stage manual matches that count exactly like generated ones; contingency re-plan in the open |
| P-06 fair share | Scheduler never double-books a team; round-robin owed-pairings are the graph itself |
| P-07 what counts as a result | Match lifecycle states; draws are results in pool play and valid finals in elimination by desk decision (score is the record; finalise is the act) |
| P-08 one fact, recorded once | One row per match, one score; mutations rejected once final (409) |
| P-09 correcting without fiction | Live scores editable until finalise; **points voided with a reason, never edited/deleted** — the ledger is append-and-void |
| P-10 who is ahead | One standings rule everywhere: points → wins → score difference → scored → seed (arrival order, honestly arbitrary and labelled as such) |
| P-11 cutting without guessing | Knockout slots stay `Winner of`/`1st Group` placeholders until the desk finalises the feeding matches; nothing auto-advances a named team |
| P-12 awkward numbers | Generators validate counts; byes are slots, not phantom matches; no group of 1 |
| P-13 will it fit | Fit estimate on every simulation and tournament: match count × length ÷ courts vs tournament length, with overrun shown — an estimate, never a gate |
| P-14 moving finish line | Wet-weather contingency: change courts/match length mid-event; only not-yet-started matches are re-timed (live/final are history) |
| P-15 ending as an act | `close` refuses while a match is live |
| P-16 yesterday ≠ today | Closed tournaments remain readable; every day is its own tournament row |

Tensions (§4 of the problem spec) — where we landed: desk authority is real
(manual staging, direct points, void-with-reason) but always leaves a ledger
trace; the plan is a forecast (placeholder slots) until results make it real;
fairness of share is served by the scheduler's no-double-booking, not by
holding courts idle.

## 5. Shape of the build

- `shared/` — pure engine: types/slot algebra, scheduler, standings, fit,
  nine format generators, contingency re-planning. No I/O, no RNG winners.
- `backend/` — PGlite + Drizzle, generic REST over tournaments/teams/courts/
  matches/points-entries. Mode is a string + config JSON; there are no
  per-mode endpoints or tables.
- `frontend/` — consumes the generic graph; all specialisation (mode names,
  phase colours, bracket columns, slot labels, linkage rendering) lives here.
  Simulator mode works fully client-side from the same `shared/` generators;
  "Open as live tournament" persists the same graph for the desk.
