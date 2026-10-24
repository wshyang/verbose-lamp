# CLAUDE.md — standing instructions (adopted from GREENFIELD.md, 2026-10-14)

This repository adopted `GREENFIELD.md` as its coding discipline on 2026-10-14.
Every placeholder in that template is resolved below. Future agents: follow this
file without being asked. `GREENFIELD.md` remains as the source template;
this file is the project-specific adoption and wins on any conflict.

## Stack (GREENFIELD §0, §11.13 resolved)

| Choice | Value | Because |
|---|---|---|
| Language | TypeScript (strict) everywhere | One typed wire contract across backend/frontend (§6) |
| Backend | Node 22 `node:http` handler + Drizzle ORM | Handler is exercisable without a listening socket (§2); no framework magic |
| Database | PGlite (`@electric-sql/pglite`, real Postgres/WASM) | User requirement; real DB in tests, never a mocked data layer (§2) |
| Frontend | React + Vite | Component/hook split (§7) maps cleanly onto it |
| Tests | Vitest + v8 coverage, Testing Library, jsdom | One runner for backend/frontend/shared (§9) |
| Package manager | npm (lockfile committed) | Consistent across backend, frontend, tooling (§9) |
| Ports | App serves API + built frontend on `PORT` (default 3000) on `0.0.0.0` | Container contract (§10.1) |

## 1. Decisions are recorded (GREENFIELD §1)

- Source of truth: `docs/SPEC.md` (living functional spec for the tournament engine).
- Every decision not dictated by the base problem spec (`tournament-problems-fds.md`,
  problems P-01…P-16) is an addendum in `docs/ADDENDA.md`, numbered sequentially
  (`A-001`, `A-002`, …), written **in the same change** as the decision, covering:
  what, why, which spec section it relates to, practical impact.
- Assessment of formats/problems lives in `docs/ASSESSMENT.md`.

## 2–3. Tests first, real DB, isolation (GREENFIELD §2–3)

- Backend integration tests run against a **real PGlite instance** (fresh in-memory
  DB per test file, never the dev DB) through the real HTTP handler. **Never mock
  the data-access layer.**
- Every route gets a positive test **and** a scoping/state negative test
  (wrong-tournament id, forbidden state transition, finalised-match mutation).
  There is no auth in v1 (FDS assumption H1: the desk is trusted and present);
  the negative axis is therefore resource-scoping + lifecycle state, recorded in A-004.
- Add/update tests in the same change as the code. Coverage gate: **100%
  statements/branches/functions/lines** for `shared/`, `backend/`, `frontend/src/`
  (`npm run coverage`). Do not lower thresholds; write the test.
- Frontend unit tests may mock only the `lib/api` fetch boundary. Deterministic
  fixtures: named teams (`Alpha`, `Bravo`, …), no RNG winners anywhere.
- Test layout: `shared/*.test.ts`, `backend/*.test.ts`, `frontend/src/**/*.test.{ts,tsx}`.
  Playwright/e2e is deferred (A-005); video-on default applies when it lands.

## 4. Database discipline (GREENFIELD §4)

- **One casing**: TypeScript camelCase; Drizzle schema is the *only* mapping to
  snake_case columns. No hand-written mappers, no raw-SQL CRUD (raw SQL only for DDL).
- **Soft deletion only**: every entity has nullable `deletedAt`; reads filter it;
  points are **voided** (`status='voided'`), never deleted.
- **UUIDv7** ids, minted in exactly one place (`backend/ids.ts`).
- No sentinel actors: v1 has no actor table because there is no auth (A-004);
  if actors arrive, they arrive as real rows.

## 5. Schema evolution (GREENFIELD §5)

Two always-in-sync halves in the same commit: `backend/schema-snapshot.sql`
(wholesale, applies from zero) and `backend/migrations/NNNN_*.sql`
(zero-padded, idempotent, records itself in `schema_migrations`). Boot applies
the snapshot to an empty DB (fresh PGlite) — migrations catch up older DBs.

## 6. Code conventions (GREENFIELD §6)

- `data-testid` on every interactive element: `{component-kebab}__{element-role}`.
  Repeated rows share one testid; scope by anchor text in tests.
- Typed wire contracts defined once in `shared/types.ts`; both sides import them.
- No internal design language in user-facing copy.

## 7. Function & module design (GREENFIELD §7) — hard rules

- Functions ≤ 20 lines target, **50 hard limit**; guard clauses; nesting ≤ 3;
  ≤ 3 params (else a typed Parameter Object); no boolean flag params; no in-place
  mutation; Separate Query from Modifier.
- Frontend: **a component renders, a hook decides.** Components never import
  `lib/api` (`grep -c "lib/api" frontend/src/components/*.tsx` must be 0);
  hooks return plain objects; no `.filter/.reduce/.sort/.find` inside JSX —
  compute named bindings above the `return`; bare `.map` for lists is fine.
- Files ≤ 400 LOC typical, **800 hard limit**; group by domain, barrel-split
  god modules; no circular imports between peer domains.

## 8. Validation honesty (GREENFIELD §8)

Say exactly which layer ran. The merge gate is: `npm run typecheck`,
`npm run coverage` (100% gate), `npm run build`, and a live smoke of the server.
Never claim "tests pass" for a layer you did not run.

## 9. Local dev (GREENFIELD §9)

One command: `./dev.sh` (installs if needed, builds frontend, starts the app on
3000). `.env.example` documents `PORT`/`PGLITE_DATA_DIR`; test DBs are always
fresh in-memory PGlite instances, never the dev data dir.

## 10. Deployment (GREENFIELD §10)

Contextualised `Dockerfile`, `Dockerfile.dev`, `Dockerfile.cloudflared` and
`.dockerignore` at repo root (app listens on 3000/`0.0.0.0`, numeric non-root
USER, pinned bases, HEALTHCHECK). SHIP-HATS pipeline is carried **inert**
(`*.shiphats`) with `activate-shiphats.sh` (Bash 3.2 compatible: no associative
arrays, no `mapfile`). Root scripts must pass that constraint.

## 11. Checklist answers (GREENFIELD §11)

1. Spec: `docs/SPEC.md`; addenda: `docs/ADDENDA.md` (`A-NNN`).
2. Test DB: per-file in-memory PGlite; tests-first, real DB, no repo mocks.
3. ORM: Drizzle; camelCase TS only, no hand mappers.
4. Soft-delete + UUIDv7; actor rows deferred with auth (A-004).
5. Snapshot + migration twins, same commit.
6. `data-testid` convention above; contracts in `shared/types.ts`.
7. Layout above; Playwright deferred (A-005).
8. Fixtures: named teams, deterministic; no per-run emails exist in this domain.
9. §8 of this file. 10. `./dev.sh`; `.env.example` vs `.env.test`.
11. §7 of this file. 12. Container contract above. 13. Inert SHIP-HATS above.
