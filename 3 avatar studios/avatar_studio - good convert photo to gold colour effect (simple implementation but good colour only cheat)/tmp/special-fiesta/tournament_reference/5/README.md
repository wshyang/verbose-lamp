# Tournament Engine

A core tournament engine with a simulator and a live desk, built on the
common essence of the eight format simulators in this repository. The full
reasoning is in `docs/ASSESSMENT.md`; the living spec is `docs/SPEC.md`;
every decision beyond the problem spec is in `docs/ADDENDA.md`. Coding
discipline: `CLAUDE.md` (adopted from `GREENFIELD.md`).

## Run it

```bash
./dev.sh            # installs if needed, builds the frontend, serves on :3000
```

Open http://localhost:3000 — the simulator and the live desk are on one page.
Tests (100% coverage gate for `shared/`, `backend/`, `frontend/src/`):

```bash
npm run coverage
npm run typecheck
```

## What it does

- **Simulate nine formats** — round robin, single elimination, double
  elimination, consolation, Swiss, World Cup (groups + knockout), flighted
  quads, points rush, ironman — switching modes instantly. Inputs: teams,
  courts, match length, tournament length, start time, rest. Slots are
  placeholders (`Winner of SE-R1M1`, `#1 Group A`, record pools) — no winner
  is ever predicted.
- **See how matches link**: the bracket view lays rounds out left-to-right
  with feeder chips on every card; the timeline shows the same graph
  chronologically. The fit line always says what the day costs and whether
  it fits (FDS P-13) — an estimate, never a gate.
- **Wet weather**: change courts or match length and every match that has
  not started is re-timed (dependency- and team-aware). Live and finished
  matches stay as played — in the simulator instantly, at the desk via the
  contingency button (P-14).
- **Run the day from the desk**: open the simulation as a live tournament,
  start matches, record live scores, finalise to award points (win/draw/loss
  from config), stage matches by hand between any two teams, assign points
  directly, and **void** mistaken points with a reason — the ledger is
  append-and-void, never edited (P-09). Close the day as a deliberate act
  (refused over a live match, P-15).

## Architecture

| Layer | Where | Rule |
|---|---|---|
| Core engine | `shared/` | Pure: slot algebra, dependency-aware scheduler, standings, fit, contingency re-planning, nine generators. No I/O, no RNG winners. |
| Backend | `backend/` | Node HTTP + Drizzle over PGlite (real Postgres). One generic tournament graph in/out for **every** mode; mode is data, not schema. Soft deletes, UUIDv7, snapshot+migration twins. |
| Frontend | `frontend/src/` | React + hooks. All specialisation (mode names, colours, bracket columns, slot labels, resolution of `Winner of…` to real teams once results exist) lives here. Components never call the API; hooks do. |

API (all return the same generic graph): `POST /api/tournaments`,
`GET /api/tournaments[/:id]`, `POST /api/tournaments/:id/matches` (manual),
`POST /api/matches/:id/start`, `PATCH /api/matches/:id/score`,
`POST /api/matches/:id/finalise`, `POST /api/matches/:id/cancel`,
`POST /api/tournaments/:id/points`, `POST /api/points/:id/void`,
`POST /api/tournaments/:id/contingency`, `POST /api/tournaments/:id/close`,
`GET /api/health`, `GET /api/formats`.

## Deployment

`Dockerfile` (app on 3000/`0.0.0.0`, numeric non-root user, healthcheck),
`Dockerfile.dev`, `Dockerfile.cloudflared`, `.dockerignore` at the root;
SHIP-HATS carried inert as `*.shiphats` with `./activate-shiphats.sh`
(tested: renders placeholders, refuses clobbers without `--force`).
