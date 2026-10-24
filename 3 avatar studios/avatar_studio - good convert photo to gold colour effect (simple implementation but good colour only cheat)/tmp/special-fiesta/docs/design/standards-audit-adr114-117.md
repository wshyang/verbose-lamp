# Standards audit — this session's work (ADR-114 … ADR-117)

Audited against `AGENTS.md` and its six section files, commit range `f5fa993..50da683`.
Scope: the code commits `6562e7a` (ADR-114), `e7f15ae` (ADR-115), `9a38a4f` (ADR-116),
`33cbfb4` (ADR-117), plus the coverage commit `2f6d978`. The ADR-112/113 cache series is a
second writer's and is excluded.

Verdict: **mostly compliant, with one gate-breaking defect and three real breaches**, all now
fixed in `50da683`. Two further observations are judgement calls, left alone deliberately.

---

## 1. The one that mattered: `npm run verify` was red

`33cbfb4` raised the API branch-coverage ratchet to **94.66 %**, taken from a green run. That
figure is not a floor — it is the top of a range. Four identical runs on an unchanged tree:

| run | branches |
|---|---|
| 1 | 94.66 % (1685/1780) |
| 2 | 94.66 % (1685/1780) |
| 3 | 94.6 % (1684/1780) |
| 4 | 94.66 % (1685/1780) |

The oscillating branch is `apps/api/src/db/entities/schedule.ts:575` —
`if (index >= Math.max(1, courtCount)) return null;`. Whether it is taken depends on where a
team lands in the startable queue relative to the number of enabled courts, and the parallel
suites share a five-court pool. So it is covered or not according to test interleaving.

Pinning the high-water mark made the gate fail roughly **one run in three on code nobody had
touched** — the worst kind of failure, because the next person to see it will assume their own
change caused it. Restored to 94.6 with the reason recorded in the config beside it.

This is the only finding that would have stopped a colleague working.

**Lesson for the ratchet rule.** "Raise, never lower" is sound, but it has an unstated
precondition: the number must be *reproducible*. A ratchet should be set from the **minimum of
several runs**, not from the one run you happened to watch.

## 2. `AGENTS-testing.md` §4 — the security matrix had no row for the ledger

The matrix asserts each route against the OWASP Top 10, and its A08/A09 case is titled
*"corrections are append-only and always attributable"*. ADR-117 added a correction surface
that is strictly **more powerful than the one that case covers**: void/unvoid can only flip a
row that an event produced, whereas an adjustment conjures points with no underlying event.
It was absent from the matrix.

The authorization matrix, by contrast, *did* cover it — its `^(GET|POST|PUT|PATCH) /api/admin/`
rule classifies the new route automatically and the suite drives every wrong actor type at it,
so the coverage gate was genuinely satisfied rather than silently skipped. Credit where due.

Added: no `DELETE`/`PATCH`/`PUT` path out of the ledger, a +40/−40 pair both still listed, both
attributable. Watched to fail by unregistering the route.

## 3. `AGENTS-testing.md` §5 — a hook with logic and no hook test

> "Hooks carry the logic, so hooks carry the unit tests: `use<Feature>.test.ts` beside
> `use<Feature>.ts`, driven with `renderHook`."

`useScoreAdjustment` holds four real rules — sign the confirmation, trim the reason, clear the
form on success, keep the typed values on refusal — and `useStaffTools.test.ts` already existed
beside it. All four were exercised only indirectly, through the page test. That is the
arrangement §5 exists to prevent: the logic is reachable by one route only, and the route is the
slowest and least precise one.

Added three `renderHook` cases. Watched to fail by removing the `.trim()`.

## 4. `AGENTS-decisions.md` §3 — ADR shape

ADR-116 and ADR-117 opened with `##` in a file that uses `###` throughout, and both omitted
**Date** and **Relates to**. Fixed. ADR-114/115 carry Date and Status but use a **Context**
field where §3 asks for **Why**; left as-is, since the register has drifted that way for a
while and the content is present under another name.

---

## What held up

| Standard | Status |
|---|---|
| ADR written in the same commit as the change | ✅ all four |
| ADR number cited in code comments where the surprising thing lives | ✅ 14–17 files each |
| Schema edited in place, Drizzle kept in step | ✅ `standards` twins rule passes |
| **Snapshot at write time** (non-negotiable 7) | ✅ `activity_name_snapshot` on `score_adjustment` |
| UUIDv7 minted only in `db/ids.ts` | ✅ |
| Positive + wrong-party negative per route | ✅ facilitator 403 + the auth matrix |
| Real DB, no repository mocks | ✅ |
| `data-testid` at authoring time | ✅ standards gate |
| Error copy from `@psd/contracts`, never inlined | ✅ — and ADR-117's reason message was changed from the borrowed `voidReasonRequired` to its own |
| Component renders / hook decides; no derivation in JSX | ✅ |
| ≤50-line functions, ≤3 params, ≤800-line files | ✅ (forced an extraction of `registerAdjustmentActions`) |
| Assert what outlives the test (§1.1) | ✅ API tests read totals back through the API, not off the screen |
| Sabotage each new behaviour | ✅ 2/2 for ADR-117, 7/7 for ADR-116, plus 2 more here |

## Two judgement calls, deliberately left

**`createdByUsername` is lazy-joined, not snapshotted.** Non-negotiable 7 says never lazy-join
a historical value, and `fringe_scan` does snapshot `facilitator_username_snapshot`. The ledger
joins `superadmin_account` live instead. Left alone because the two existing audit surfaces —
`audit.ts` and `pointConfig.ts` — do exactly the same for the same field, and
`superadmin_account` has no `expires_at`, so there is no row-vanishing risk behind the inner
join. Changing it would mean changing all three, which is its own decision.

**`fds.md` was not touched.** ADR-116 and ADR-117 both add behaviour the FDS does not describe.
`AGENTS-decisions.md` §4 is explicit — *do not silently edit the FDS to match the code*; the
divergence is the addendum. So this is correct as it stands. Worth flagging only because ADR-092
did edit `fds.md` to add `award_tiers`, so the repo now has precedent both ways. If the FDS is
meant to absorb accepted addenda periodically, that should itself be a decision with a rule.
