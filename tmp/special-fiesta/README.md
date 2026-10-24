# PSD Active Day App

On-the-day event operations for a single-day agency sports event at Sentosa beach:
150–300 participants on their phones, 10–20 facilitators, two superadmins, one laptop,
beach Wi-Fi. Participants sign up with a nickname and PIN, get a pixel-art avatar (drawn
from a catalogue, or cut out of their own selfie), carry a QR badge to stations, join
teams, follow the leaderboard, chat, and share photos in a gallery with voting — all in a
Game-Boy-styled web app that must survive iOS Safari.

## Stack, in one paragraph

An npm workspace of four packages: `apps/api` (Hono on Node 22, PGlite in-process
Postgres — one process, no external services by design), `apps/web` (React 19 + Vite SPA),
`packages/contracts` (Zod schemas + wire types shared by both), and `packages/tournament`
(`@psd/tournament`: the pure tournament engine — formats, match rules, standings and the
court planner — used by the API and, for the Simulator, in the browser; design in
`docs/design/tournament-engine.md`). Real-time surfaces use
SSE over an in-process bus; everything else rides a jittered 45–75 s poll. In production
the API also serves the built SPA, and everything ships as a single container with an
optional Cloudflare tunnel (`Dockerfile`, ADR-043).

## Quickstart

```sh
./dev.sh           # API on :8787, web on :5173 (proxied to the API)
```

`./dev.sh` is a wrapper around `npm run dev` that does the preflight for you: checks the Node
version, creates `.env` from `.env.example` if it is missing, installs dependencies when the
lockfile has moved, refuses to start on a busy port, waits until the stack actually answers,
and seeds the recorded demo day when the database is brand new. The underlying commands still
work on their own if you prefer them:

```sh
npm install && cp .env.example .env
npm run dev
npm run seed:demo  # a recorded demo day: participants, teams, chat, gallery
```

| Script | What it does |
|---|---|
| `./dev.sh` | Start the stack in the foreground (`--detach` to background it, `--reset` to wipe the database first, `--no-seed` to skip seeding) |
| `./dev-stop.sh` | Stop a detached stack (`--force` also reclaims ports held by an orphan) |
| `./dev-restart.sh` | Stop, then start detached; passes flags through to `./dev.sh` |
| `./dev-status.sh` | What is running, on which ports, against which database |
| `./dev-logs.sh` | Follow `.dev/dev.log` from a detached run |
| `./dev-reset.sh` | Wipe `apps/api/.data/dev` so the next boot provisions a clean database |
| `./verify.sh` | The merge gate, every stage reported (`--e2e` adds Playwright) |

Demo logins (participant sign-in is nickname + PIN; staff is username + passcode):

| Role        | Login        | Secret |
|-------------|--------------|--------|
| Participant | `Wei_Ling`   | `1000` |
| Facilitator | `court1`     | `1111` |
| Superadmin  | `superadmin` | `4242` |

There are no migrations: the schema is one snapshot (`apps/api/src/db/schema.sql`)
provisioned automatically on boot (ADR-049).

## Checks and tests

```sh
npm run verify     # typecheck + lint + repo standards + web build + both test suites
npm run test:e2e   # Playwright, Chromium by default; see AGENTS-testing.md for engines
```

`npm run verify` must pass before any commit — see `AGENTS-workflow.md`.

## Where things are decided

- **`AGENTS.md`** — standing instructions for anyone (human or agent) working here, with
  section files: workflow, testing, database, frontend, function design, decisions.
- **`fds.md`** — the functional design specification the product was built from.
- **`docs/addenda/ADDENDA.md`** — the ADR register. Every consequential decision is an
  ADR; when code and prose disagree, the newest ADR wins.
- **`docs/design/`** — design documents and pre-implementation assessments.
- **`docs/handoff/`** — session handoff notes.

## Deployment

One container: build with the root `Dockerfile`, run with a volume on `/data` for the
database. `TUNNEL_TOKEN` (or `TUNNEL_DISABLE=1`) controls the bundled Cloudflare tunnel;
`SUPERADMIN_INITIAL_PASSCODE` is mandatory on first boot. Details in ADR-043.
