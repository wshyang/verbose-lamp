# Participation points — implementation plan and assessment

Companion to `participation-points-gaps.md`, which found *where* the goal "taking part in
anything yields you points, even if you lose" is not met. This document assesses *what it would
take to fix*, in dependency order, with effort and risk per item.

**Nothing here is implemented.** Every item is costed against the real touchpoints.

---

## 0. The finding that reorders everything

**The obvious fix is not safe to ship on its own.** "Add a participation tier so facilitators can
scan everyone" sounds like a validator change. It is not, because of two existing rules that
combine badly:

**Rule 1 — first-write-wins.** `apps/api/src/db/entities/scans.ts:86`:

```ts
// §2.9 first-write-wins: the same participant cannot be scored twice in one round, even
// from a different device with a different idempotency key.
```

`createScan` uses `onConflictDoNothing()`, and on conflict returns the *existing* row with
`duplicate: true`. The route then answers **HTTP 200**, not an error.

**Rule 2 — the uniqueness slot is unconditional.** `schema.sql`:

```sql
UNIQUE (participant_id, round_id)     -- no WHERE clause, no partial index
```

Put them together and the natural participation workflow silently destroys points:

> A facilitator scans Priya "Took part" when she starts the Sandcastle Sprint — correct, the goal
> says she should score for turning up. Priya then wins the round. The facilitator scans her
> "First place" (+25). The API returns **200 OK**. No error, no warning. The write was discarded;
> Priya keeps the participation points and loses the 25. The facilitator has no way to tell from
> the response that anything went wrong.

And the escape hatch does not work either. A superadmin can void the scan
(`POST /api/admin/scans/:scanId/void`), but **voiding does not free the slot** — the unique
constraint ignores `is_voided`. Once any scan exists for a `(participant, round)` pair, that
participant can never receive a different award in that round. The void is a one-way subtraction.

So the sequencing is forced:

- Award participation **first** → placings become unawardable (silently).
- Award participation **last** → you must already know who took part, and there is no attendance
  record to tell you (that is gap G2). You would be relying on a facilitator's memory of who
  showed up, after the fact.

**Neither order works today.** Making the round slot upgradeable is therefore a prerequisite for
every other participation fix, not a nice-to-have. It is W0 below.

I rate this the highest-severity item in the whole analysis — not because the goal depends on it
most, but because it is the one place where shipping the *intuitive* fix would introduce a silent
data-loss bug into live scoring.

---

## W0 — Make the round slot upgradeable *(blocker, must land first)*

**Problem.** A `(participant, round)` pair accepts exactly one award, ever, voided or not.

**Change.**

1. `schema.sql` — replace the table constraint with a partial unique index so a voided scan
   releases the slot:
   ```sql
   -- UNIQUE (participant_id, round_id)   -- removed
   CREATE UNIQUE INDEX IF NOT EXISTS ux_fringe_scan_live
     ON fringe_scan (participant_id, round_id) WHERE is_voided = false;
   ```
2. `entities/scans.ts` — `findExistingScan`'s fallback lookup must filter `is_voided = false`, or
   it will keep finding the dead row and reporting a false duplicate.
3. `routes-fringe/index.ts` — decide and implement the upgrade rule (see below).
4. `onConflictDoNothing()` needs its conflict target checked against the new index name.

**The upgrade rule — this is the real design decision, and I want your call on it.**

| Option | Behaviour on second scan, same round | Trade |
|---|---|---|
| **A. Silent upgrade** | Higher-value tier replaces the lower; lower is ignored | Smoothest for staff. Erases the distinction between "corrected" and "as scored" |
| **B. Explicit re-award** | Second scan returns `409 alreadyScored`; facilitator taps "Replace award", which voids + rewrites | One extra tap. Keeps the audit trail honest and makes the overwrite a deliberate act |
| **C. Status quo** | First write wins, 200 OK | Free. Leaves the silent-loss bug in place |

**Recommendation: B.** The project's instincts are consistently audit-first — snapshot columns
everywhere, void/unvoid rather than delete, "the tier list is the integrity boundary". A silent
upgrade is the only option here that quietly rewrites history, and it would sit badly against
that grain. B also turns today's silent 200 into a visible, explainable event, which is a
straight improvement even before any participation work lands.

Whatever we choose, note that **C is not actually "do nothing"** — it is choosing to keep a known
silent-points-loss path. If you want to defer all participation work, I would still recommend
landing the 409 from option B on its own, because it converts a data-loss bug into an error
message.

**Blast radius.** `schema.sql`, `entities/scans.ts`, `routes-fringe/index.ts`,
`contracts/messages.ts`, plus the facilitator scan UI (`useFringeStation.ts`,
`FringeStationPage.tsx`) and the offline queue, which currently treats a 200 as terminal success
(`lib/offline/scanQueue.ts`, `useSyncQueue.ts`) — **the offline path is the subtle part**: a
queued scan that syncs into a 409 needs somewhere to go other than "silently dropped".

**Effort:** moderate. ~6 source files, ~5 test files. The offline-queue interaction is the risk,
not the SQL.

**Risk if skipped:** every later item inherits the silent-loss bug and makes it more likely to
fire, because they all increase how often a participant is scanned twice in one round.

---

## W1 — Guarantee a participation award exists at every station *(the core fix, gap G1)*

**Problem.** `routes-fringe/index.ts` rejects any tier not in `activity.awardTiers`
(`if (!tier) throw badRequest(messages.tierNotFound)`), so a station configured with placings only
makes non-placers physically unrecordable. Demo: Sandcastle Sprint, First/Second/Third.

Two coherent designs. They are mutually exclusive; I recommend the second.

### Option 1 — mandatory participation tier per activity

Add `isParticipation: boolean` to `awardTierSchema`; refine `awardTiersSchema` to require exactly
one; surface it as a radio column in the admin tier editor.

- **For:** per-station value (Sandcastle participation might be worth 5, Tug of War 10). Keeps
  everything about an activity's scoring in one record.
- **Against:** it is a *breaking config change*. Every existing activity row fails the new
  validation on next edit, and `award_tiers` is stored as jsonb that the read path parses — so
  stored podium-only rows need backfilling. With no migration system (`bootstrap.ts`: *"There are
  no migrations"*), that backfill is a hand-written one-off. It also still relies on an admin
  configuring each station correctly; the rule is enforced, but the *value* can be set to
  something meaningless.
- Touches ~14 files including the tier editor UI and its tests.

### Option 2 — a global participation floor in `point_config` ✅ recommended

Add one column: `fringe_participation_points integer NOT NULL DEFAULT 5 CHECK (>= 1)`. The scan
request may name no tier (`tierLabel: null`), meaning *took part*; the server prices it from
`point_config`, exactly as it prices named tiers today. The facilitator station always renders a
"Took part" action after whatever tiers are configured.

- **For:** impossible to misconfigure — participation becomes a property of *the day*, not of each
  station, so it cannot be forgotten at station setup, which is precisely how Sandcastle Sprint
  broke. No change to `award_tiers`, so **no backfill and no breaking config change**: every
  existing activity complies the moment it ships. Preserves the ADR-092 integrity boundary (the
  server still prices; no points cross the wire). Smallest surface of the two.
- **Against:** one rate for all stations. A five-minute ring toss pays the same for turning up as
  an hour-long tournament of its own.
- Touches ~8 files: `schema.sql`, `entities/pointConfig.ts`, `contracts/schemas.ts` +`wire.ts`,
  `routes-fringe/index.ts`, admin config page + API, facilitator station UI, seed.

**Why Option 2.** The goal as stated is a *floor* — "taking part in **anything**". A floor
belongs at the level the guarantee is made, which is the day, not the station. Option 1 re-opens
the same hole it closes: it compels an admin to name a participation tier per station, and the
original failure was an admin not thinking about non-placers at that moment. Option 2 removes the
opportunity for that mistake entirely. If per-station tuning is wanted later, Option 1 becomes a
clean additive override on top of a floor that already holds.

**Effort:** small-to-moderate, and genuinely small *if* W0 has landed. Without W0 it should not
ship at all — it would make the silent-loss path far more frequent, since "scan everyone on
arrival, award placings at the end" is exactly the double-scan sequence that loses points.

---

## W2 — Pay the teams that turned up *(gaps G4, G5, G6)*

**Problem.** Walkover (`routes-superadmin/tournament.ts:113`) creates no `tournament_match` row;
cancelled and skipped are excluded by the `status='completed'` filter. Teams that showed up get
nothing.

**Change.** `point_config` gains `tournament_turnup_points` (default = loss points). Then either
write a completed-but-unplayed `tournament_match` carrying roster snapshots, or add a third branch
to the `participantPoints` CTE reading fixtures directly.

**Strong preference: write the match row.** The leaderboard CTE is the most load-bearing query in
the app; a third union branch over a different table with different snapshot semantics is where
subtle double-counting bugs live. Synthesising a match row keeps one shape, one fan-out path, one
set of snapshot rules — and the standings/PD code from ADR-115 already knows how to ignore a match
with null scores.

**Open question for you:** a walkover currently means *the other team didn't show*. Should the
no-show team get zero (punitive, current) while the present team gets turn-up points? That's my
assumption, but it needs confirming — and it implies walkover must record *which* team was absent,
which `walkover_winner_team_id` only implies.

**Effort:** moderate. Touches the tournament routes, point config, leaderboard or match-write
path, and the standings tests, which are sequential with hard-coded counts
(`describe('a round-robin day')` — new tests must be inserted carefully).

---

## W3 — Floor the loss points *(gap G7)*

`CHECK (tournament_loss_points >= 0)` → `>= 1`, plus the matching zod `.min(1)`.

**Effort:** trivial — two lines plus a test. **Only worth doing if "even if you lose" is policy
rather than preference**; it removes a superadmin's ability to run a winner-takes-all tournament.
That is a product decision, not a technical one, and I'd rather you made it explicitly than have
me quietly weld it shut.

---

## W4 — Self-serve participation *(gaps G2, G3 — assess, don't schedule)*

The structural item: `fringe_scan.facilitator_id` is `NOT NULL`, so every point requires staff to
act on you, and everything a participant can do alone (gallery, chat, voting) pays zero. This is
what the demo's 7%-vs-100% scan split points at.

**I am not recommending this yet**, for a reason worth stating plainly: making points self-serve
means letting participants award themselves, which is the one thing ADR-092's design deliberately
prevents. Any version of this needs an anti-gaming answer before it needs code — self-scan via a
station QR, a per-participant daily cap, or facilitator approval of a queue.

Worth noting it may not be a code problem at all. If the opt-out cohort is under-scanned because
there aren't enough roaming facilitators, that's an operations fix, and shipping a self-serve
points path would be solving the wrong problem at considerable risk.

**Recommend:** decide the anti-gaming model first, then scope. Do not bundle with W0–W3.

---

## Recommended sequence

| Step | Item | Effort | Ships the goal? |
|---|---|---|---|
| 1 | **W0** upgradeable round slot | moderate | No — unblocks everything, fixes a live silent-loss bug |
| 2 | **W1 opt. 2** global participation floor | small–moderate | **Yes — this is the one that delivers it** |
| 3 | **W3** loss-points floor | trivial | Hardens it |
| 4 | **W2** turn-up points | moderate | Closes the tournament-side gaps |
| 5 | **W4** self-serve | large, unscoped | Needs a policy decision first |

Steps 1–2 are the meaningful delivery: after them, every participant who is physically scanned at
any station scores, and no award can be silently lost. Steps 3–4 are completeness. Step 5 is a
product question wearing an engineering costume.

**Verification for any of these:** `npm run verify` (~4 min) is the gate; current baseline is 394
API tests passing / 3 skipped and 874 web tests passing, with web coverage ratcheted at
98.9 / 97.8 / 98.3 / 98.9 in `apps/web/vite.config.ts` — the ratchet will need raising, not
lowering, for new code. Per `AGENTS-testing.md` §1.1 a green suite is not proof: each item above
needs its production line sabotaged to confirm the new tests actually fail without the fix.

---

## What I need from you to start

1. **W0 upgrade rule — A, B, or C?** (I recommend B: 409 + explicit "Replace award".)
2. **W1 — Option 1 or Option 2?** (I recommend 2: global floor, no config backfill.)
3. **W3 — is "even if you lose" policy?** If yes I'll weld the floor to 1.
4. **W2 — does the no-show team in a walkover get zero?**

Answer 1 and 2 and I can start immediately; 3 and 4 can follow later without rework.
