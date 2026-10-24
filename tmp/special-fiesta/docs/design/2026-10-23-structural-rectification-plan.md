# Rectifying the high-severity structural findings — implementation plan

- **Date:** 2026-10-23
- **Finds:** [`docs/reviews/2026-10-23-structural-findings.md`](../reviews/2026-10-23-structural-findings.md)
  S2 (three gates, three exclusion models), S4 (the default Playwright run collects own-stack
  suites against the shared stack), S9 (`afterWrite` is a convention, not a boundary),
  S10 (four day-resolvers composed ad hoc — the seam that shipped ADR-326's close bug).
- **Deferred by the owner:** S1 (`tmp/Kallang`). The medium/low findings (S3, S5–S8, S11–S16)
  are referenced where a phase touches them but are **not** scoped here.

## 0. The premise that binds every phase

Each of these four findings is a rule that is true but **remembered** — the default run is safe
*if you know which dirs to ignore*, a write is complete *if you remember the follow-through*,
a route asks for the right day *if it composes the finders correctly*. Every phase below has
the same completion criterion: **the rule moves from memory into structure** — a type error, a
failing gate, or a failing test when it is broken, and green when it holds. A phase is not done
when the code is migrated; it is done when the guard that makes forgetting impossible exists and
has been watched to fail (the P9 / ADR-324 discipline).

## 1. Owner decisions that bind this plan

1. **S1 is deferred.** `tmp/Kallang` stays as tracked. Nothing in this plan depends on removing
   it; the one-line eslint ignore for `tmp/**` is *not* applied (it would be the S1 fix) so the
   owner's gate reports keep showing the tree he chose to keep. Consequence to remember: the
   lint stage stays red in `tmp/` throughout; every phase's verification reads lint as
   "clean outside `tmp/`".
2. **ADR numbering continues from this branch's register**: ADR-343…ADR-346, one entry per
   phase, written in the same change (AGENTS-decisions.md). The collision hazard recorded in
   the PR-7-vs-8 review (W1: this branch and the sibling both carry an ADR-342) applies: if the
   sibling branch lands first, these renumber at rebase and the supersession index records it.
3. **One commit per phase, on `arena/07ce096c-special-fiesta`** (PR #9), each commit message
   naming the layers that actually ran, per AGENTS-workflow.md §4.
4. **Behavior-preserving.** No schema change, no wire-contract change, no copy change. Phases 3
   and 4 are refactors plus guards; their tests must pass *before and after* untouched.

## 2. Phase 1 — S2: one gate-coverage contract (ADR-343)

**Goal.** Every `.ts`/`.tsx` file in the repo is covered by a stated tier, and the tiers are
declared in one place. `e2e/` and the root Playwright configs stop being typechecked by nothing.

### 2.1 Typecheck the e2e tier and the root configs

- **New file `tsconfig.e2e.json`** at the root:

  ```json
  {
    "extends": "./tsconfig.base.json",
    "compilerOptions": { "noEmit": true, "types": ["node"] },
    "include": ["e2e/**/*.ts", "playwright.config.ts", "playwright.*.config.ts"]
  }
  ```

  `tsconfig.base.json` already carries the full strict set (ADR-084) and `moduleResolution:
  "Bundler"`, under which `@playwright/test` (root devDependency) and `@psd/contracts`
  (workspace; `e2e/support/fixtures.ts` and `photo-api.ts` already import it) resolve exactly
  as they do for the four existing projects. Note `playwright.*.config.ts` does **not** match
  the bare `playwright.config.ts` — both patterns are listed.
- **`package.json`**: add `"typecheck:e2e": "tsc -p tsconfig.e2e.json --noEmit"` and chain it
  onto the existing `typecheck` script. `verify.sh` needs no edit — its `stage "typecheck"`
  runs the npm script, so the gate picks the new tier up automatically.
- **The strictness fallout is the point, not the cost.** First run will surface some number of
  `noUnusedLocals` / `exactOptionalPropertyTypes` / `noUncheckedIndexedAccess` findings in specs
  that only ever ran under Playwright's transpile-only path. Each is fixed, not suppressed
  (ADR-013's method). **Budget: half a day including up to ~15 fixes; if the count exceeds
  ~30, split the fixes into their own commit before proceeding.**

### 2.2 Bring `e2e/` into the standards gate — deliberately

- **`scripts/check-standards.mjs` line 56** — `isTest` must learn `.spec.ts` before the scan
  root is widened, or every e2e spec is audited as production code:

  ```js
  const isTest = (file) => /\.test\.tsx?$|\.spec\.tsx?$|\/tests?\/|\/test-utils\/|\/acceptance\//.test(file.path);
  ```

- **`SCAN_ROOTS`** gains `'e2e'` (line 18). Then run the gate and **triage every firing
  rule-by-rule**: each firing is either (a) a genuine catch in a spec — fix the spec — or
  (b) a rule whose file-scope never contemplated specs — scope the rule's path test and record
  why in the rule's comment. No firing is silenced by excluding `e2e/` again; that is the
  outcome this phase exists to prevent. Known candidates from a dry read: path-scoped rules
  (`checkComponentHookSplit`'s `apps/web/src/lib/hooks/` guard, `checkThemeSeparation`,
  `checkVenueIsolation`) are inert on specs; pattern rules that scan everything
  (`checkNoHardDeletes`, `checkIdMinting` — note `ID_MINTERS` and e2e's clock-derived `runId`,
  which mints no uuid and so is compliant) should be clean once `isTest` matches.
- **`scripts/*.mjs` stay eslint-only, stated as a decision, not an accident**: one paragraph in
  the gate's header comment recording that tooling scripts are JS by design and that typing the
  gate itself is the deferred S3 follow-up (its self-test).

### 2.3 Declare the contract in one place

A table in the header of `check-standards.mjs` (and one line in `AGENTS-workflow.md`):

| Tier | Coverage | Model |
|---|---|---|
| eslint | whole repo | global ignores (incl. `tournament_reference/**`; `tmp/**` deliberately not ignored — S1 deferred) |
| standards | `SCAN_ROOTS`: 4 src roots **+ e2e** | allowlist |
| typecheck | 4 project tsconfigs **+ tsconfig.e2e.json** | per-project includes |

### 2.4 Verification

- `npx tsc -p tsconfig.e2e.json --noEmit` green; `npm run typecheck` (now 5 projects) green.
- **Bite check:** add a mistyped fixture line to one spec (e.g. a wrong property on a
  `Page` call) → typecheck red; remove → green. Recorded in the ADR-343 entry.
- `npm run standards` reports the larger file count (was 808; e2e adds its 39) and 0 violations.
- Full `./verify.sh --fast` green except the standing `tmp/` lint (S1, deferred).

## 3. Phase 2 — S4: the default-run contract, made structural (ADR-344)

**Goal.** `playwright test` with no arguments once again means "safe against the shared dev
stack" — and that meaning is enforced by a gate, not by remembering to edit `testIgnore`.

### 3.1 One module owns the shared stanza (this also pays down S5)

- **New file `e2e/support/playwrightCommon.ts`** exporting:
  - `OWN_STACK_DIRS = ['full-event', 'dress-rehearsal', 'tessensohn']` — with a comment that
    the sibling branch's `mode-switch` joins on landing;
  - `ownStackIgnore(): string[]` → `OWN_STACK_DIRS.map((d) => \`**/\${d}/**\`)`;
  - `executableStanza()` → the `PSD_E2E_CHROMIUM` resolution and the
    `--no-sandbox --disable-gpu --disable-dev-shm-usage` launch flags (one home for the
    recipe `docs/proposals/…-greenfield-enhancements…` P16 documents);
  - `videoPolicy()` and `scratchStack({ webPort, apiPort, dataDir })` — the webServer block
    builder, with the **port registry** (3000/5173 main, 5174 full-event, 5175
    dress-rehearsal, 5176 mode-switch-on-landing) in one comment that says they must not
    collide, instead of five files each hardcoding one number.
- The four configs import the stanza and keep only their genuine differences (testDir,
  timeout, workers). Config edits are typechecked because Phase 1 landed first.

### 3.2 Restore and enforce the ignore contract

- `playwright.config.ts`: `testIgnore: ownStackIgnore()` — replacing the single
  `**/full-event/**` entry whose comment promises more than it delivers.
- **New standards rule 21, `e2e-stack-coverage`** (the structural bite): for every
  `playwright.<name>.config.ts` at the repo root, read its `testDir` (regex, as
  `checkDockerfileTwins` reads files); fail if the main config's `testIgnore` does not cover
  that directory:

  > `e2e/<name>/ has its own stack config but is not on the default config's ignore list — a bare 'playwright test' would run it against the shared stack (S4).`

  A new own-stack suite that forgets the ignore list now fails `npm run standards`.
- **Fix the summary line while in there**: `check-standards.mjs` prints a hardcoded
  `20 rules`; compute the count from the registered rules instead, so rule 21+ cannot make the
  banner lie (the same honesty rule ADR-094's amendment set for coverage titles).
- **`e2e/README.md`**: replace the stale taxonomy ("a spec that needs a running one belongs in
  `full-event/`") with the rule as it now holds: *a spec that mutates a singleton or sets a
  process-wide venue gets its own config **and** its directory joins `OWN_STACK_DIRS` — rule
  `e2e-stack-coverage` enforces the pairing.* State plainly that `test:e2e:serial` is the
  shared-safe suite at one worker, and each own-stack suite runs only through its named script.

### 3.3 Verification

- `npx playwright test --list`: **308 → 250 tests, 32 → 29 files** (the 58 dress-rehearsal and
  tessensohn instances leave the default run); `test:e2e:dress-rehearsal --list` still collects
  its 22 (11 × 2 engines); `test:e2e:tessensohn --list` still collects its 36.
- **Bite checks:** remove `tessensohn` from `OWN_STACK_DIRS` → standards rule 21 fires; delete
  the rule → re-induce the same gap and watch nothing fail (that is the defect being fixed),
  restore. Both recorded in the ADR-344 entry.
- **Environment note, stated plainly:** re-*running* the dress rehearsal in this sandbox
  requires rebuilding the `/tmp` Chromium (the NSS/NSPR recipe, proposals doc P16) after the
  sandbox reset; until then the `--list` counts above are the verification Playwright itself
  can give (the ADR-170 precedent), and the HTTP-level rehearsal suite
  (`tournament-rehearsal.test.ts`) carries the behavior.

## 4. Phase 3 — S10: the day policy, named once (ADR-345)

**Goal.** Routes stop composing day-finders; the two-axis choice (row state × kind) is made
once, with a name, and tested against the whole matrix. The ADR-326 close bug becomes
impossible to re-introduce by re-composing differently.

### 4.1 The inventory (verified at `1511eb9`)

| Site | Today's composition | Named policy |
|---|---|---|
| `routes-tournament/support.ts:75` (`readDay`) | `findDayTournament()` | `readersDay(db)` |
| `routes-tournament/desk.ts:59, 208` | `findDeskTournamentAnyKind()` | `deskDay(db)` |
| `routes-tournament/desk.ts:155` | `findOpenTournament(db, 'captains_ball')` | `openBracket(db)` |
| `routes-tournament/desk-day.ts:399` | `findOpenTournament() !== null` | `openDayExists(db)` |
| `routes-tournament/desk-setup.ts:64` | `findDraft() ?? findDeskTournamentAnyKind()` | `deskSetupSlot(db)` |
| `routes-tournament/desk-setup.ts:137` | `liveTournamentOfKind('captains_ball')` | `bracketIsLive(db)` |
| `routes-tournament/dumb.ts:69–75` | `findOpenTournament('dumb_courts') ?? findDayTournament('dumb_courts')` | `dumbDay(db)` (absorbs the existing helper of that name, which `reads.ts` already imports) |
| `tournament-scheduler/control.ts:40`, `planning.ts:182`, `restage.ts:238` | `findOpenTournament()` | `schedulerDay(db)` |
| `tournament/commands.ts:89` | `findOpenTournament(tx, kind)` inside the engine transaction, kind dynamic | **stays** — the adapter is the legitimate consumer of the primitive |
| `tournament-mode/mode.ts` (`findDraft`, `liveTournamentOfKind`) | exported helpers | move to the policy module; `mode.ts` keeps `readOperatingMode` / `liveTournaments` |

### 4.2 The module

- **New file `apps/api/src/tournament/dayPolicy.ts`** — the only non-`load.ts` importer of the
  finder primitives (plus the engine adapter's one sanctioned use, above). One function per
  row of the table, each carrying a doc comment naming its callers and its two axis choices:
  which row states it will return (draft / live / closed-started / discarded) and which kinds
  it will cross. `load.ts`'s four finders stay exported (the policy module and the adapter
  import them) but become **private by convention enforced in 4.3**.
- Any site whose composition does not match a policy's semantics on inspection is **not forced
  into the nearest policy**: it gets its own named policy. The point is one name per real
  policy, not fewer names. (Expect one or two such discoveries during migration; they are
  findings, recorded in the ADR-345 entry.)

### 4.3 The guard

- **New standards rule 22, `tournament-day-policy`**: the identifiers
  `findOpenTournament`, `findDayTournament`, `findDeskTournament`,
  `findDeskTournamentAnyKind`, `liveTournamentOfKind`, `findDraft` may appear only in
  `apps/api/src/tournament/load.ts`, `apps/api/src/tournament/dayPolicy.ts`, and test files.
  Anywhere else:

  > `import the named policy from tournament/dayPolicy.ts, not the finder (S10 — ADR-326's close bug was two routes composing the axes differently).`

### 4.4 The tests

- **New `apps/api/src/tests/tournament-day-policy.test.ts`** playing the full matrix on a real
  database: row states {empty, draft, live, closed-with-startedAt, discarded} × kinds
  {captains_ball, dumb_courts, both} — each policy's pick asserted, including the regression
  case named after the bug: **`deskDay` on a dumb-only day returns the dumb day, and on
  both-open prefers captain's ball — the desk's close and the console's Close button now
  literally share one function.**
- The size-loop suite (18) and the switch/ask suites (28) run unchanged — their pass is the
  integration proof that migration altered no behavior.
- **Bite checks:** swap `deskDay`'s preference order → the matrix test fails; remove the rule →
  re-introduce a direct finder import in one route file and watch nothing fail, restore.

## 5. Phase 4 — S9: the write boundary (ADR-346)

**Goal.** A tournament write cannot be expressed without its follow-through
(invalidate → `reconcile` → `sweepRosters` → `finishDrain`).

### 5.1 Where the wrapper lives, and why there

`afterWrite` composes `reconcile` (`tournament-scheduler/planning.ts`),
`finishDrain` (`tournament-mode/drain.ts`) and `sweepRosters` (`routes-tournament/bridge.ts`).
ADR-272's direction rule (enforced by `checkTournamentDirections`) allows only the composition
root — the routes layer — to see both halves, so **the wrapper stays in
`routes-tournament/support.ts` beside `afterWrite`**. Moving it into `tournament/` would
require re-housing `sweepRosters` first; that is S8's follow-up, noted in the entry, not
smuggled into this phase.

### 5.2 The wrapper

```ts
/**
 * ADR-346 — the only way a route writes the tournament day. The write commits; the
 * follow-through (invalidate → reconcile → sweepRosters → finishDrain) runs after it,
 * exactly as ADR-336 §11 ordered: a refusing close must never fail the completion that
 * triggered it. A write that throws (a refusal) runs no follow-through, as before.
 */
export async function withTournamentWrite<T>(
  db: AppDatabase,
  opts: { now: Date; isResult: boolean },
  write: () => Promise<T>,
): Promise<T> {
  const outcome = await write();
  await afterWrite(db, opts);
  return outcome;
}
```

Semantics are preserved line-for-line: same ordering, same propagation (a follow-through
failure still fails the route — the drain's writes are committed and must not be hidden), same
`isResult` per site.

### 5.3 The migration (all 9 sites, verified at `1511eb9`)

| File : line | `isResult` |
|---|---|
| `routes-tournament/actions.ts:129, 188, 209` | per act (completion = `true`) |
| `routes-tournament/desk-day.ts:88, 369` | `input.isResult` / `true` |
| `routes-tournament/desk-matches.ts:46` | `input.isResult` |
| `routes-tournament/desk-setup.ts:34` | `false` |
| `routes-tournament/dumb.ts:378, 430` (awards) | `true` |

Each `const x = await write(…); await afterWrite(…); return x` becomes
`return withTournamentWrite(c.get('db'), { now, isResult }, () => write(…))`.

### 5.4 The guard and the bites

- **New standards rule 23, `tournament-after-write`**: in non-test files under
  `apps/api/src/routes-tournament/`, the token `afterWrite(` may appear only in `support.ts`;
  every other file must use `withTournamentWrite`. (Tests stay exempt via `isTest` —
  `tournament-routes.test.ts:67` calls it directly today.)
- **Bite checks, watched to fail:** delete the wrapper's `afterWrite` call → the size-loop's
  "the bracket ends itself" scenario fails (`finishDrain` never ran) and the cache suite fails
  (tags never voided); delete the rule → induce a bare `afterWrite` in a route file and watch
  nothing fail. Restore both.

## 6. Sequencing

```
Phase 1 (S2, gates)      ──►  Phase 2 (S4, e2e contract)
        │                        config edits are typechecked; isTest already knows .spec.ts
        └──►  Phase 3 (S10, day policy)  ──►  Phase 4 (S9, write boundary)
                   same five route files: reads migrate first, then writes; diffs stay separable
```

Phase 1 first because everything after it edits files that then have a tier. Phase 3 before
Phase 4 because a review of `desk.ts` should not carry both a read-side and a write-side
migration. Phases 3/4 are independent of 2 and could run before it if the e2e work is blocked
on the Chromium rebuild.

## 7. Verification, honestly

| Layer | Baseline at `1511eb9` | After each phase |
|---|---|---|
| typecheck | 4 projects clean | 5 projects clean (P1+) |
| standards | 808 files / 20 rules / 0 | e2e added (P1); 23 computed rules (P2+) |
| lint | red only in `tmp/` (S1, deferred) | unchanged |
| web suite | 2,001 / 2,001 | unchanged by all four phases (no web code touched) |
| API tournament suites | 147 (16 files) + sizes 18 + mode/ask/tier 28 | run per phase; unchanged outcomes |
| Playwright default `--list` | 308 tests / 32 files | 250 / 29 after P2 (P3, P4: unchanged) |
| dress rehearsal (browser) | 11/11 (needs `/tmp` Chromium rebuilt post-reset) | P2 re-runs it if the rebuild is done; otherwise `--list` + the HTTP rehearsal suite, stated plainly |

This sandbox's standing limits, carried from the register: the whole-API suite in one process
hits `ERR_IPC_CHANNEL_CLOSED` (suites run individually — stated, never implied); the browser
tier needs the P16 NSS/NSPR rebuild after the reset.

## 8. Risks and rollback

- **P1 strictness fallout larger than budget** → split fixes into a preceding commit; rollback
  is dropping `tsconfig.e2e.json` from the `typecheck` chain (additive, one line).
- **P2** — a spec that secretly depended on running under the default config: the `--list`
  diff audit (58 named instances) is the check; all four own-config suites keep their named
  scripts, so nothing loses a way to run. Rollback: restore the single-entry `testIgnore`.
- **P3** — a site whose composition is load-bearing: the inventory table is reconciled
  policy-by-policy during migration; any mismatch becomes a new named policy, never a forced
  fit. Rollback: single revert; no data or contract surface touched.
- **P4** — ordering regression: the wrapper preserves order and propagation exactly; the
  tournament suites and size loop are the regression net, and the bite check proves they can
  fail. Rollback: single revert.
- **Cross-cutting** — the new standards rules themselves rot silently (S3's finding): each
  rule's bite check is *recorded in its ADR entry* as a reproducible command, and typing +
  self-testing the gate remains the recommended S3 follow-up once these land.

## 9. Commits, register, estimate

| Phase | Commit subject | Register | Estimate |
|---|---|---|---|
| 1 | `build(gates): e2e and the playwright configs join typecheck and standards (ADR-343)` | ADR-343 | 0.5 d |
| 2 | `test(e2e): the default run is shared-safe again, and a rule keeps it so (ADR-344)` | ADR-344 | 0.5 d |
| 3 | `refactor(api): the day policy named once — routes stop composing finders (ADR-345)` | ADR-345 + supersession rows for moved helpers | 1 d |
| 4 | `refactor(api): withTournamentWrite — the follow-through stops being optional (ADR-346)` | ADR-346 | 1 d |

Each register entry records: the finding id (S2/S4/S10/S9), the guard added, the bite check
with its command, and what was deliberately left out (S1 deferred; S3/S5–S8 referenced).
Total: ~3 days, four commits, one PR (#9), zero behavior change intended — and one behavior
class *removed*: the ability to forget.
