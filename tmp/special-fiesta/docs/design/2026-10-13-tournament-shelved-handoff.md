> **Superseded 2026-10-15 by ADR-270.** The manual and drawn days described below were deleted with the
> rest of the old tournament ahead of a modular rebuild; see
> `docs/design/2026-10-15-tournament-overhaul-plan.md`. This file is kept as history.

# Handoff — tournament work shelved, 2026-10-13

**For:** whoever picks up the tournament overhaul next.
**Branch:** `arena/1952d326-special-fiesta`. Everything below is committed and pushed there; do not look for it on `main`.
**Written:** 2026-10-13 (Asia/Singapore), at HEAD `7ce8f51`. Working tree was clean when this was written.
**Status in one line:** three finished, verified, *deliberately unwired* pieces of tournament work are shelved. Nothing is half-built. The next task on this branch is unrelated (Android backdrop rendering) — see §6.

---

## 0. Read this first

- **Nothing here is live.** The manual core and its drawn extension are complete and green, and no user can reach them: the API routes are not mounted and the consoles are not routed. Shelving needs no action and no revert. Resuming needs the two mount lines in §4 and nothing else to "finish" first.
- **Do not "complete" the shelved work by wiring it speculatively.** The unwired state is the decision (see `docs/design/tournament-first-day-story.md` §8): the new day was built beside the running app so the two could be read against each other. Wiring is a product decision the owner has not taken.
- **The problem specification supersedes solution talk.** `docs/design/tournament-problems-fds.md` (P-01…P-16) is the current statement of what a tournament day must solve, written with no objects, no implementation and no solution. If you resume solution work, check it problem-by-problem against the "Solved looks like" lines there, and say which side of each §4 tension you landed on.
- **The gate was green; Playwright was not run.** `./verify.sh` passed on `6a00e7b` (see §3). Playwright was not run for any of the three pieces and must not be described as having been.

---

## 1. What is shelved, commit by commit

| Commit | What it is | Live? |
|---|---|---|
| `4b908b1` — ADR-1xx: the manual day | The minimal hand-run tournament day ("manual core") on its own three tables, beside the app, sharing nothing with the scheduled path but the court table (read-only) | No — unmounted |
| `6a00e7b` — ADR-1yy: port the two tournament modes as manual-day extensions | Round robin + World Cup rebuilt *as extensions of the manual day* (one drawn engine, two presets), on three extension tables. Core unchanged except two transaction seams (§4) | No — unmounted |
| `7c7de5d` — docs: tournament day as sixteen problems | The problem specification above. This is the piece the owner asked for last and the lens for any resumption | n/a (document) |
| `340e94b` and earlier | The analysis that led here: the first-day story (`docs/design/tournament-first-day-story.md`, incl. §8 build report and §9 port report), the twelve-ruling plan documents, the friction hunt and flow stories | n/a (documents) |
| `7ce8f51` — Added new database initialisation routine | The owner's own latest commit, pulled 2026-10-13 (advisory lock, boot log, connection diagnostics + tests). Not tournament work; recorded here only because it is HEAD | Yes — it is the running app's bootstrap |

Design narrative, if you read one document: `docs/design/tournament-first-day-story.md` (§5 is the yardstick, §8 is the core's build report, §9 is the extension's). The schema reasoning is in `apps/api/src/db/schema.sql` at the `manual_day` (ADR-1xx) and `manual_draw` (ADR-1yy) blocks.

---

## 2. What the two builds are (orientation, not a spec)

**The manual core (ADR-1xx).** Three tables — `manual_day`, `manual_team`, `manual_match` (DDL + Drizzle mirror `apps/api/src/db/schema/manual.ts`); one contract file (`packages/contracts/src/manualDay.ts`); API in `apps/api/src/manual/` (day, teams, matches, queue, table, read, views, routes); web client + hook + eight components in `apps/web/src/components/manual/`. A started match counts by definition; the score is the result (winner/points derived, enforced by CHECK); the table is the four-rung fold in `manual/table.ts`; the queue is derived per read in `manual/queue.ts`. It imports nothing from `tournament*`, `point_config`, `team` or `participant`.

**The drawn extension (ADR-1yy).** Three tables — `manual_draw`, `manual_slot`, `manual_advance` (mirror `apps/api/src/db/schema/manualDraw.ts`); contracts in `packages/contracts/src/manualDraw.ts`; API in `apps/api/src/manual-draw/` (`slate.ts` is the whole derivation as one pure function); web in `apps/web/src/components/manual-draw/`. One engine, no mode column: `advance_count = 0` is round robin, `> 0` is World Cup. Only three things are stored (shape + seed, which address each match filled, the desk's advancement seats); groups, fixtures, rounds, byes, bracket and third-place match are derived by reusing `dealGroups`/`circleRounds`/`knockoutDrafts` from `apps/api/src/lib/tournament/engine.ts` — imported, not copied.

**Dependency direction (do not break it):** `manual-draw` imports the manual core; the core never imports `manual-draw`. `apps/api/src/manual/` must not learn that a draw exists. On screen the same rule: `DrawnDayConsole` composes the manual components; it does not fork them.

---

## 3. Evidence (what "finished" rests on)

Recorded on `6a00e7b` (re-stated from the commit; re-run `./verify.sh` before you trust it again):

| Gate | Result |
|---|---|
| Typecheck, lint, standards | Green; standards 644 files, 0 violations |
| Web build | Green |
| API tests | 922 passed, 3 skipped; branches 94.74% (floor 94.6%) |
| Web tests | 1,635 passed; branches 98.53% (floor 98.4%) |
| Playwright | **Not run** |
| New tests | API `manual-slate.test.ts` (23, pure derivation) + `manual-draw.test.ts` (12, real DB) + existing `manual-day.test.ts` (16) / `manual-table.test.ts` (6); web `manual-draw.test.tsx` (11) + `manual-day.test.tsx` (10) |

Standing test rules that applied and still apply: tests in the same change, real database (never mock the data-access layer), coverage ratchets never lowered, `./verify.sh` before commit. Filtered Vitest runs are not evidence for order-dependent suites — run the full suite.

---

## 4. To resume (when the owner says so — not before)

1. **Mount the API (two lines).** In `apps/api/src/app.ts`: `api.route('/api/manual', manualRoutes())` and `api.route('/api/manual-draw', manualDrawRoutes())`. Both route modules say this in their headers; the tests (`manual-day.test.ts`, `manual-draw.test.ts`) mount the routes on their own test app and will keep passing — one asserts the six scheduled tables stay empty after a manual day is played.
2. **Route the consoles.** `ManualDayConsole` (`apps/web/src/components/manual/`) and `DrawnDayConsole` (`apps/web/src/components/manual-draw/`) are unrouted. Where they live (new route? replacing the tournament page?) is the owner's call, not a technical gap. Note the known awkwardness from the story §8: opening/closing a day needs superadmin, on-sand presses need facilitator — one screen, two credentials. Decide the day-start ownership question when routing, don't discover it.
3. **Transaction seams already exist.** `startMatch`/`finishMatch` in `apps/api/src/manual/matches.ts` are thin wrappers over exported `insertMatch(tx, …)` / `stampResult(tx, …)`; `foldRows` is exported from `manual/table.ts`. If resumption seems to need a core hook/callback, re-read §9 of the story first — a core with a hook has two owners of the write.
4. **Run the full gate, then Playwright** (never yet run for this work), then update this file or supersede it.

---

## 5. Open questions left open on purpose (do not silently solve)

From `tournament-first-day-story.md` §8–§9 and `tournament-problems-fds.md` §7–§8:

1. **Late team on a drawn day re-deals the sheet.** Dealing is by position, so a team added through the *core* route (which must not know a draw exists) re-deals groups even after play; the drawn route refuses its own door. Frozen-field + projection (old ADR-149) vs refuse-after-first-whistle is the owner's overhaul decision.
2. **A walkover cannot be expressed.** Score-is-result means `0–0` says draw and `10–0` says points were played. Needs a core result kind if it is ever solved — an engine change, not an adapter patch.
3. **A stray (un-slotted) match counts but is not placed.** It folds into its group once and fills no address, so the fixture stays owed. A printed sheet would want "played twice" annotated; nothing annotates it.
4. **Cancelled matches carry no reason/audit.** Proportionate for a no-show; revisit if cancellations ever move prizes.
5. **Ranking richness (Q6).** The old head-to-head/mini-league/cohort stack was deliberately *not* ported; the bracket lock (knockout waits for every group close) + the desk's overrule carry that weight today. A witnessed tie on a cut line is the evidence that would reopen it — in the extension, not the core.
6. **Two-credential console** (§4.2 above) and **names-without-rosters** (a manual day's teams are typed names; whether the person economy must attach is unanswered).

---

## 6. What happens next (not tournament work)

Owner's direction, 2026-10-13: assess and fix **backdrop effects not rendering on mobile Android browsers**. That work starts *after* this handoff. Nothing about it is decided yet — "backdrop" spans at least the participant beach scene and the avatar backdrop patterns, and the first act is establishing which effect, on which surface, on which browser build, before changing anything. Record findings as a new ADR per the register's rules; do not fold them into the shelved tournament commits.

---

## 7. How to verify this handoff true

```bash
git log --oneline -6            # 7ce8f51, 7c7de5d, 6a00e7b, 4b908b1, 340e94b, …
git status                      # clean
grep -rn "manual" apps/api/src/app.ts          # expect: no mount (unwired on purpose)
./verify.sh                     # expect green; Playwright still to run by hand
```

If any line of §7 disagrees with the tree, the tree wins and this file is stale — fix the file in the same change that notices.
