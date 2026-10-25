# CLAUDE.md — Standing instructions for this repository

Derived from `wshyang/greenfield` (`GREENFIELD.md`, commit `8ba7402`), contextualised
to this project. Sections that do not apply are marked **N/A** with the reason, so a
future reader knows the omission was a decision, not an oversight.

## 0. What this project is

A client-only, single-page WebGL title sequence ("THE GREAT GATSBY — WebGL Art Deco
Title Sequence"). Stack: React 19, TypeScript 5, Vite 7, Tailwind CSS 4, Three.js
r186, Vitest. No backend, database, auth, or persistence.

## 1. Source of truth and addenda (do this without being asked)

- **Base spec:** `docs/BUILD_PROMPT.md`. Its section numbering is frozen.
- **Addenda register:** `docs/ADDENDA.md`, one row per addendum, sequential
  `ADDENDUM-NNN`. Each addendum file lives in `docs/addenda/`.
- Every decision not dictated by the base spec — a gap filled, a new object/option,
  a deviation, a tooling choice — gets an addendum **in the same change** that makes
  the decision. Never as a follow-up.
- Each addendum states: (1) what was decided, (2) why, (3) which base-spec section it
  relates to, (4) practical impact and what a future reader must know, (5) validation
  actually performed (see §6).
- If implementation and spec disagree, fix one of them in the same change and record
  which won and why.

## 2. Tests first, kept real

- Pure modules (frame grammar, timing math, validation helpers) get Vitest unit tests
  **before or with** the code. Tests live beside the module: `foo.ts` + `foo.test.ts`.
- Golden behaviour is protected by snapshot tests on **geometry data, not pixels**.
  A refactor that changes a snapshot must explain the change in its addendum.
- Rendering code (Three.js, DOM) is kept thin, and it is unit-tested too: jsdom suites
  assert the DOM it writes and the canvas calls it makes, but never its pixels. Logic
  still lives in the pure layer. Coverage is gated at 100% — see ADDENDUM-025.
- **N/A:** real-database integration tests, session-scoping negative tests, OWASP
  endpoint matrix — there is no server or persisted data. Revisit the moment either
  appears.
- Playwright e2e is live (ADDENDUM-022 §0.5, ADDENDUM-026): `npm run e2e` runs the
  likeness screenshot gate and the interaction flows in real Chromium (SwiftShader).
  Video-on default was not taken; traces are kept on failure instead.
  Baselines are OS-suffixed and only comparable on the same OS, browser and version, so
  `npm run e2e:update` is a deliberate, reviewed act — never a reflex after a red run.
  No baselines are committed yet: record them once per target machine.
  The Playwright CDN is unreachable from the sandbox, so the browser comes from npm —
  `@sparticuz/chromium`, pointed at through `PLAYWRIGHT_CHROMIUM_EXECUTABLE` — with NSS
  built from source for its missing shared objects. See ADDENDUM-028 §2 and §7.

## 3. Test infrastructure defaults

- `npm test` runs `vitest run --coverage` with `vitest.config.ts` (node environment) and
  fails below 100% on statements, branches, functions or lines; `npm run test:watch` is
  the plain watcher. Keep `vite.config.ts` untouched; Vitest has its own config file on
  purpose. DOM suites opt in per file with `// @vitest-environment jsdom`.
- Fixture data is deterministic and domain-realistic (named acts, real archetype
  names), never `item-1`.
- Layout by type: unit tests beside modules; any future e2e under `e2e/`.

## 4. Data discipline

- **N/A:** ORM, casing mappers, soft-delete, UUIDv7, migrations, schema snapshots — no
  database. If one is ever added, apply the greenfield §4–§5 rules verbatim and open an
  addendum first.
- In-memory data (`src/data/*.ts`) is immutable: export `as const` or readonly types,
  never mutate at runtime.

## 5. Code conventions that prevent bug classes

- `data-testid` on every interactive element, convention
  `{component-kebab}__{element-role}` (e.g. `timeline__scrubber`,
  `frame-studio__detail`). Repeated rows share one testid.
- Typed contracts between layers: the scene manager exposes a typed API; React never
  reaches into Three.js objects.
- User-facing copy never exposes internals (shader uniform names, file paths, class
  names). Design rationale lives in comments and addenda.

## 6. Function and module design

- Functions ≤ 20 lines target, **50 hard limit**. Nesting ≤ 3. Parameters ≤ 3; beyond
  that, a typed parameter object. No boolean flag parameters — split the function.
- Guard clauses over nesting. Query/modifier separation. No in-place mutation of
  shared objects; produce new objects.
- Names reveal intent; booleans `is/has/should/can`; functions verb+noun.
- Files ≤ 400 LOC typical, **800 hard limit**; split by domain with a barrel, not by
  type.
- Frontend: **a component renders, a hook decides.** Components hold JSX, view-only
  state and wiring; anything that computes over scene/timeline state lives in a hook
  or pure module. No `.filter/.reduce/.sort/.find` inside JSX.
- Feature-first hierarchy: `src/app/` composes the host experience, `src/features/<name>/`
  owns product behavior, and `src/shared/ui/` owns reusable interaction primitives.
  Cross-feature imports go through a feature barrel; feature modules never import
  from `src/app/`. See `docs/ARCHITECTURE.md` before adding a new surface.
- Existing files that exceed these limits are listed in ADDENDUM-001 as known debt;
  do not grow them, split them when touched substantively.

## 7. Validate early and honestly

- Before claiming done: `npx tsc --noEmit`, `npm test`, `npm run build`.
- This sandbox has **no browser**. Say so. Never claim "renders correctly" from a
  sandbox; say "type-checks, tests pass, builds; visual verification pending".
- Append that caveat to commits made without a browser.

## 8. Reproducible local dev

- `npm install` then `npm run dev`. No secrets, no `.env` needed. If one is ever
  needed, commit `.env.example`, never `.env`.
- External reference checkouts go under `reference/` (git-ignored). Re-fetch with
  `git clone --depth 1 https://github.com/wshyang/greenfield.git reference/greenfield`.

## 9. Deployment and CI

- **Deferred, not forgotten.** No `Dockerfile`/SHIP-HATS files yet. The container
  contract when added: static `dist/` served on **port 3000, host 0.0.0.0**, pinned
  base image, numeric non-root `USER`, `HEALTHCHECK`. Start from greenfield
  `initial-templates/` and contextualise; the generic Dockerfile's "static site if no
  `dist/index.js`" guess is actually correct for this project.
- Root scripts, when added, must run on Bash 3.2.

## 10. Commit discipline

- Commit before starting a risky change and after finishing it.
- Commit message: imperative summary, then what/why, then the validation line
  (`Validation: tsc ✓ vitest ✓ build ✓ — browser not available in sandbox`).
- Addendum and code land in the same commit.

## 11. Checklist before any new feature

1. Is there an addendum? 2. Is there a test for the pure part? 3. Does it keep the
file/function limits? 4. Are testids present? 5. Did `tsc`, `vitest`, `build` run?
6. Is the validation caveat honest?
