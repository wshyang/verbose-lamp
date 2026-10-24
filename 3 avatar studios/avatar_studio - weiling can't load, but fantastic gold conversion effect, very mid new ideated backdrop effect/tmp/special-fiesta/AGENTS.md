# AGENTS.md — PSD Active Day App

**Standing instructions for every agent and contributor working in this repository.**
Adopted from `GREENFIELD.md` (the project-agnostic template) and instantiated for this
project's real stack. `GREENFIELD.md` is kept as the upstream template and is **not** the
operative document — **this file and its section files are.** Where the two disagree,
`AGENTS.md` wins.

> Read this index first. Then `grep` the focused section file for the area you are touching
> instead of loading the whole corpus.

---

## 0. Section index

| File | Covers |
|---|---|
| `AGENTS.md` (this file) | Index, the stack, non-negotiables, definition of done |
| [`AGENTS-decisions.md`](AGENTS-decisions.md) | Living spec + numbered addenda register (**write the addendum in the same change**) |
| [`AGENTS-testing.md`](AGENTS-testing.md) | Tests-first, real DB, positive + session-scoping negative per route, fixtures, video-on, **e2e env knobs, photo corpus, recorded demo seed, gotchas** |
| [`AGENTS-database.md`](AGENTS-database.md) | ORM/one-casing policy, soft delete, UUIDv7, one-file schema + boot provisioning |
| [`AGENTS-function-design.md`](AGENTS-function-design.md) | Function size, guard clauses, params, naming, module structure, smell→remedy table |
| [`AGENTS-frontend.md`](AGENTS-frontend.md) | A component renders, a hook decides; JSX is presentation-only; `data-testid` convention |
| [`AGENTS-workflow.md`](AGENTS-workflow.md) | One-command local dev, **new-host first-hour checklist**, env/secrets, validation honesty, commit/PR expectations |

**Product contract:** [`fds.md`](fds.md) — *PSD Active Day App Functional Design Specification
(Core) v1.0*. It is the source of truth for objects, states, surfaces, features and flows.
Anything not dictated by it is an **addendum** (`docs/addenda/ADDENDA.md`), written in the same
change that makes the decision.

---

## 1. What this project is

A beach-optimised web app that runs a single-day agency sports event: pseudonymous participant
signup, participant-formed teams, an ad-hoc captain's ball tournament, QR-scanned fringe
activities, and a real-time cluster leaderboard. Three actor types with three deliberately
different UI languages:

- **Participant** — Gameboy/Pokémon-styled, Sentosa motifs, avatars, ≤1-tap QR.
- **Facilitator** — spartan, huge buttons, text-only, works with wet hands and glare.
- **Superadmin** — dense, text-only config and correction console with a full audit trail.

`fds.md` §1 is the executive summary; read it before touching any feature.

---

## 2. The stack (no placeholders — these are the real choices)

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9, ESM only, `strict` | No `any` in domain code; no CommonJS |
| Runtime / package manager | Node ≥ 20.11 · npm workspaces | Workspaces: `apps/api`, `apps/web`, `packages/contracts` |
| Backend | Hono 4 | `createApp()` returns an app exercised in tests via `app.request()` — **no listening socket in tests** |
| ORM | Drizzle ORM | The **only** property→column mapper that exists in this repo |
| Database | PostgreSQL — PGlite (embedded real Postgres) for dev/test, `pg` driver for deployed Postgres | Same SQL, same schema, one driver switch (`DATABASE_DRIVER`) |
| Schema | ONE hand-written file, applied whole on first boot (ADR-049) | `apps/api/src/db/schema.sql` — no migrations directory |
| Wire contracts | `@psd/contracts` — Zod schemas + inferred types, imported by **both** sides | A field rename is a compile error, never a runtime `undefined` |
| Frontend | React 19 + Vite 7 + React Router 7 | Components render, hooks decide (`AGENTS-frontend.md`) |
| Styling | Hand-written CSS with design tokens (`src/styles/`) | Two themes: `theme-gameboy` (participant) and `theme-console` (admin) |
| Backend tests | Vitest against a **real PGlite database**, through `app.request()` | Never mock the data-access layer |
| Frontend unit tests | Vitest + Testing Library + `renderHook` | May mock the API boundary only |
| E2E | Playwright, **video on by default** (`PSD_E2E_VIDEO=off` to disable) | Real UI, real backend, no mocks |
| Static gates | `tsc -b`, ESLint 9 flat config, `scripts/check-standards.mjs` | The standards below are machine-enforced |

---

## 3. Non-negotiables (the short list)

1. **Record every decision in the same change that makes it.** New addendum in
   `docs/addenda/ADDENDA.md`, sequentially numbered `ADR-NNN`, never a follow-up commit.
   → `AGENTS-decisions.md`
2. **Tests first, real database, no repository mocks.** Every route gets a positive test **and**
   a session-scoping negative test (a valid session belonging to the *wrong party* must be
   rejected — a bare 401 proves auth, not authorization). → `AGENTS-testing.md`
3. **One casing, one mapper.** camelCase in TypeScript, snake_case in Postgres, translated by
   Drizzle and by nothing else. Hand-written mappers are a two-sources-of-truth trap and are
   forbidden. → `AGENTS-database.md`
4. **Soft deletion, never hard `DELETE`.** `expires_at` + partial unique index
   (`WHERE expires_at IS NULL`) + `invalidate*()` repo methods + active-row filtering on every
   read *and every authorization check*. → `AGENTS-database.md`
5. **Schema changes edit `schema.sql` in place.** One definition, no migrations directory
   (ADR-049); `npm run standards` fails if Drizzle maps a table the snapshot never creates.
6. **UUIDv7, minted in exactly one place** (`apps/api/src/db/ids.ts`). System actors are real
   rows, never sentinel strings.
7. **Snapshot at write time.** `FringeScan` and `TournamentMatch` freeze activity name, round
   number, point values and facilitator username at write time (`fds.md` — Snapshot Convention).
   Never lazy-join a historical value.
8. **Void is reversible and always writes a `VoidAuditEntry` with a reason.** Voided rows are
   excluded from every scoring read.
9. **Functions ≤ 50 lines (target 20), nesting ≤ 3, params ≤ 3, no flag arguments, no mutation
   in place, files ≤ 800 lines.** → `AGENTS-function-design.md`
10. **A component renders, a hook decides**, and the JSX interior is presentation-only — no
    `.filter()`/`.reduce()`/`.sort()`/`.find()` inside a `return (…)`. → `AGENTS-frontend.md`
11. **`data-testid` on every interactive element at authoring time**, named
    `{component-kebab}__{element-role}`. → `AGENTS-frontend.md`
12. **Say which validation layer you actually ran.** Never claim "tests pass" for a layer you
    did not execute. → `AGENTS-workflow.md`
13. **Assert what outlives the test.** Read the persisted state back rather than the screen; drive
    the path the user takes, not the one you built; assert *computed* presentation for anything whose
    purpose is visual; write the failing e2e spec before the fix and watch it fail for the right
    reason. A passing test over broken code certifies the defect, and a coverage percentage cannot
    tell the two apart. → `AGENTS-testing.md` §1.1

> Numbering note: these are cited by number from `docs/addenda/ADDENDA.md`. **Append, never insert** —
> renumbering silently redirects every existing citation.

---

## 4. Project-specific invariants (from `fds.md`)

These are the rules an agent most often breaks because they are cheap to overlook. Each one has
a test; if you change the behaviour, change the test in the same commit.

> **ADR-270 (2026-10-15):** the old tournament (courts, matches, fixtures, rounds, PointConfig's
> rates) has been removed ahead of a modular rebuild. The tournament rows below describe the FDS
> contract the rebuild must honour again; until it lands they have no enforcement in this tree.
> Team rows are unaffected. The rebuild's own invariants are appended here, never inserted.

| Invariant | Where | Enforcement |
|---|---|---|
| A participant is on **at most one team** | R2 / §4.2.1 | Partial unique index on `(participant_id) WHERE expires_at IS NULL` + repo guard |
| **Exactly one captain** per team, and the captain is a member | §4.2.2 | Partial unique index on `(team_id) WHERE is_captain AND expires_at IS NULL` |
| Captain leaves → captaincy **auto-transfers to earliest `joined_at`**; sole member leaves → team disbands | §4.2.3–4 | `teamsRepository` transaction |
| Winner ∈ {team_a, team_b} at completion **and** at superadmin edit | §4.2.5 | Route guard + test |
| At most **one `open` *or* `ended` round** per activity | §3.3 / §4.2.6 | Partial unique index `WHERE status IN ('open','ended')` |
| **PointConfig bootstrap gate**: no match may start until win + loss points are set | §4.2.7 | Route guard + disabled CTA with the spec's message |
| Scan idempotency on `client_scan_uuid`; duplicate POST returns the **existing row** | §4.2.11 | Unique index + `ON CONFLICT DO NOTHING` + re-read |
| One scan per `(participant, round)` — **first-write-wins** on offline sync collision | §2.9 | Unique index + conflict branch |
| Offline sync **trusts the client's `round_ref`** even if the round has since closed | DC-004 | Deliberate: documented in `ADR-009` |
| Nickname and team name uniqueness are **case-insensitive** | §4.2.9–10 | Unique index on `lower(...)` |
| Court disable is **soft** — an in-progress match continues | §3.4 | Guard only on match *start* |
| Deactivating an activity **auto-closes** its open/ended round | §3.5 | Repository transaction |
| Avatars render on **participant surfaces only** (S3–S17, S60) | §5.5 | `check-standards.mjs` forbids avatar imports under `routes-facilitator/`, `routes-superadmin/` |
| Error copy is **exactly** the string in the `fds.md` object tables | §2 | `packages/contracts/src/messages.ts` is the single source; never inline a message |
| **Rebuild (ADR-272):** the engine core never imports the scheduler; the core adapter never imports the scheduler adapter; neither imports app team/participant modules | ADR-272 | `check-standards.mjs` rule `tournament-direction` |
| **Rebuild (ADR-273, superseded by ADR-293):** at most **one open tournament *per kind*** (draft or live) | ADR-293 | Partial unique index `ux_tournament_one_open_per_kind ON tournament (kind) WHERE status <> 'closed'` |
| **Rebuild:** at most **one live match per court** | §2.5 / ADR-275 | Partial unique index `ux_tournament_match_live_court WHERE status = 'in_progress'` |
| **Rebuild (ADR-276):** tournament points reach people through the **roster frozen at kick-off** (or the team as it stands, for a desk award, walkover or bye); a correction re-pays the same people | ADR-276 | `tournament_match_roster` / `tournament_award_roster`; `tournament-points-bridge.test.ts` |
| **Rebuild (ADR-274):** a person's placement (a **pin**) is kept by the planner until released, and a released pin is closed with `released_at`, never deleted | ADR-274 / ADR-289 | `tournament-scheduler.test.ts` "keeps a pinned match where a person put it" |
| **Rebuild (requirement 9):** a **terminated scheduler never re-plans**; every placement after that is a person's | ADR-274 | `tournament-scheduler.test.ts` "stops for good when terminated" |

---

## 5. Where things live

```
apps/api/src/
  app.ts                 createApp(): Hono app, no socket — what tests exercise
  index.ts               the only file that opens a port
  db/
    ids.ts               the ONLY place a UUID is minted (UUIDv7)
    schema/              Drizzle tables, grouped by domain, barrel-exported
    entities/            repositories, grouped by domain (no raw SQL for CRUD)
    schema.sql             THE schema; applied whole on first boot by bootstrap.ts
  tournament/            core adapter: load, persist, commands, setup (ADR-272)
  tournament-scheduler/  scheduler adapter: activate, reconcile, contingency, pins (FKs the core)
  routes-auth/ routes-participants/ routes-teams/ routes-tournament/
  routes-fringe/ routes-leaderboard/ routes-superadmin/ routes-staff/
  routes-chat/ routes-team-chat/ routes-gallery/ routes-swag/ routes-status/
  views/                 row record → wire view; the ONLY place a view is shaped
  lib/                   session, errors, guards, validation, caches, the buses
  webStatic.ts           serves the built SPA when the API is the only origin (ADR-043)
  tests/                 integration tests, real DB, by domain
apps/web/src/
  components/            render only — MUST NOT import lib/api
  lib/hooks/             decide: API calls, derivations, validation (+ co-located tests)
  lib/api/               the wire boundary, typed from @psd/contracts
  lib/storage/           the ONLY place localStorage is touched; one module per key
  routes-participant/ routes-facilitator/ routes-superadmin/
  routes-court/          the court console's Line-ups subtab (ADR-284), beside the kept console
  routes-superadmin/tournament/  Control, Timetable, Simulator (ADR-279)
  themes/<venue>/        everything one venue owns: palette CSS, scene components, generated art (ADR-294)
  styles/                tokens + the two themes
packages/contracts/src/  Zod schemas, inferred types, canonical user-facing messages
packages/tournament/src/ @psd/tournament: the pure engine — core/ (decides) and scheduler/ (formats, planner)
docs/addenda/ADDENDA.md  the numbered decision register
apps/web/scripts/motifs/  motif pipeline (venue-agnostic); scripts/themes/<venue>/ holds one venue's art sources
apps/web/public/themes/<venue>/  that venue's generated motifs and scene layers
e2e/                     Playwright specs (video on by default)
```

**Group by domain feature, never by type.** No `controllers/`, `models/`, `services/`.

---

## 6. Definition of done for any change

- [ ] Behaviour matches `fds.md`; anything it does not dictate has an `ADR-NNN` entry **in this
      change**.
- [ ] Schema touched → `schema.sql` edited in place, and Drizzle `db/schema/` kept in step.
- [ ] Route added/changed → positive test **and** wrong-party negative test, same commit.
- [ ] New interactive element → `data-testid` at authoring time.
- [ ] `npm run verify` (typecheck + lint + standards + unit/integration suites) is green, and
      the commit message states which layers actually ran (`AGENTS-workflow.md` §4).
- [ ] No function > 50 lines, no file > 800 lines, no API import inside `components/`, no
      derivation inside JSX.

---

## 7. The up-front decisions (GREENFIELD §10), answered

1. **Source of truth** — `fds.md`; addenda in `docs/addenda/ADDENDA.md` numbered `ADR-NNN`,
   independent of FDS section numbering.
2. **Test isolation** — Vitest + a per-run PGlite database; `.env.test`; never the dev data dir;
   tests-first, real DB, no repository mocks. **Which layer asserts what** is settled in
   `AGENTS-testing.md` §1.1: integration reads the row back, hook tests read the returned value,
   Playwright owns anything that has to be *seen* — and a preview is never the thing asserted.
3. **ORM / casing** — Drizzle, camelCase TS ↔ snake_case SQL, no hand-written mappers.
4. **Object model** — UUIDv7 from `db/ids.ts`; soft delete via `expires_at`; system actor is a
   real `facilitator_account` row (`system`), never a sentinel string.
5. **Schema evolution** — `schema.sql` alone, applied on first boot and via `npm run db:setup`
   (ADR-049). Numbered migrations return when there is a live deployment to migrate.
6. **Contracts** — `@psd/contracts` Zod schemas shared by both sides; `data-testid` convention
   `{component-kebab}__{element-role}`.
7. **Test layout** — `apps/api/src/tests/` (integration), `apps/web/src/**/*.test.ts(x)` beside
   the hook, `e2e/` (Playwright, video on by default).
8. **Fixtures** — realistic Singapore-flavoured name pools per cluster, unique per run
   (`{label}.{runId}`).
9. **Validation honesty** — `AGENTS-workflow.md` §4: name the layer you ran; add the caveat to
   the commit when the full gate could not run.
10. **Local env** — `npm run dev` stands up API + web + database in one command;
    `.env.example` / `.env.test` committed, real `.env` never.
11. **Function design** — enforced by ESLint (`max-lines`, `max-lines-per-function`, `max-depth`,
    `max-params`, `complexity`) plus `scripts/check-standards.mjs` for the structural rules a
    linter cannot see.

`GREENFIELD.md` §10 now carries eight more, distilled back out of this project's register and
section files after the fact. They are already how we work; this is where each one is written
down in operative form:

12. **Bite checks** — sabotage the code and watch the test fail, and end the addendum with the
    sabotages that were watched to fail. The register is full of them; `docs/outstanding-tasks.md`
    §8 and §14 are the two systematic sweeps. → `GREENFIELD.md` §2.2
13. **Enforcement per rule** — `scripts/check-standards.mjs`, the self-asserting
    `authorization-matrix.test.ts`, and the ADR-080 coverage ratchet. → §2.3
14. **Stub policy** — `AGENTS-testing.md` §10 (both models stated, absence pinned,
    `PSD_E2E_REAL_MODEL=1` against the genuine one). → §3.1
15. **Flakes and timeouts** — `AGENTS-workflow.md` §4b. → §3.2–3.3
16. **Record-keeping in the data model** — the FDS Snapshot and Void/Audit conventions, plus
    scan idempotency on `client_scan_uuid` (§4 of this file). → GREENFIELD §4
17. **Normative copy and generated files** — `packages/contracts/src/messages.ts` is the single
    source; `apps/web/src/lib/avatarArt.ts` is generated and edited at its generator. → §6
18. **Executable environment scripts** — `./dev.sh` and companions, `./verify.sh`, and
    `AGENTS-workflow.md` §1b's first-hour checklist. → §9.1–9.2
19. **Platform CI/CD** — the SHIP-HATS webapp-E2E file set is in the repo **inert**
    (`.gitlab-ci.yml.shiphats` + `BUILD`/`TEST`/`DEPLOY.gitlab-ci.yml.shiphats`), turned on only by
    `./shiphats-activate.sh`; `docs/design/ship-hats-pipeline.md` separates what was measured from
    what was only read from the platform's docs, and `check-standards.mjs`'s `shiphats-pipeline-set`
    rule keeps the set, its prompts and any live file in step. → `GREENFIELD.md` §9.3, ADR-243
