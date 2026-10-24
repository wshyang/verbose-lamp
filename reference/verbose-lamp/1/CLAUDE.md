# CLAUDE.md — standing instructions for this repository

Adopted from [`wshyang/greenfield`](vendor/greenfield/GREENFIELD.md) commit `8ba74` on 2026-10-23. This file is the contextualised version: placeholders are replaced with this project's real stack, and sections that do not apply are marked **NOT APPLICABLE** with a reason. Read this before touching code.

## 0. Project shape

- Product: "Gatsby Deco Titles" — a real-time WebGL recreation of the 2013 film's Art Deco golden frame/title animation.
- Stack: React 19 + Vite 7 + TypeScript 5.9 (strict) + Tailwind CSS v4 + Three.js r186 + lucide-react.
- Delivery: one self-contained `dist/index.html` via `vite-plugin-singlefile`. No server, no database, no authentication, no network I/O at runtime. Web fonts are the only external request and must degrade to a serif stack.
- Runtime assets: **procedural only**. No image, video or audio files may be added. Textures, glyphs, frames and audio are generated in code at runtime.
- Build command: `npm run build`. Type gate: `npx tsc --noEmit`. Unit tests: `npm test` (Vitest). Never edit `package.json` or `vite.config.ts` by hand; install with `npm install <pkg>`.

## 1. Source of truth and addendum discipline (non-negotiable)

- Base specification: `docs/GATSBY_TITLE_SEQUENCE_FDS.md`. It is the product contract and is **stable**; do not renumber its sections.
- Decisions not already dictated by the base spec are recorded as **sequentially numbered addenda** in `docs/addenda/NNNN-kebab-title.md` and indexed in `docs/ADDENDA.md`.
- Write each addendum **in the same change that makes the decision** — never as a follow-up. Each covers: (1) what was decided, (2) why, (3) which base-spec sections it relates to, (4) practical impact and what a future reader must know. Finish with `Status`, `Verification`, and `Rollback`.
- Addenda are append-only. To change a past decision, append a new addendum that supersedes it by number; do not rewrite history. Small factual corrections to an addendum's own verification line are allowed when the implementation lands in the same change.
- No silent skips: if a rule here is not followed, state the deviation and the reason in the addendum.

## 2. Tests first, and keep them real

- **Pure logic is tested for real.** Geometry derivation, timing math, validation and formatting live in dependency-free modules and are covered by Vitest in a Node environment — no mocks, no snapshots of the implementation's own output unless the snapshot is the contract.
- **The signature-frame snapshot is a contract.** The geometry produced at the signature genome `G₀` and intricacy `0.50` must byte-equal the committed fixture generated from the pre-refactor implementation. The 45 intricacy-family fingerprints (`intricacy-family-baseline.test.ts`) are a second contract covering every ornament density at `G₀`. If you change that output, you are changing the product's signature look; that requires a superseding addendum and a regenerated fixture, never a casual `-u`.
- Geometry tests must assert *invariants*, not just example values: x-symmetry, monotonicity in intricacy, baseline-preservation, determinism, bounds and budgets.
- Rendering (WebGL) is not unit-testable in this sandbox. Do not claim it is. Manual/browser verification is listed as outstanding in the commit's validation trailer.
- Add or update tests **in the same change** as the code. A failing or skipped test blocks the commit.

## 3. Test layout and determinism

- Layout: `src/**/<module>.test.ts` beside the module it tests; shared fixtures in `src/**/__fixtures__/`; authored expectations, not generated ones, except the signature contract fixture (provenance documented in the test).
- Fixtures use realistic, deterministic values. **No randomness in geometry.** If sampling is ever needed, seed it explicitly and document the seed.
- Tests must pass from a clean checkout with `npm ci && npm test`.

## 4. Persistence, schema, ORM, migrations — NOT APPLICABLE

There is no database, ORM, schema or server. State is in-memory per session (`PlaybackState`, `HeroTitleConfig`, frame style). Consequently Greenfield §4 (DB/ORM), §5 (migrations) and the soft-delete/UUIDv7 rules are not adopted. If persistence is ever introduced, adopt those sections first and add an addendum before writing storage code.

## 5. Code conventions that prevent bug classes

- `data-testid` on every interactive element, naming `{component-kebab}__{element-role}` (e.g. `frame-studio__intricacy-slider`). Repeated rows share one test id and are scoped by anchor text.
- Typed contracts at every module boundary. No `any` in new code; no non-null assertions to silence the compiler.
- Domain modules do not import from `components/`. Components do not compute domain rules inside JSX.
- Keep internal design rationale and research notes out of user-facing copy unless the surface is explicitly a research/dossier surface.
- Never ship secrets. None exist in this project.

## 6. Function and module design (enforced in new/changed code)

- ≤ 20 lines per function preferred, **50 lines hard limit**. Extract named functions; no comments explaining a block that should be a function.
- Guard clauses over nesting; maximum nesting depth 3.
- ≤ 3 parameters; beyond that, a typed parameter object. **No boolean flag parameters** in new code.
- Never mutate in place in new code — return new objects. Separate query from modifier.
- Immutable state updates in React (`{ ...state, field }`), never `state.field = x`.
- Frontend: **a component renders, a hook/pure module decides.** Derivations and formatting are computed above `return`; JSX contains only markup, bindings and wiring. No `.filter/.reduce/.sort/.find/.some/.every` inside JSX.
- Files: ≤ 400 LOC typical, **800 LOC hard limit**. No file currently exceeds the hard limit (the two adoption-time breaches were split in Addendum 0002). `GatsbySceneManager.ts` (695) is the next split candidate; extract verbatim when touched.

## 7. Product invariants

1. **Signature preservation.** The style `(G₀, 0.50)` renders the original frames exactly. Every base gene is a parameter of a motif family whose signature value reproduces the original; recursive rules are inert at depth 0. Richer intricacy is additive; poorer intricacy removes only non-essential ornament, never the `primary` skeleton or the `monogram`.
2. **Symmetry.** Every derived frame must be mirror-symmetric in x, because asymmetry reads as a bug in a signet composition. The deliberately interlocked monogram letters (`role: "monogram"`) are exempt.
3. **One draw call per card.** Frame geometry is merged into one buffer; derived ornaments must not add meshes.
4. **No per-frame allocation** in the animation loop; animation is a pure function of time so scrubbing stays stateless.
5. **Motion budget.** Five cards, ≤ 950 dust particles, pixel ratio ≤ 2, React HUD updates throttled to ~20 Hz.
6. **Custom shader variants need explicit `customProgramCacheKey`s**, or Three.js can reuse the wrong compiled program.
7. **Three orthogonal style axes, one mechanism each.** Style (Sunburst / Fluted) picks the title-frame vocabulary, Design is a single merged gallery (#0 = original), and Ornament density layers ornament on top. Never add a second named list that sets the same parameters. `family: 'sequence'` with design 0 and density 0.50 is the original and must stay byte-identical to it.
10. **A screen border is not a title frame.** Anything drawn at the viewport edge is camera-parented, exists once, and belongs to no card. Do not express it as another title-frame family, and keep it off by default.
8. **Bounded recursion.** Every recursive rule stops at a minimum feature size, and tests assert base ≤ 720, total ≤ 1 200 rails and ≤ 60 000 vertices per card across both families, presets, extremes and explorer variants.
9. **Mirror by construction, not by coordinates.** New motifs specify the right-hand element and emit `mirroredPair`; never hand-write both halves. Snap near-zero coordinates so mirrored seams meet exactly and no negative zeros reach the buffers.

## 8. Validate early and honestly

- Report exactly which layer ran: `typecheck`, `build`, `unit tests`, `manual browser`. A build passing is not a test suite passing.
- Append a validation trailer to every commit listing what ran and what remains (especially browser/WebGL visual checks).
- When constrained tooling prevents the full gate, say so in the commit and in the addendum; never write "tests pass" unless `npm test` ran.

## 9. Local environment

- `npm ci` → `npm run dev` (local dev) → `npm test` (unit) → `npx tsc --noEmit` → `npm run build`.
- No `.env` files are required. If configuration is ever added, follow Greenfield §9: committed `.env.example`, uncommitted real values, no secrets in code.
- `dist/index.html` is the artefact the host serves. It must remain self-contained.

## 10. Deployment / containers / SHIP-HATS — NOT APPLICABLE (recorded decision)

This is a static single-file client app with no server process, no port binding, no secrets and no database. The Greenfield §10 container contract and the inert SHIP-HATS pipeline are therefore not adopted. The host serves `dist/index.html` directly. Revisit only if a server-side component is added; then contextualise `vendor/greenfield/initial-templates/` and add an addendum first.

## 11. Commit discipline

- One baseline commit before a change-set, one implementation commit (or a small, meaningful series) when done.
- Commit subject: `type(scope): imperative summary`; body states what changed, why, the addendum number, and the validation trailer.
- Never commit `node_modules/`, `dist/`, secrets or vendor `.git` directories.
- Do not use `--no-verify` to bypass a failing gate; fix the gate or record the block.

## 12. Checklist before merge

1. Addendum written in the same change, indexed, status updated.
2. `npm test` green; invariant tests updated; signature fixture untouched unless the contract changed by addendum.
3. `npx tsc --noEmit` clean; `npm run build` succeeds; touched files under 800 LOC.
4. Interactive elements have contract test ids; derivations are outside JSX.
5. No new assets, no new network calls, no secrets.
6. Validation trailer appended to the commit; browser verification status stated honestly.
