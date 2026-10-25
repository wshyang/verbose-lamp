# Tiered rewards for fringe stations — work assessment

· **Status:** implemented as **ADR-092** (see `docs/addenda/ADDENDA.md`), with the §7
  decisions resolved: tiers **replace** the flat value (a flat station is a single-tier list),
  max four tiers, sticky arming with the first tier pre-armed. The user additionally asked for
  — and got — a green screen-border flash plus a "ding" on every server-acknowledged award.
· **Assessed at:** commit `4a444b8`
· **Origin:** Part 3 of `facilitator-journey-assessment.md`, finding **V-1** and fix
**P9**. This document turns P9 into a scoped, buildable plan.
· **Goal:** a superadmin can define labelled award tiers per activity — *First place:
10 pts, Second place: 5 pts, Third place: 3 pts* — and the facilitator picks the tier
at scan time. Flat-rate stations stay exactly as they are, including the zero-tap
camera loop.

---

## 1. The one fact that makes this small

`fringe_scan.points_awarded_snapshot` is already a **per-row integer**, and every read
path — leaderboard, scan history (S6), station log, audit (S47), corrections/void —
reads the snapshot, never the activity. Verified at `4a444b8`: the only writer of the
snapshot is one line in `recordScan` (`routes-fringe/index.ts:143`,
`pointsAwardedSnapshot: activity.pointValue`).

So tiered rewards is **not a data-model migration**. It is: one new column on the
activity, one new (optional) snapshot column on the scan, a smarter write path, and UI
at both ends. Nothing downstream of the snapshot changes at all.

Also in our favour:

- **ADR-049** — no migrations exist; `snapshot.sql` is edited in place alongside the
  drizzle schema file. Schema work is two files, no ledger.
- **jsonb precedent** — `tournament.ts` already uses typed jsonb columns
  (`jsonb(...).$type<RosterSnapshotEntry[]>()`), so an `award_tiers` jsonb column is
  idiomatic here, not a new pattern.
- **Demo seed** — `seed-demo.mjs` drives the real HTTP API; an *optional* request field
  costs it nothing.

## 2. Proposed shape (the ADR-092 content)

### 2.1 Storage — jsonb on the activity, not a child table

```
fringe_activity.award_tiers  jsonb NULL   -- AwardTier[] | null
AwardTier = { label: string (1–20 chars), points: integer ≥ 1 }
```

- `null`/`[]` ⇒ flat-rate activity; console renders exactly as today.
- Max **4** tiers (First/Second/Third + one spare); labels unique within the activity.
- Rejected alternative — `fringe_activity_tier` child table: tiers are a small ordered
  value-object, always read and written *with* the activity, never queried
  relationally, never referenced by FK (scans snapshot the label as text). A child
  table buys integrity we don't need at the cost of joins, a second entity file and
  ordering bookkeeping.

### 2.2 Semantics — tiers are *extra* buttons; `point_value` stays the default

`point_value` keeps its meaning: the **default award** ("Participation"). When tiers
exist, the scan panel shows a segmented selector — `Participation +2 · First +10 ·
Second +5 · Third +3` — with the default **pre-armed and sticky**. The armed tier
applies to every scan until changed. Consequences:

- Flat-rate stations: zero behaviour change, zero new taps.
- Tiered stations: the common case (most scans are participation) is still zero-tap;
  a placing costs exactly one tap before the scan.
- No "which tier?" modal per scan — a per-scan prompt would double the interaction
  count of the hot loop, which ADR-088 deliberately kept to confirm-only.

### 2.3 Wire — the client names the tier, the server prices it

`POST /fringe/scans` gains one optional field: `tierLabel?: string`.

- Omitted ⇒ default award at `activity.point_value` (today's behaviour, bit-for-bit).
- Present ⇒ the server resolves the label against the activity's **current**
  `award_tiers`, writes that tier's points into `points_awarded_snapshot`, and the
  label into a new `fringe_scan.tier_label_snapshot text NULL`.
- Unknown label ⇒ named 400 (`messages.tierNotFound`). This is the integrity boundary:
  the client **never sends a points number** — same philosophy as ADR-027 ("the server
  re-checks what the dialog promised") and the existing snapshot rule (fds.md §3.12).

**Dedup is untouched.** `(participant_ref, round_ref)` uniqueness still wins first —
scanning a participant as *First place* after they were already scanned as
*Participation* this round is a duplicate, not an upgrade. Correcting a mis-tiered
scan stays a superadmin void + rescan, same as any mis-scan today. This keeps the
once-per-round guarantee (§2.9) exactly as strong as it is now.

### 2.4 Offline — the queue carries the label, the server stays authoritative

`QueuedScan` (scanQueue.ts) gains `tierLabel` and `tierPoints` (display only, like the
existing `pointValue` field). On drain, the server re-resolves the label. If the
superadmin deleted/renamed the tier between enqueue and drain, the drain gets the named
400 and the entry surfaces on S27 (Sync Queue) with `lastError` — the queue's existing
failure UX, no new machinery. The queued ✓ line prints the locally-known tier points
(same honesty level as today's queued flat value; V-2 applies equally and is not made
worse).

### 2.5 Copy surfaces

- Confirm dialog (ADR-088): `Award +10 (First place) to Wei_Ling?`
- Success line (F27): `✓ Wei_Ling +10 pts · First place` (flat scans unchanged).
- Station log rows and S6/S47 rows append the tier label when present.

## 3. Work breakdown — every file, by workstream

### W1 · Contracts (S)
| File | Change |
|---|---|
| `packages/contracts/src/schemas.ts` | `awardTierSchema` (label 1–20 chars + points ≥1), `awardTiersSchema` (max 4, `refine` unique labels); extend `createActivityRequestSchema` (+optional `awardTiers`, flows into edit schema automatically); extend `createScanRequestSchema` (+optional `tierLabel`) |
| `packages/contracts/src/wire.ts` | `ActivityView.awardTiers: AwardTier[] \| null`; `ScanView.tierLabelSnapshot: string \| null` |
| `packages/contracts/src/messages.ts` | ~4 strings: `tierLabelInvalid`, `tierPointsInvalid`, `tierLimitExceeded`/`tierLabelDuplicate`, `tierNotFound` |

### W2 · API — schema + write path (S/M)
| File | Change |
|---|---|
| `apps/api/src/db/schema/fringe.ts` | `awardTiers: jsonb(...).$type<AwardTier[]>()` on activity; `tierLabelSnapshot: text(...)` on scan |
| `apps/api/src/db/snapshot.sql` | same two columns, in place (ADR-049) |
| `apps/api/src/db/entities/activities.ts` | carry `awardTiers` through create/update `set` |
| `apps/api/src/db/entities/scans.ts` | `createScan` input + insert `tierLabelSnapshot` |
| `apps/api/src/views/fringe.ts` | both views expose the new fields |
| `apps/api/src/routes-fringe/index.ts` | `recordScan`: resolve `tierLabel` → `{points, label}` or default; one small pure helper (`resolveAward(activity, tierLabel)`) keeps it under the complexity-12 lint cap |
| `apps/api/src/routes-superadmin/config.ts` | nothing beyond what zod does, if validation lives in the schema (preferred) |

### W3 · Web — superadmin tier editor (M, the biggest UI piece)
| File | Change |
|---|---|
| `apps/web/src/lib/hooks/useAdminConfig.ts` | `ActivityDraft` gains `awardTiers` rows (string fields, numeric-sanitised like `pointValue`); `activityBody`/`draftFromActivity` mapping |
| `apps/web/src/routes-superadmin/ActivitiesPage.tsx` | tier rows editor: label + points inputs, add/remove, max 4. eslint `max-lines-per-function: 50` forces a `TierRowsEditor` sub-component — plan for it rather than fighting it. Activities table column shows `2 · 10/5/3` style summary |

### W4 · Web — station console (M)
| File | Change |
|---|---|
| `apps/web/src/routes-facilitator/FringeStationPage.tsx` | `ScanPanel`: segmented tier selector (sticky armed state via `useState`, default pre-armed); confirm dialog copy; header "points per scan" line becomes "default 2 · tiers 10/5/3" when tiered |
| `apps/web/src/lib/hooks/useFringeStation.ts` | `sendScan` carries the armed tier into `postScan` and the queue draft; ✓/queued messages include the label |
| `apps/web/src/lib/format.ts` | `scanConfirmation` gains optional `tierLabel` |
| `apps/web/src/lib/api/stations.ts` | `ScanPayload` + `tierLabel` |
| `apps/web/src/lib/offline/scanQueue.ts` | `QueuedScan` + `tierLabel`/`tierPoints` (old queued entries parse fine — fields are optional) |
| `apps/web/src/routes-facilitator/SyncQueuePage.tsx` | row shows tier when present |

### W5 · Docs (S)
`fds.md` §2.7 (+`award_tiers` row), §2.9 (+`tier_label_snapshot`), §3.12 note, §6.5
copy, §7.x request field; `AGENTS-decisions.md` **ADR-092** (shape of §2 above);
cross-reference stubs in `facilitator-journey-assessment.md` P9.

### W6 · Tests (M — budget as much time as W2–W4 combined)
Coverage gates are tight (web branches ≥ 98.2% with ~1 branch of slack), so every new
branch ships with its test in the same commit:

- **API** (`fringe.test.ts`, +~8 cases): tier CRUD via superadmin PUT (dup labels, >4,
  bad points rejected); scan with valid tier → snapshot points+label; unknown tier →
  400 `tierNotFound`; omitted tier on tiered activity → default; dedup across
  different tiers; flat activity + tierLabel → 400. `corrections.test.ts`: void of a
  tiered scan keeps snapshots. `security-matrix.test.ts`: unchanged (no new routes).
- **Web**: `useAdminConfig.test.ts` (draft round-trip), `admin-config-pages.test.tsx`
  (editor add/remove/limit), `useFringeStation.test.tsx` (armed tier in payload +
  queue draft + messages), `station-pages.test.tsx` (selector render/arm/sticky,
  dialog copy, flat activity renders no selector), `scanQueue.test.ts` (optional
  fields), `format.test.ts` (confirmation variants), `scan.test.tsx` acceptance
  (one tiered happy path).
- **E2E** (`e2e/`): one Playwright spec extension — cannot run in this sandbox
  (no Docker/DB); mark for CI.

## 4. Size and sequencing

| Stage (≈ one commit each) | Content | Estimate |
|---|---|---|
| 1 | W1 + W2 + API tests — feature complete over HTTP | ~180 LOC + ~130 test |
| 2 | W3 + its tests — superadmin can define tiers | ~140 LOC + ~90 test |
| 3 | W4 + its tests — facilitator can award them | ~160 LOC + ~120 test |
| 4 | W5 + ADR-092 + gate sweep (coverage thresholds, standards) | docs only |

**Total ≈ 480 production LOC + ≈ 340 test LOC across ~20 files.** Comparable to
ADR-088 (scan numbers), smaller than ADR-089 (scheduling). Each stage leaves the tree
green and shippable; stages 2 and 3 are independent of each other once 1 lands.

## 5. Risks and edge cases

| Risk | Assessment |
|---|---|
| Tier edited/removed while scans for it sit in an offline queue | Named 400 on drain → S27 `lastError` row (existing UX). Accepted; rare and visible. |
| Tier edited mid-round | History safe by construction (per-scan snapshots, fds §3.12). Live console updates on the next poll — same staleness window the flat value has today (V-2/V-5, not worsened). |
| Mis-tiered scan (facilitator forgot to re-arm) | Dedup makes it final for the round; fix = superadmin void + rescan, same as any mis-scan. The sticky selector must be **loud** about what is armed (selected tier echoed above the camera) — this is the main UX risk of the sticky design and worth a deliberate test. |
| Coverage gates | Web branch slack ≈ 1 branch; the selector and dialog branches all need direct tests (W6 is sized for this). |
| `max-lines-per-function: 50` / complexity 12 | Both touched components are already near-full → plan the extractions (`TierRowsEditor`, `resolveAward`) upfront. |
| Demo seed / old dumps | Seed drives the HTTP API with optional fields → unaffected. Old `psd.scanQueue.v1` entries lack the new fields → optional types, drain sends no `tierLabel` → default award. No storage-key bump needed. |

## 6. Explicitly out of scope (and why)

- **Freeform point entry at the station** — rejected in Part 3 §22: the tier list *is*
  the integrity boundary; freeform reopens the abuse surface the snapshot design closed.
- **Tier upgrades for an already-scanned participant** — would weaken the once-per-round
  guarantee; corrections stay with the superadmin (V-4 is a separate finding).
- **Per-round or per-participant tier quotas** ("only one First per round") — real
  stations may want it, but it is enforcement the facilitator can do socially; adding
  it now triples the write-path logic for an unproven need. Note for a future ADR.

## 7. Decisions needed before building

1. **Max tiers = 4?** (First/Second/Third + spare; keeps the segmented control
   one-row on a phone.)
2. **Default stays `point_value` ("Participation")** with tiers as extras — confirm, vs.
   tiers *replacing* the flat value (would cost the zero-tap loop on tiered stations).
3. **Sticky vs. one-shot arming** — sticky (proposed) suits "heat ends, scan the
   podium: tap First, scan; tap Second, scan"; one-shot (auto-reset to default after
   each scan) is safer against forgotten re-arming but costs a tap per placing.
   Proposed: sticky, with the armed tier echoed loudly above the camera.
