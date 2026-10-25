# Living spec — core tournament engine

Version 1.0 · 2026-10-14 · Status: implemented (v1). Base problem contract:
`tournament-problems-fds.md` (P-01…P-16). Decisions beyond it: `docs/ADDENDA.md`.

## Objects

### Tournament `#obj-tournament`
Phase: v1. `id` UUIDv7; `name` string(1–120); `mode` format id (see
`shared/formats.ts` registry); `status`: `draft → live → closed`
(closed forbidden while any match is `live` — P-15); `config`:
`{courts≥1, matchLengthMinutes≥1, tournamentLengthMinutes≥1, startMinutes
0–1439, restMinutes≥0, winPoints, drawPoints, lossPoints}`.
Soft-deleted via `deletedAt`.

### Team `#obj-team`
`id`; `tournamentId` → Tournament; `name` string(1–80), unique per tournament
among active rows; `seed` int ≥1 = arrival/creation order (P-02, P-10 last
tie-break). Soft-deleted (P-03).

### Court `#obj-court`
`id`; `tournamentId`; `name` (`Court 1`…). Courts are resources created from
`config.courts`; contingency may add/soft-delete them.

### Match `#obj-match`
`id`; `tournamentId`; `key` string unique per tournament (`M1`, `QF1`, … —
the human reference used by slots); `phase` string; `groupKey` string|null;
`round` int ≥1; `slotA`/`slotB` SlotSource (below); `dependsOn` match-key list;
`courtId` Court|null; `startMinutes`/`endMinutes` int|null (null = bye/unscheduled);
`status`: `scheduled → live → final`; `scheduled → cancelled`;
`final` and `cancelled` are terminal (corrections happen via points-voiding,
P-09); `scoreA`/`scoreB` int ≥0, null until recorded; `origin`: `generated|manual`.
Error messages are exact strings returned by the API (`error` field) and
asserted in tests, e.g. `"Match is already final"`.

### SlotSource (value object, stored JSONB)
`{kind:'team', teamRef, label}` · `{kind:'winnerOf'|'loserOf', matchKey}` ·
`{kind:'rankOf', scope, rank}` (group/flight/overall standing rank) ·
`{kind:'recordPool', round, label}` (Swiss) · `{kind:'bye'}`.
Placeholders never name a predicted winner (A-002).

### PointsEntry `#obj-points-entry` (the ledger)
`id`; `tournamentId`; `teamId`; `matchId` nullable (null = direct desk award);
`points` int (may be negative for corrections); `reason` string(1–200);
`status`: `active → voided` (terminal; void requires `voidReason`).
Standings sum **active** entries only. Finalising a match writes win/draw/loss
entries per tournament config; those entries can be voided like any other.

## Relationships
Tournament 1—N Team/Court/Match/PointsEntry; Match N—1 Court (nullable);
PointsEntry N—1 Team, N—0..1 Match. All surfaced via the single generic
tournament-graph response: `{tournament, teams, courts, matches,
pointsEntries, standings}` — generalised on the wire, specialised in the UI.

## Features (all v1)
- F1 Simulate any registered format (client-side, placeholder slots).
- F2 Create a live tournament from a simulation (persists the same graph).
- F3 Desk: stage a manual match between any two distinct active teams.
- F4 Desk: start a match, record live score, finalise (awards points).
- F5 Desk: assign points directly to a team (with reason).
- F6 Desk: void a points entry (with reason) — standings update immediately.
- F7 Wet-weather contingency: set courts + match length; all `scheduled`
  matches are re-timed dependency-aware from their original order; live/final
  matches and their points never move (P-14).
- F8 Close the day (refused over a live match, P-15); closed days stay readable (P-16).

## Standings rule (P-10, one rule everywhere)
Points (active ledger) ↓, wins ↓, score difference ↓, points scored ↓,
seed ↑ (arrival order — arbitrary, labelled arbitrary in the UI).

## Day-zero bootstrap
Empty PGlite → schema snapshot applies on boot → `GET /api/health` ok →
create tournament → desk flow usable. No seed data required.
