# The "dumb" tournament mode — assessment and plan (ADR-320)

> **Built.** This plan was executed as ADR-321 (2026-10-21): the `dumb_courts` kind, tiered
> facilitator awards at courts, no line-ups, and a Results feed of award lines only. Where the
> owner's later specification differed from this plan — Results as award entries and Line-ups
> empty *while dumb mode operates* — ADR-321 governs.

**Status:** assessed and planned, **not built**. This document is the plan a future
change implements; ADR-320 records the assessment so the reasoning is not lost.

## The ask

A second, parallel way to run courts on the day, for when nobody wants a bracket:

- Courts behave like fringe stations. A court master stands at a court, and when a
  game finishes — or whenever they judge it right — they award the **team** a
  configured tier of points directly.
- **No QR scanning** of participants, **no winners and losers**, no fixtures, no
  tables, no stage handover. The court's whole job is: pick a team, pick a tier,
  award.
- It runs **in parallel** with the real tournament: the same day can have a
  captain's-ball bracket on some courts and dumb courts on others (or dumb courts
  only), and every point lands on the same cluster leaderboard.

## What already exists (the assessment)

The expensive parts of this mode already exist and are tested:

1. **A team award that spreads to people.** The engine's manual award
   (`awardPoints` in `packages/tournament/src/core/awards.ts`) pays an entrant;
   the points bridge (`apps/api/src/routes-tournament/bridge.ts`, ADR-276) freezes
   the team's roster **as it stands at the moment of the award** and the
   leaderboard pays **every member the full amount** — so a mixed-cluster team's
   award credits each member's own cluster, per person, in the tournament column.
   This is exercised end-to-end (see "Test-suite assessment" in ADR-320).
2. **A facilitator station pattern to copy.** The swag counter
   (`SwagStationPage`) is the shape: an armed item that stays armed, a confirm
   that names the item and the recipient before anything moves, a ten-second
   undo, and a visible round log. The fringe station adds the armed-tier row
   (ADR-092/116). A dumb court is the swag counter with *teams* in place of
   people and *tiers* in place of items.
3. **A parallel-tournament slot.** Tournaments are one-open-**per kind**
   (ADR-293) and `TournamentKind` is explicitly "add values here when a second
   game type is implemented". A dumb tournament as a second kind runs beside
   `captains_ball` without touching its lifecycle.
4. **The facilitator station picker** already lists courts, fringe activities and
   swag stations from one read, so dumb courts have a home to appear in.

What does **not** exist: a facilitator-authorized team award (today
`POST /api/admin/tournament/awards` is superadmin-only), a tier configuration
for courts, a team picker for facilitators that is not match-based, and any
idempotency on manual awards.

## Recommended shape

Keep the core minimalist: the dumb mode is an **extension beside the core**, not
a new engine concept. The engine learns nothing; it already knows how to pay a
team.

1. **Kind, not format.** Add `'dumb_courts'` to `TournamentKind` (contracts
   `tournamentKinds`, the `tournament.kind` CHECK in `schema.sql`, the Drizzle
   mirror). A dumb tournament is created with a name, its teams (entrants, seed
   order irrelevant but harmless), and its tier set — and is "started" with no
   format, no stages, no matches: activation for this kind writes the entrant
   rows and flips the status to `live`, nothing else. One dumb tournament and
   one captain's-ball tournament can be live at once (the per-kind index
   already allows exactly this).
2. **Tier configuration on the tournament, snapshotted at award time.** A small
   ordered list of `{ label, points }` (reuse the contracts `AwardTier` shape
   the fringe stations use), editable by the superadmin while the tournament is
   a draft. Every award freezes its label and points onto the award row's
   reason/snapshot at write time (the Snapshot Convention), so reconfiguring
   tiers mid-day never rewrites history. Per-court tier sets are a later
   refinement, not v1.
3. **One new facilitator route.**
   `POST /api/tournament/courts/:courtId/dumb-awards` with
   `{ teamId, tierLabel, clientAwardUuid }`, facilitator-authorized (any
   facilitator, like station rotation everywhere else), refusing a team not
   entered in the live dumb tournament and a tier the tournament does not
   configure. It runs the existing manual award through `runBridged`, with the
   reason composed server-side: `Court 2 · Gold`. The `clientAwardUuid` is the
   idempotency key (a unique index + re-read, mirroring scan idempotency),
   because a double-tap on a huge button must not pay twice. A companion
   `POST …/dumb-awards/:awardId/void` lets the awarding facilitator take an
   award back inside the same ten-second window the swag counter uses; after
   the window, only the desk's existing award void can.
4. **One new facilitator page, modelled on the swag counter.**
   `/staff/dumb-court/:courtId`: the armed tier row (sticky, with the loud
   "next award pays …" echo), a grid of team buttons (big, text-only, most
   recent first), a confirm naming the tier, the points and the team — "Award
   Gold +20 to Kallang Roar?" — the ten-second undo, and the court's award log
   for the day with voided rows struck through. The station picker gains dumb
   courts while a dumb tournament is live. No camera, no number box: picking
   the wrong team is the hazard, so the confirm carries the team's name and
   roster size, and the undo is generous.
5. **Points land where tournament points already land.** The bridge spreads
   each award over the team's current roster; every member sees it in their
   tournament total and their cluster sees it on the board. Nothing new to
   reconcile, freeze or export.

## Explicitly not in v1

- No matches, scores, fixtures, courts-in-use tracking or stage machinery for
  dumb courts — a court master who wants a recorded game uses the real
  tournament. (A dumb award against a court that is also running bracket
  matches is allowed; the two never read each other.)
- No per-court tier sets, no award limits per team per day, no offline queue
  (an award must resolve the roster server-side, so dumb courts are
  online-only, exactly like typed scan numbers).
- No changes to the engine, the scheduler, or the captain's-ball surfaces.

## Phasing

1. **Kind + creation** (contracts, schema CHECK + additive migration note,
   superadmin create/start for the kind with a tier editor; API tests:
   parallel liveness with a `captains_ball` tournament, wrong-party refusals).
2. **The facilitator award path** (route, idempotency, void window; API tests:
   award spreads to a mixed-cluster roster at full value per member, tier
   snapshot survives a config change, duplicate UUID pays once, void window
   enforced, participant refused).
3. **The court page** (web page + station picker entry + hook tests; a
   Playwright pass over arm → confirm → award → undo).

Each phase is shippable; phase 1 alone lets the desk run a dumb day through
the existing superadmin award button while the court page is built.

## Risks and open questions for the owner

- **Wrong-team taps** replace wrong-person scans as the main hazard; the
  confirm + ten-second undo + struck-through log are the mitigation. Is ten
  seconds enough at a busy court, or should the window follow the swag
  counter's exactly (it does — same constant)?
- **Roster timing:** a dumb award pays the team *as it stands now* (the manual
  award rule). A player who joins a team mid-day collects its later awards but
  not its earlier ones. That is the existing desk-award behaviour; confirm it
  is the day's intent for dumb courts too.
- **Tier vocabulary:** with no winners/losers the tiers are the whole language
  ("Took part / Strong game / Standout"?). The labels and values are the
  owner's call; the plan treats them as pure configuration.
