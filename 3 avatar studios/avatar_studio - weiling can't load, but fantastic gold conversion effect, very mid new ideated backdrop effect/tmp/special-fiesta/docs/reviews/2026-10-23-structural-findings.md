# Structural findings — the seams the discipline missed

- **Date:** 2026-10-23
- **Scope:** the whole working tree at `ae0fd03` — `apps/api`, `apps/web`, `packages/contracts`,
  `packages/tournament`, `e2e/`, `scripts/`, root configs, and the tracked non-source trees.
  Method: dependency-direction greps, gate/configuration cross-checks, file-size and
  call-site inventories, and the register's own recorded defects used as evidence of which
  seams have already bitten.
- **Relation to [`2026-10-23-pr7-vs-pr8.md`](2026-10-23-pr7-vs-pr8.md):** that review found the
  weaknesses *between* branches. This one walks *inside* the branch and finds the same species —
  drift, duplication, unenforced conventions — in the code, the gates, and the test architecture.
- **Severity:** **H** (has already produced, or will silently produce, a defect) · **M** (cost is
  compounding; fix before it hurts) · **L** (hygiene).

| # | Finding | Severity |
|---|---|---|
| S1 | A 220 MB reference clone of the repo lives inside the repo, and is the reason lint is permanently red | **H** |
| S2 | Three gates, three exclusion models — nothing covers `e2e/`, `scripts/`, or the root configs consistently | **H** |
| S3 | The standards gate (1,221 lines, 26 rules) is the least-guarded file in the repository | **M** |
| S4 | The default Playwright run's safety contract is broken: 58 own-stack tests collect against the shared stack | **H** |
| S5 | Five Playwright configs, one copy-pasted stanza | **M** |
| S6 | Three test tiers claim to mirror each other; the API tier is 94 flat files | **M** |
| S7 | The contracts package runs on two size-capped catch-alls plus one emergency bolt-on | **M** |
| S8 | Two persistence architectures: `entities/` for the old domains, route-layer queries for the tournament | **M** |
| S9 | `afterWrite` is a convention each route must remember, not a boundary it cannot forget | **H** |
| S10 | "Which tournament is this about?" has four resolvers, composed ad hoc at 19 call sites — and it has already shipped a bug | **H** |
| S11 | `routes-court/` is a one-page orphan directory | **L** |
| S12 | `hooks/` is becoming the app's second `lib/`, with no internal structure | **M** |
| S13 | `gameboy.css` is a 2,265-line single stylesheet | **L** |
| S14 | The dev environment has three overlapping entry systems in two languages | **L** |
| S15 | `GREENFIELD.md` and the `AGENTS-*.md` set are two sources of the working standard | **L** |
| S16 | Tracked artifacts that are not source: `.DS_Store`, `initial-repo/`, `image-search/`, `.scene-src/` | **L** |

---

## A. Repository and gate architecture

### S1 — 34 % of the repository is a copy of the repository **[H]**

- **Evidence.** `git ls-files`: 3,217 tracked files, of which **1,104 are under `tmp/`** (1,103 in
  `tmp/Kallang/`, 220 MB on disk). The actual product — `apps/` + `packages/` + `e2e/` — is
  ~1,770 files; the reference clone is **62 % the size of the product**. It carries its own
  `.gitignore`, `.dockerignore`, `.gitlab-ci.yml.shiphats`, Dockerfiles — a complete stale repo
  snapshot, added by the owner in `90bf6d8` *"Reinstate Kallang files for reference yet again"* —
  the "yet again" recording that it has been removed and restored before.
- **Why it is structural, not cosmetic.** It is the root cause of a weakness both PR 7 and PR 8
  carry in their gate reports: **lint is permanently red in `tmp/Kallang`**, because
  `eslint.config.js` ignores `tournament_reference/**` (a *different* reference-copy convention,
  ADR-270) but not `tmp/**`. A permanently red sub-tree trains every reader that red is normal —
  the exact failure mode that let the two stale web tests survive ADR-331…342. It also doubles
  every grep, every IDE search, and every reviewer's file listing with a dead copy of the codebase.
- **Fix, respecting that the owner reinstated it deliberately.** One line now — add `tmp/**` to
  the eslint ignores (mirroring the existing `tournament_reference/**` precedent) and the
  permanent red ends. Then pick the durable home for reference trees: one ignored directory
  convention for all of them (`tournament_reference/`, `tmp/`, `image-search/`, `.scene-src/`
  are four conventions for one need — see S16), or move the clone out of the tree entirely
  (a git tag or branch plus a pointer in the register, which ADR-139's machinery can record).

### S2 — Three gates, three exclusion models **[H]**

- **Evidence.** The same question — *which files does a gate cover?* — is answered three
  incompatible ways:
  - **eslint** (`eslint.config.js`): everything in the repo, minus a global `ignores` list
    (node_modules, dist, `.data`, public, `tournament_reference/**` — but not `tmp/**`).
  - **standards** (`scripts/check-standards.mjs:18`): an allowlist — `SCAN_ROOTS` is exactly
    `apps/api/src`, `apps/web/src`, `packages/contracts/src`, `packages/tournament/src`. Hence
    "808 files checked": it never sees `e2e/` (39 files), `scripts/` (17), or the root configs.
  - **typecheck** (`package.json`): four tsconfig projects, whose `include`s are
    `apps/*/src/**` only. `e2e/**/*.spec.ts`, `playwright*.config.ts`, and all of `scripts/*.mjs`
    are in **no** TypeScript project. A type error in a spec or config surfaces only when
    Playwright happens to run that file — or as a runtime string bug of the kind ADR-170 caught
    with `--list` ("runtime strings, invisible to both tools").
- **The asymmetries this creates.** (a) `tmp/Kallang`: linted, never standards-checked (S1's
  permanent red). (b) `e2e/`: linted, but neither typechecked nor standards-checked — the
  testid rules, the hook-split rules, none of it applies to the specs that drive the real
  browser. (c) `scripts/`: linted only — including the 1,221-line standards gate itself and the
  749-line demo seeder (S3). (d) The five Playwright configs: in nothing.
- **Fix.** One shared answer. The cheapest coherent step: a `tsconfig.e2e.json` (specs + support
  + configs, `noEmit`) added to `npm run typecheck`, and a decision — recorded in the config
  comment — on whether standards' `SCAN_ROOTS` is an allowlist on purpose (if so, say why) or
  an accident of its first day (if so, add `e2e`).

### S3 — The gate that guards 808 files guards itself with nothing **[M]**

- **Evidence.** `scripts/check-standards.mjs`: 1,221 lines, 26 `check*` rule functions, an
  untyped `.mjs` in no tsconfig, with **no test file anywhere in the repo**
  (`find . -name "*check-standards*"` returns the script alone). Each rule's bite check was a
  one-time manual act, recorded in the register (ADR-049: "checked by inducing the drift and
  watching it fail") — nothing *regresses* it. A rule whose regex quietly stops matching after
  a path rename (the `checkNoCycles`/`resolvedImports` machinery resolves import paths by hand)
  turns the gate green while guarding nothing.
- **Why it matters more here than in an average repo.** The register's position (ADR-010) is
  that *a convention nothing checks decays* — and this repo has outsourced a large share of its
  conventions to this one script. It is the single point of failure for the standards regime.
- **Fix.** A `check-standards.test.ts` (or a `--selftest` mode) that runs each rule against
  small, deliberately-violating fixtures and asserts the rule fires — the gate's own bite
  check, automated. The P9 lesson applied to the tool that enforces P1.

## B. Test-suite architecture

### S4 — `playwright test` with no arguments no longer means "safe against the shared stack" **[H]**

- **Evidence.** `playwright.config.ts:130` ignores only `**/full-event/**`, with the comment:
  *"Ignoring it here keeps `playwright test` with no arguments meaning 'the suite that is safe
  to run against the shared dev stack'."* Since then, two more own-stack suites were added with
  their own configs and **nobody extended the ignore list**:
  - `e2e/dress-rehearsal/` — its own header: *"It runs on `playwright.dress-rehearsal.config.ts`,
    against a wiped database of its own, because it activates the singleton tournament."*
  - `e2e/tessensohn/` — needs `PSD_VENUE=tessensohn`; the shared stack is Sentosa.
  - `npx playwright test --list` against the default config collects **308 tests in 32 files,
    including 58 of theirs** (22 dress-rehearsal + 36 tessensohn instances across both engine
    projects). `npm run test:e2e:serial` — "everything, strictly one worker — the fallback" —
    runs them **against the shared dev stack**: the rehearsal activates the singleton
    tournament on it, and the venue specs assert a theme the stack is not wearing.
- **The taxonomy is stale too.** `e2e/README.md`'s two rules say a spec that needs a running
  tournament "belongs in `full-event/`" — written before dress-rehearsal (and the sibling
  branch's mode-switch) created the same class of suite outside that directory. There are now
  four answers to "which stack does a spec run against" and one of them is wrong by default.
- **Fix.** Extend `testIgnore` to the own-stack directories (or invert the contract: `testMatch`
  the shared-safe areas and let the special configs opt in), and update the README's taxonomy to
  name the rule that actually holds: *a spec that mutates a singleton or sets a process-wide
  venue gets its own config **and** its directory lands on the default config's ignore list.*

### S5 — Five Playwright configs, one copy-pasted stanza **[M]**

- **Evidence.** `playwright.config.ts`, `playwright.full-event.config.ts`,
  `playwright.dress-rehearsal.config.ts`, `playwright.tessensohn.config.ts` (four on this
  branch; the sibling PR 8 branch adds `playwright.mode-switch.config.ts`). Each re-declares the
  same machinery by hand: the `PSD_E2E_CHROMIUM` executable resolution, the
  `--no-sandbox --disable-gpu --disable-dev-shm-usage` launch flags, the video policy, the
  `PSD_E2E_VIDEO` off-switch, a `WEB_PORT`/`API_PORT` pair, and a scratch `PGLITE_DATA_DIR`.
  The ports are hand-coordinated across files (5173/3000 main, 5174 full-event, 5175
  dress-rehearsal, 5176 mode-switch) with no single place that knows they must not collide.
- **Why it is the ADR-170 lesson, half-applied.** That entry moved path arithmetic into one
  file (`e2e/support/paths.ts`) after a `git mv` broke three `dirname` joins "no type-checker
  could see". The config stanza is the same species: runtime-relevant strings, duplicated, that
  no tool relates to each other.
- **Fix.** `e2e/support/playwrightCommon.ts` exporting the executable/flags/video stanza (and a
  small port-registry); each config imports and adds only what makes it special. Five files
  become five *differences* instead of five copies.

### S6 — Three test tiers claim to mirror each other; only two of them do **[M]**

- **Evidence.** The mirroring discipline (ADR-170): web jsdom tests split by surface
  (`routes-participant/`, `routes-facilitator/`, …); e2e splits by surface
  (`e2e/{acceptance,participant,facilitator,superadmin,exclusive}`). The API's 94 test files are
  **flat** in `apps/api/src/tests/`, 20 of them `tournament-*` — one surface's tests are a fifth
  of the tier with no grouping. Meanwhile the web tier's per-surface files have grown into
  monoliths: `tournament-pages.test.tsx` 2,337 lines, `participant-pages.test.tsx` 1,624,
  `station-pages.test.tsx` 1,280.
- **Cost.** Navigation and review: a tournament regression means diffing a 2,337-line file
  beside 19 other flat files; file-level parallelism (the API tier's speed) is coarse-grained
  when one file holds 20 suites; and the "a spec's home is guessable from the surface it
  drives" promise silently does not hold for the tier with the most tests.
- **Fix.** Subdirectories in `apps/api/src/tests/` (the `fixtures/` subdir already exists), and
  splitting the three web monoliths per subtab — both moves are mechanical, and the register's
  supersession table is the place to record the rename (ADR-139's rule).

## C. Contracts and schema

### S7 — The contracts package runs on two size-capped catch-alls plus one emergency bolt-on **[M]**

- **Evidence.** `packages/contracts/src/`: `schemas.ts` 1,447 lines / 171 exports, `wire.ts`
  1,190 / 88, `tournament.ts` 759 / 67 — versus nine focused domain files (awards, sprites,
  venue, matchResult, clusters, titles, fieldHelp, messages, index) totalling ~1,300 lines.
  `tournament.ts`'s own header states the reason it exists: *"Its own module because the two
  shared files are at the size limit."* That is a **size-driven** split standing beside the
  **domain-driven** splits, in one package.
- **The failure mode.** The next domain that grows (mode/awards are the live candidates) will
  hit the same cap and force another emergency carve-out, each with its own import fan-in
  (`tournament.ts` already imports from both `schemas.ts` and `wire.ts`, which import from each
  other). The ADR-342 era added `ModeRequestView`/`TournamentModeView` to this pile — the
  catch-alls are still accreting.
- **Fix.** Decide the rule the package already half-follows: one file per domain, zod and types
  together (the `tournament.ts` shape). Migrate the catch-alls incrementally (a domain per
  change), or at minimum declare in `schemas.ts`'s header that new domains start their own file.

### S8 — Two persistence architectures, and the bigger domain uses the weaker one **[M]**

- **Evidence.** For the original domains: `db/entities/` — 26 files, one per domain, reads,
  writes and their cache invalidations paired in one file (ADR-038/094's rule: "the entity owns
  its reads and its writes, so the pairing is auditable in one file"). Route files confirm the
  discipline: their `db/schema` imports are `import type` only. For the tournament — the
  largest domain (`db/schema/tournament.ts` is the biggest schema module at 422 lines) — there
  is **no entity file**: reads and writes live in `routes-tournament/support.ts` (`readDay`,
  the cached read), `tournament/load.ts` + `persist.ts` (the engine adapter), and direct
  value-imports of `db/schema` in the route layer (`routes-tournament/reads.ts`,
  `routes-tournament/bridge.ts` — the only route files in the API that do so).
- **Consequence.** The auditability ADR-094 bought — read, write, and void in one file — does
  not hold for exactly the domain with the most writes and the most invalidation tags
  (`TOURNAMENT_TAG`, `COURT_TAG`, `LIVE_MATCH_TAG`, `SCOREBOARD_TAG` interplay). The tournament's
  cache-pairing knowledge is spread over `support.ts`, `mode.ts`, and the route files that call
  `afterWrite`.
- **Fix.** Re-house the tournament read model: either a `db/entities/tournament.ts` owning
  `readDay`/`readCourtRows`/the tag voids, or promote `routes-tournament/support.ts` to
  `tournament/reads.ts` with a name that says what it is. The direction is already clean
  (ADR-272, and `checkTournamentDirections` enforces it); the *placement* is the leftover.

### S9 — `afterWrite` is a convention each route must remember, not a boundary it cannot forget **[H]**

- **Evidence.** The tournament's post-commit follow-through — invalidate tags → `reconcile` →
  `sweepRosters` → `finishDrain` (the switch's bracket-end, ADR-336 §6.4) — is a function in
  `routes-tournament/support.ts:213`, invoked **manually at 9 call sites across 5 route files**
  (`actions.ts` ×3, `desk-day.ts` ×2, `desk-matches.ts`, `desk-setup.ts`, `dumb.ts` ×2), each
  passing its own `{ now, isResult }`.
- **The failure mode.** A new tournament write that forgets the call compiles clean and passes
  its own test — the write works — while leaving caches stale, seats unreconciled, and a
  switched day that never finishes its drain. Nothing enforces the pairing: no wrapper, no
  type, no standards rule (`checkTournamentDirections` guards only the ADR-272 package
  direction). The nearest precedent for what forgetting costs is ADR-326's close bug (S10) —
  same shape: a route doing its own half of a two-part invariant.
- **Fix.** Make the invariant structural: a `withTournamentWrite(db, { isResult }, fn)` that
  runs the write, then the follow-through, so the route cannot express the one without the
  other (the three-writers-one-transaction groundwork of ADR-336 phase 2 is the natural home);
  or, minimally, a standards rule that every route file that imports a tournament write helper
  also calls `afterWrite`.

## D. Domain-logic seams

### S10 — Four day-resolvers, composed ad hoc, and the composition has already shipped a bug **[H]**

- **Evidence.** "Which tournament does this request concern?" is answered by
  `findOpenTournament`, `findDayTournament`, `findDeskTournament`, `findDeskTournamentAnyKind`
  (`tournament/load.ts:181–224`), plus `liveTournamentOfKind` and `findDraft`
  (`tournament-mode/mode.ts`). They differ along two axes — row state (open / started-or-live /
  any) and kind (one kind / any kind) — and **route files compose the axes inline at 19 call
  sites**: `desk-setup.ts:64` `findDraft() ?? findDeskTournamentAnyKind()`; `desk.ts:59,155,208`;
  `dumb.ts:69,75` (open first, then day, for the dumb kind); `desk-day.ts:399`; …
- **It has bitten.** ADR-326's register entry records the defect verbatim: the desk's
  `POST /close` "always ran against the captain's-ball slot, while the console (and its Close
  button) resolves captain's ball first and dumb otherwise" — a dumb-day close 404'd, and the
  size-loop suite was the regression that caught it. Two routes composing the same axes
  differently is precisely the failure the four-resolver sprawl invites, and the fix (make
  close resolve "the same way the console does") re-implemented the policy a third time rather
  than naming it once.
- **Fix.** One resolver with the policy as a named parameter — e.g. `resolveDeskDay()` and
  `resolveReadersDay()` — unit-tested against the two-kind × three-state matrix (the size-loop
  suite already plays that matrix; its cases become the resolver's tests). Routes stop
  composing finders; `load.ts` keeps the primitives private.

### S11 — `routes-court/` is a one-page orphan directory **[L]**

- **Evidence.** `apps/web/src/routes-court/` holds exactly one page and its test
  (`CourtLineupsPage.tsx`, ADR-284 — "the court console gains a Line-ups subtab, as a new page
  beside the kept one"), routed in `App.tsx:150` at `/staff/court/:courtId/lineups` behind the
  `<Facilitator>` guard. Its sibling `CourtPage` — same URL prefix, same audience, same console
  — lives in `routes-facilitator/` with every other staff page. "A new page beside the kept
  one" was implemented as a new *directory*.
- **Cost.** The `routes-*` partition is the map the e2e suite mirrors and the "a spec's home is
  guessable" promise (ADR-170) depends on; one surface split across two homes erodes both for
  one file's worth of tidiness.
- **Fix.** Move the file and its test into `routes-facilitator/` (two imports change:
  `App.tsx`, and `fieldHelp.copy.test.ts`'s `COURT_ROUTES` path constant).

## E. Web application structure

### S12 — `hooks/` is becoming the app's second `lib/`, without `lib/`'s structure **[M]**

- **Evidence.** `apps/web/src/lib/hooks/`: 132 files, 18,344 lines — 77 of them non-test. The
  hook/component split (ADR-012: "logic must move into hooks to grow, which is the intended
  pressure") has succeeded to the point that the directory now holds pure helpers that are not
  hooks (`liveRoom.ts`, `stageFlowText.ts`), full page-level state machines
  (`useTournamentSetup.ts` 575 lines, `useFringeStation.ts` 499), and cross-cutting stores
  (`useAlertsStore.ts` 484) — all flat, while the routes, the jsdom tests, and the e2e specs
  are all partitioned by surface.
- **Cost.** The same surface-partition reasoning that organises everything else has no purchase
  here; the directory is where logic goes to be findable by naming convention alone, and the
  naming convention already has exceptions.
- **Fix.** Not a rewrite — a rule and a glidepath: hooks that own a surface's whole draft/state
  machine (setup, fringe station) get their machine extracted into `lib/` as pure functions the
  hook wraps (the `useLiveScore`/`makeEndingHandlers` pattern already in `useCourtConsole.ts`
  is the model); the two non-hook files move to `lib/`; new hooks land in per-surface
  subdirectories.

### S13 — `gameboy.css` is a 2,265-line single stylesheet **[L]**

- **Evidence.** The participant theme's entire styling lives in one file (next largest:
  `console.css` 832, `screen.css` 413). Its structural rules are asserted by string-matching
  the file (`gameboy.css.test.ts`, the ADR-265 pattern) — a working but size-brittle approach.
- **Cost.** Edit-conflict surface across parallel branches (the same pain class as S7's
  catch-alls), and review diffs that are hard to reason about at this length.
- **Fix.** Split by surface (shell, tabs, studio, chat, passport) keeping the CSS-test pattern
  per file; or accept and record the cap. Lowest priority of the findings — it is one file,
  well-tested for what it asserts — but it will not shrink on its own.

## F. Environment, docs, hygiene

### S14 — Three overlapping dev-environment entry systems **[L]**

- **Evidence.** Root holds `dev.sh` (204 lines) plus five satellites (`dev-stop.sh`,
  `dev-status.sh`, `dev-restart.sh`, `dev-reset.sh`, `dev-logs.sh`) over a shared
  `_dev-common.sh` (271 lines) — 864 lines of shell — alongside `scripts/dev.mjs` (the npm
  `dev` entry the Playwright configs actually boot), two compose files
  (`docker-compose.yml`, `docker-compose.db.yml`), `db-provision.sh`/`db-reset.sh`
  (ADR-249's provisioning critical section), and the two Dockerfile twins. The same stack can
  be brought up three ways, and only one of them is what CI and the e2e configs use.
- **Fix.** Fold the satellites into `dev.sh` subcommands (`dev.sh stop|status|reset|logs`) or
  port them to `.mjs` next to `dev.mjs`; keep shell only where Docker requires it. The
  one-command promise (GREENFIELD §9) is currently one command with six satellites.

### S15 — `GREENFIELD.md` and the `AGENTS-*.md` set are two sources of the working standard **[L]**

- **Evidence.** `GREENFIELD.md` (46 KB, the frozen template, not to be edited) and
  `AGENTS.md` + six `AGENTS-*.md` (58 KB, the binding instantiation, ADR-001) both sit at the
  root. ADR-001's decision adopts one as the other; both persist, and the register now
  documents that the template lags the practice — the entire subject of
  [`docs/proposals/2026-10-23-greenfield-enhancements-from-the-adrs.md`](../proposals/2026-10-23-greenfield-enhancements-from-the-adrs.md).
  A new contributor reading root-down meets the standard twice and must infer which binds.
- **Fix.** One header line in `GREENFIELD.md` marking it the frozen upstream template with a
  pointer to `AGENTS.md` as the living text — or move it under `docs/`. No content change; the
  proposals doc stays the place where the two are reconciled.

### S16 — Four conventions for "tracked but not source" **[L]**

- **Evidence.** `docs/.DS_Store` (macOS noise, tracked); `initial-repo/` (8 files — the
  pre-history Dockerfiles); `image-search/` (reference photographs); `.scene-src/` (39 raw
  PNGs). Each is small; together with `tmp/Kallang` (S1) they are **five** different answers to
  "where does non-source material live", none of them documented as a convention, one of them
  red.
- **Fix.** `.gitignore` + `git rm --cached docs/.DS_Store` now; then one directory convention
  (e.g. `reference/`, ignored by every gate — which S2's unified exclusion model would give
  for free) with a line in the README saying what lives there and why it is tracked at all.

---

## What was checked and found *sound* — the calibration list

Recorded so the findings above are read as seams, not as absence of discipline:

- **Workspace layering is clean and enforced.** No `packages/*` → `apps/*` import exists; the
  tournament engine imports *nothing* (not even contracts) and is fully standalone; web imports
  no API code; `checkNoCycles` and `checkTournamentDirections` police the boundaries.
- **The entity discipline holds everywhere it was adopted** — every non-tournament route file's
  `db/schema` imports are type-only (S8 is about the tournament's exception, not a general leak).
- **The authorization matrix cannot be forgotten**: an unclassified route fails the suite
  (`authorization-matrix.test.ts` — "a new route that no rule classifies fails this suite").
- **Engine refusal → HTTP is one table** (`routes-tournament/refusals.ts`), engine codes to
  contract copy, with a spoken default.
- **Cache tags are centralised** (`lib/cache.ts` defines every `*_TAG`; entities reference them).
- **The web test doubles are designed, not accreted**: `ambientRoutes.ts` is a named, typed,
  opt-in bundle with the catch-all explicitly rejected on the record (ADR-211).
- **The schema twin is guarded both ways**: `checkSchemaSingleSource` / `checkColumnsAgainstSchema`
  relate the Drizzle columns to `schema.sql`, so the 14-entry additive `ADD COLUMN IF NOT EXISTS`
  tail cannot silently diverge from the ORM (ADR-165/168's model working as designed).
- **The register's supersession machinery** (the tables at the top of `ADDENDA.md`) is the
  reason this audit could trace *why* each seam exists — the discipline this repo is strongest
  on, and the one its weakest seams (S1, S4, S10) would be cheapest to extend.

## Summary

The pattern across all sixteen: **the repo's disciplines are real but their boundaries were
defined once and not re-extended when the codebase grew past them.** The gates' file coverage
(S1/S2), the e2e safety contract (S4), the contracts package's split rule (S7), the entity
model (S8), the day-resolution policy (S10) — each was correct on the day it was written, and
each has a surface that accreted around it since. The register already contains the fix for
this meta-problem, in ADR-094's amendment discipline and ADR-298's "the four gaps a second
venue exposed": *when a boundary is crossed, the rule moves to where it bites.* These findings
are the current list of places where it hasn't yet.
