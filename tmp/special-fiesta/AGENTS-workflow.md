# AGENTS-workflow.md — local dev, environment, validation honesty

> Section file of [`AGENTS.md`](AGENTS.md). Adopted from `GREENFIELD.md` §8–9.

## 1. One command stands up everything

```bash
./dev.sh                     # database + API (:8787) + web (:5173), one command
```

`./dev.sh` wraps the three commands below with the preflight that is otherwise done from
memory — Node version, `.env`, dependencies, port conflicts, a readiness probe, and a demo
seed on a brand-new database. It is a convenience, not a second source of truth: if it and
`npm run dev` ever disagree, `npm run dev` is right and the wrapper is the bug.

```bash
npm install
cp .env.example .env         # then edit SUPERADMIN_INITIAL_PASSCODE
npm run dev                  # what ./dev.sh ends up running
```

| Script | Wraps | Adds |
|---|---|---|
| `./dev.sh` | `npm run dev` | preflight, `--detach`, readiness wait, auto-seed on a fresh DB |
| `./dev-stop.sh` | — | stops a detached stack by process **group**; `--force` reclaims orphaned ports |
| `./dev-restart.sh` | — | stop + start detached |
| `./dev-status.sh` | — | ports, holders, database, `.env`, node version |
| `./dev-logs.sh` | — | `tail -f .dev/dev.log` |
| `./dev-reset.sh` | — | wipes **`apps/api/.data/dev`** — the directory §11 of `AGENTS-testing.md` warns about |
| `./verify.sh` | `npm run verify` | per-stage pass/fail, timings, and a reminder to name the layer you ran |
| `./refresh-demo-seed.sh` | `npm run demo:record`, `seed:demo`, `db:export-demo` | regenerates `seed-demo.sql` from the dump: records (unless `--skip-record`), replays onto a new empty database, exports, and checks the result (ADR-237). Commits nothing |

Two things the scripts know that a hand-rolled one would get wrong, both found by testing them
rather than by reasoning about them:

- **`npm run` does not forward SIGTERM to its grandchild.** Signalling the npm process leaves
  `scripts/dev.mjs` re-parented to init with both ports still held. The stack is therefore
  started in its own process group and taken down by group.
- **A slim container may have neither `lsof` nor `fuser`.** `./dev-status.sh` falls back to
  reading `/proc/net/tcp` for the listening socket's inode and matching it against `/proc/*/fd`,
  so "who holds this port" still has an answer where it matters most.

`npm run dev` starts the API (which migrates and seeds the database on boot) and the Vite dev
server, which proxies `/api` to the API. There is no separate database process to babysit:
`DATABASE_DRIVER=pglite` runs a real PostgreSQL engine in-process, persisted under
`apps/api/.data/dev` (git-ignored — `PGLITE_DATA_DIR` is relative to the **API's** cwd,
see `AGENTS-testing.md` §11 before wiping anything).

**The driver follows `DATABASE_URL`** (ADR-051). Set it and the app talks to that server; leave it
unset and the database is embedded PGlite under `.data/dev`. There is no second switch to remember,
and an empty database is provisioned from `schema.sql` on first boot (ADR-049) — no migration step.

Developing against a real Postgres server:

```
docker compose -f docker-compose.db.yml up -d
DATABASE_URL=postgresql://psd:psd@127.0.0.1:5432/psd_active_day npm run dev
```

A managed provider is the same one variable; `pg` parses `sslmode` itself, so a Neon-style
`postgresql://user:pass@host/db?sslmode=require` needs nothing extra. `DATABASE_DRIVER` exists only
to override the inference, which is what the test harness uses so a `DATABASE_URL` in your `.env`
can never point the suite at a real database.

**The deployed driver has its own opt-in test**, because everything else runs on PGlite and the two
disagree about `bytea` (`pg` returns a `Buffer`, PGlite a `Uint8Array`):

```
PSD_TEST_DATABASE_URL=postgresql://psd:psd@127.0.0.1:5432/psd_active_day npm run test:api
```

| Command | What it does |
|---|---|
| `npm run dev` | Full local environment |
| `npm run db:setup` | Provision and seed a database without booting the server |
| `docker compose -f docker-compose.db.yml up -d` | A Postgres server for local development (ADR-051) |
| `docker compose up -d --build` | Deployment: app + Postgres + tunnel (ADR-043/051) |
| `npm run typecheck` | Project-wide `tsc -b` |
| `npm run lint` | ESLint 9 (function-design limits) |
| `npm run standards` | Structural invariants a linter cannot see |
| `npm run test` | API integration (real DB) + web unit suites |
| `npm run test:e2e` | Playwright against a running stack (video on by default) |
| `npm run seed:demo` | A walkthrough's worth of data through the real API — replays the recorded dump (ADR-040) |
| `npm run demo:record` | Re-record the demo crowd: one real onboarding per persona in `scripts/demo-personas.json`, on a wiped server → `scripts/demo-participants.dump.json` |

## 1b. First hour on a new host — the handoff checklist

Everything below assumes internet access; the sandbox workarounds it replaces are in
`AGENTS-testing.md` §9.

1. `npm install && cp .env.example .env` (set `SUPERADMIN_INITIAL_PASSCODE`).
2. `npm run verify` — typecheck, lint, standards, API + web suites. Green before anything else.
3. `npm run e2e:install` — Chromium **and** WebKit; both engines run by default (ADR-044).
4. `npm run test:e2e` — four projects (two engines × phone/desktop), including the eighty-photo
   corpus once per engine. `npm run test:e2e:chromium` narrows it while iterating, and
   `PSD_E2E_PHOTO_SAMPLE=8` makes the corpus quick.
5. `PSD_E2E_REAL_MODEL=1 npm run test:e2e` — adds the one test that loads the **genuine**
   Transformers.js and MODNET weights; ADR-045 was a bug only that test could see.
6. `./refresh-demo-seed.sh` — re-record the demo seed with the genuine Transformers.js + MODNET
   pipeline (real silhouettes; budget ~30 min, weights download once), then regenerate
   `seed-demo.sql` from it (ADR-237). Then `npm run dev` + `npm run seed:demo` and look at the
   leaderboard.
7. Five minutes with a real iPhone on the deployed URL: camera permission, photo picker,
   model download on cellular. No simulator answers those honestly.
| `npm run stress` | 300-user event-day load simulation (ADR-025) |
| `npm run photo:review -w @psd/web` | Photo → sprite conversion sheet (ADR-031) |
| `npm run verify` | typecheck + lint + standards + test — **the merge gate** |

## 2. Environment and secrets

- `.env.example` and `.env.test` are **committed templates**; a real `.env` is **never**
  committed (`.gitignore` enforces it).
- `.env.test` points at a **separate, per-run in-memory database**. Dev and test never share a
  database. Not negotiable.
- `SUPERADMIN_INITIAL_PASSCODE` is **required** at deploy time (`fds.md` §8.3). Seeding fails
  loudly without it:
  `SUPERADMIN_INITIAL_PASSCODE environment variable required for initial superadmin seeding.`
- Config is read exactly once, in `apps/api/src/env.ts`, and validated with Zod. No
  `process.env` access anywhere else.
- The **pipeline files are inert by name**: `.gitlab-ci.yml.shiphats` and the three beside it
  (`BUILD`/`TEST`/`DEPLOY.gitlab-ci.yml.shiphats`). GitLab reads `.gitlab-ci.yml`, so a differently
  named file is a proposal that costs nothing — nothing in the repo is gated by them, and
  `./verify.sh` remains the whole gate. The only way to change their shape is
  `./shiphats-activate.sh`, which prompts for what the repo cannot answer, validates each value,
  refuses to overwrite an existing live config and refuses to write a file with an unanswered
  placeholder. `--revert` removes the live files and keeps the inert set.
- **Pipeline credentials are GitLab CI/CD variables, never file contents** — the same rule as
  `.env`. The activation script has no prompt for a token; it prints the list to create under
  Settings → CI/CD → Variables (masked, and protected for anything that can reach production) and
  the compliance-framework step that must be done in settings, not in YAML.
  `scripts/check-standards.mjs` enforces the set's consistency (`shiphats-pipeline-set`).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | API port |
| `DATABASE_DRIVER` | `pglite` | `pglite` \| `postgres` |
| `DATABASE_URL` | — | required when driver is `postgres` |
| `DB_INIT` | — | `schema` \| `demo`; provision `DATABASE_URL` before the server starts (ADR-249). `demo` calls `db-provision.sh --demo`. Needs `DATABASE_URL`; `demo` also needs `SUPERADMIN_INITIAL_PASSCODE` |
| `DB_INIT_RESET` | — | `stale`: with `DB_INIT`, reset a database whose stamped schema version is older than the binary's before provisioning (ADR-264). Inert without `DB_INIT`; newer-stamped databases refuse |
| `DATABASE_URL_ADMIN` | — | with `DB_INIT`: provision as this role instead of `DATABASE_URL`, then grant the `DATABASE_URL` role access (ADR-252) |
| `PGLITE_DATA_DIR` | `.data/dev` | `memory://` for tests |
| `SUPERADMIN_INITIAL_PASSCODE` | — | **required**, 4 digits |
| `SESSION_TTL_DAYS` | `30` | long-lived cookie (`fds.md` F3) |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `PSD_E2E_VIDEO` | `on` | `off` disables Playwright video |

## 3. Git and review expectations

- Work in small, coherent commits. A commit that changes a route changes its tests too.
- The commit message names the FDS anchors touched (`S27 #surf-scan`, `F44`) and the `ADR-NNN`
  written with it.
- Never commit generated artefacts, `.data/`, `test-results/`, or real `.env` files.

## 4. Validate early and honestly

**The static checking layer is not a substitute for real tests.** When the full toolchain is
unavailable (sandbox without a browser, no network), you may fall back to per-file syntax
checks, executing pure modules, and grepping structural invariants — but then:

1. **Say exactly which layer you ran.** "Typecheck + lint + API integration suite against a real
   PGlite database: green. Playwright: not run — browsers unavailable in this environment."
2. **Never claim "tests pass"** for a layer you did not execute.
3. **Append the caveat to the commit message** so a reviewer knows what still has to run before
   merge.

The real gate before merge is always: full type-check, full lint, full standards, the API
integration suite against a real database, and the Playwright suite against a real browser.

## 4b. Short timeouts, frequent polling

**A generous timeout does not make a run safer. It converts a fast failure into a long stall.**

- **Set a timeout close to the measured cost of the work**, not to the worst case you can imagine.
  If a step takes ~2 s, allow tens of seconds — not minutes. When the real cost is unknown, measure
  one iteration first and set the limit from that number.
- **Poll frequently and print progress.** Check a long operation every 15–30 s rather than sleeping
  for its whole expected duration: a job that has already failed, or that is running far slower than
  predicted, should be visible within seconds. Prefer a signal that counts *work done* (rows written,
  files produced) over one that only says "still running".
- **Kill and fix rather than wait it out.** If polling shows the rate is wrong, stop the job. Waiting
  for a known-bad run to finish is the most expensive way to learn nothing.
- In Playwright, keep `test.setTimeout` proportionate and let per-assertion timeouts do the waiting.
  A whole-test timeout is a backstop, not a budget.

Two incidents this rule comes from, both in this repo:

- `e2e/seed-social.spec.ts` was written with `test.setTimeout(300_000)` when each action had already
  been measured at ~2 s. A wrong PIN made a sign-in hang, and the 5-minute ceiling turned an instant,
  obvious failure into a five-minute stall. At 120 s the very next failure surfaced in 2 s.
- `demo:record` allowed **180 s per photo** under `PSD_E2E_REAL_MODEL=1`. That number was not a
  measurement, it was cover for a defect: the recorder created a fresh browser context per persona,
  so the segmentation model was re-initialised eighty times instead of once. The generous timeout hid
  the waste for as long as it was tolerated. Fixing the cause made the ceiling unnecessary.

The pattern in both: **an oversized timeout is usually concealing something worth fixing.**

## 5. When you are about to break a rule

You occasionally will — a spec gap, an external constraint, a deadline. The rule is not
"never deviate", it is **"never deviate silently"**:

1. write the `ADR-NNN` entry (`AGENTS-decisions.md`) in the same change;
2. reference it in a code comment at the site of the deviation;
3. add the test that pins the behaviour you chose.
