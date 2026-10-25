# Switching tournament operation to dumb mode mid-tournament — assessment (ADR-328)

> **Plan:** `2026-10-22-dumb-mode-switch-plan.md` (ADR-332) turns this assessment into phases.

> **Assessed, not built.** ADR-321 built dumb courts as a tournament kind chosen when a
> draft is created and started. This document assesses only how a facilitator-facing
> surface could switch the day's *operation* to dumb mode after a fixture tournament is
> already live. No switch, endpoint, permission or state change is implemented here.

## The ask

On the day, the room may decide that fixtures are no longer workable — weather, time,
missing teams, a venue problem — and that courts should simply award points instead.
Facilitators should be able to make that switch easily, including in the middle of a
tournament, rather than asking a superadmin to discard the day and set up a second one.

## What exists today

1. **Dumb mode is a kind, fixed at draft creation.** The setup draft carries
   `kind: 'captains_ball' | 'dumb_courts'` (`apps/web/src/routes-superadmin/tournament/SetupPanel.tsx`);
   Start for dumb courts requires the dumb Start and builds no fixtures
   (`apps/api/src/routes-tournament/desk-setup.ts`). There is no operation that changes
   a live tournament's kind, and changing it would be wrong: the live captain's-ball
   tournament owns stages, groups, matches, claims and results that a kind flip cannot
   honestly rewrite.
2. **One tournament may be open per kind** (ADR-293), so a dumb tournament *can* be live
   beside a captain's-ball one. That is a parallel day, not a switch: nothing records
   which kind is operating, pauses the fixture scheduler, or disposes of live matches.
3. **Live dumb mode already shadows the room's surfaces.** While a dumb tournament is
   live, participant Results answer award lines and Line-ups answer "no line-ups"
   (`apps/api/src/routes-tournament/reads.ts`), and the facilitator station picker
   routes every court to the dumb award page (`apps/web/src/lib/hooks/useStaffTools.ts`,
   driven by `GET /api/tournament/dumb/status`). Simply starting a dumb tournament
   beside a live fixture tournament would therefore hide fixtures from participants
   and courts from facilitators while the fixture tournament stayed live underneath —
   an accidental mode, with matches still planned and no agreed precedence.
4. **Facilitators cannot start tournaments.** Setup, Start and Close are superadmin
   desk routes. A facilitator's authority today is at a station: start and score a
   match on a court, or award and briefly undo dumb-court points at a court. Flipping
   every court in the venue is a larger act than either.
5. **Dumb awards are safe to keep.** They pay through the ordinary award ledger and
   points bridge with the tier label and points snapshotted per award (ADR-321), so
   awards made during a dumb interval need no migration if fixtures later resume;
   they stand as points, with the dumb tournament as their audit home.

## Options

| Option | Shape | Assessment |
| --- | --- | --- |
| **A. Start a parallel dumb tournament (today's machinery)** | A superadmin creates and starts a `dumb_courts` tournament beside the live one. | No build, but it is not a switch: fixture matches stay live and schedulable, participants and facilitators are shadowed by whichever precedence the reads happen to apply, and closing the dumb day afterwards resolves against the captain's-ball tournament first. Unsafe as an operating procedure. |
| **B. Desk switch (superadmin only)** | A "Switch courts to dumb awards" act on Tournament Control: guards pass, the fixture scheduler pauses, a pre-armed dumb day starts, facilitators are rerouted automatically. | Safest authority and audit, and the facilitator experience is still easy — their courts simply change — but the person at the court cannot start it when the desk is unreachable. |
| **C. Facilitator request, desk confirm** | Any facilitator taps "Ask to switch courts to dumb awards" (with a reason) at the station picker or court page; the desk confirms; the switch itself is option B. | Easy to *initiate* from the court, keeps venue-wide authority at the desk, and the request is itself the audit trail. Costs one round trip at the moment the room is busiest. |
| **D. Facilitator direct switch** | A facilitator performs the whole switch from the court surface, behind the guards below. | The easiest on the day, and consistent with facilitators already being trusted to score matches and award points — but the blast radius is every court and every participant screen, so it needs an explicit venue-level permission, a reason, and a confirm that names what will happen to live and scheduled matches. |
| **E. Pre-armed fallback (foundation for B–D)** | At setup, the desk optionally configures dumb tiers as the day's contingency. A switch then never has to invent tiers or entrants under pressure; it only flips operation. | Recommended under any option: the switch becomes one guarded act instead of a setup session. Without pre-arming, the switch flow must collect and validate tiers and the team list first. |

**Recommendation:** build E first, then C as the default authority — a facilitator can
raise the switch from any court in two taps, and the desk's confirm is the same guarded
act as B. If the owner decides facilitators are trusted with the whole venue, D is the
same machinery with the confirm performed at the court instead of the desk; the guards,
state handling and audit below do not change. Do not ship A as a procedure.

## What a real switch must do

A switch is an **operating-mode transition for the day**, not a mutation of either
tournament. The state machine the surfaces would need:

`fixtures operating → switching (no new match starts) → dumb operating (fixture
tournament paused, preserved) → returning (no new dumb awards) → fixtures operating`,
or `→ fixtures closed incomplete` when the room abandons the bracket for good.

1. **Guards before anything moves.** Refuse while any match is in progress, listing the
   live matches by court; the court's own page must never be rerouted from under a
   match being scored. Each live match is first finished, or voided/cancelled by the
   desk with a reason. No new match may start once the transition begins (the
   scheduler pauses and court pages say why).
2. **The fixture tournament is paused, not closed.** Its played results, standings and
   paid points stand; unplayed fixtures stay scheduled but are offered nowhere. That
   makes the switch reversible: returning closes the dumb interval and resumes the
   fixture day, replanned from that moment. A permanent abandonment is a separate,
   explicit desk act that closes the fixture tournament incomplete — no champion or
   final placings are computed from stages that never finished.
3. **The dumb interval is its own tournament.** Started from the pre-armed tiers over
   the same teams, closed when the day returns to fixtures (or at day's end). Its
   awards keep their tier snapshots and court provenance; closing it deletes nothing.
4. **Precedence becomes explicit.** Participant reads and the station picker follow
   the operating mode, not "a dumb tournament happens to be live". While dumb mode
   operates, Line-ups says so and Results shows award lines; the fixture day is not
   silently shadowed by a parallel tournament nobody switched to.
5. **Results after a return need a decision.** Today, once fixtures operate again,
   participant Results show matches again and the dumb award lines disappear from
   that tab (the points remain on the cluster board). For a mixed day the honest
   surface is one feed that keeps both: match results and "Team XXX is awarded XXX
   points!" lines in time order, or at least a dumb-interval section that stays
   visible after the return. This is a participant-facing decision, not bookkeeping.
6. **Standings and the day's story.** Dumb awards pay cluster points only; they do
   not advance anyone, repair a bracket, or produce a tournament champion. If the
   fixture day is abandoned, communications and final standings must say the
   tournament ended incomplete rather than crowning the table as it stood.
7. **Audit and idempotency.** Record who switched, when, why, the mode before and
   after, how each live match was disposed of, and the tier set used — in the
   tournament event history, with the switch act carrying a client id so a double
   tap cannot switch twice. Returning is a second recorded act, never an undo that
   rewrites the first. Facilitators and participants should see a banner naming the
   new mode the moment it lands (the existing dumb-status poll already reroutes
   facilitators; it would follow the operating mode instead).
8. **Permissions.** Whichever option is chosen, the switch act is authorized
   explicitly (desk role, or a facilitator permission distinct from running a
   court), not implied by holding a station. A switch also outranks station
   assignment: facilitators mid-round at fringe or swag stations are unaffected —
   only courts change what they are.

## Phasing, if the owner approves

1. **Pre-arm and precedence:** contingency tiers on the fixture draft; an explicit
   operating-mode read that participant reads and the station picker follow.
2. **The guarded switch:** pause the scheduler, live-match guards, start/close the
   dumb interval, return-to-fixtures; desk surface first (option B), with the
   state machine and audit above.
3. **Facilitator initiation:** the request act (option C) on the station picker and
   court pages; promote to a direct switch (option D) only by policy change.
4. **Mixed-day Results:** one participant feed for a day that ran both modes.

Each phase wants the size-loop treatment before it ships: a played hybrid day
switched mid-stage at several team counts, asserting no live match is stranded, no
dumb award is lost or double-paid, the return replans the unplayed fixtures, and a
participant can still read everything they saw in each mode.

## Questions for the owner

- Who may flip every court: any facilitator directly, a facilitator requesting with
  desk confirm, or the desk alone?
- Is the switch expected to be reversible (pause fixtures, award for a while, resume),
  or a one-way abandonment of the bracket?
- Should dumb tiers be pre-armed at setup as the day's contingency, or chosen at the
  moment of switching?
- After a return to fixtures, must dumb award lines stay on participant Results?
- Does a dumb interval affect anything beyond cluster points — in particular, may it
  ever stand in for a stage result or a placing?
