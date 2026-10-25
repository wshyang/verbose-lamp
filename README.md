# THE GREAT GATSBY — WebGL Art Deco Title Sequence

A client-only, single-page WebGL title sequence, and the foundation for a UI library for a
Great Gatsby themed dinner and dance event. It plays a five-act cinematic sequence in
Three.js and ships reusable Art Deco features: a frame studio, a title customizer, a golden
QR generator, a gilded avatar studio, and a research dossier.

There is no backend, database, auth, or persistence.

**Stack:** React 19, TypeScript 5, Vite 7, Tailwind CSS 4, Three.js r186, Vitest.

## Quick start

Prerequisites: Node.js and npm. Node 24 is what the project is developed on; no `.nvmrc` pins it.

```bash
npm install
npm run dev
```

Vite prints a local URL, `http://localhost:5173` by default. Open it in a browser with
WebGL support. No `.env` or secrets are needed.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` (a single self-contained HTML file, via `vite-plugin-singlefile`) |
| `npm run preview` | Serve the built `dist/` locally to check the production bundle |
| `npm test` | Run the Vitest unit tests once (`vitest run`, node environment) |
| `npx vitest run --coverage` | The same suite with the coverage gate (100 % on the logic surface) |
| `npx playwright test` | The browser e2e suite — **needs a Chromium download and a GPU-capable browser** |
| `npx tsc --noEmit` | Type-check the whole project |

Before calling a change done, run `npx tsc --noEmit`, `npm test`, `npx vitest run --coverage`
and `npm run build`. A sandbox without a browser can run all four; the Playwright suite is
the one gate that cannot be closed there.

## Using the app

Controls:

- **Timeline (bottom):** chapter buttons, play/pause, replay from the beginning, and a scrubber.
- **Header, Research:** read-only dossier on the film and its era.
- **Header, Customize Title:** edit the title card text and presets.
- **Header, QR generator:** create a golden QR code and export it.
- **Header, Avatar Studio:** build a gilded portrait avatar from a photo.
- **Header, 3D Orbit (or press `O`):** switch between the directed fly-through and free orbit.
- **Header, 1920s Nitrate:** toggle the silver-nitrate film look.
- **Header, sound icon:** toggle the procedural orchestral ambience.
- **Frame Studio dock:** tune the Art Deco frame (intricacy, genesis, proportions, layers).
- **Party sparklers:** the dedicated sparkler button fires the handheld-sparkler effect; the
  premiere console plays the same effect as part of the show.

Two URL parameters exist for testing and for reproducible screenshots:

- `?freezeAt=<seconds>` pins the sequence clock, so a screenshot at 4.5 s is the same frame
  every run. The stage sets `data-frame-ready` once the scene has rendered.
- `?renderer=classic` mounts the original imperative Three.js manager instead of the React
  Three Fiber port, which is the default (ADDENDUM-026 §5).

## Network access at runtime

The app is client-only, but a few things load from the network:

- **Fonts:** none — the typefaces (Cinzel, Cormorant Garamond, Marcellus, Poiret One and
  their siblings) are self-hosted from `src/assets/fonts/` as latin-subset WOFF2 with their
  OFL licences, and `src/main.tsx` waits for them before mounting so the first frame is not
  set in a fallback face (ADDENDUM-030). The built single file carries them as data URLs.
- **Avatar Studio models:** face detection (MediaPipe Tasks Vision and the BlazeFace model)
  and background removal (Hugging Face Transformers) are fetched from jsDelivr and Google
  storage (see `src/features/face-detection/locateFace.ts` and
  `src/features/background-removal/segmentSubject.ts`). Everything else works offline.

## Project layout

```text
src/
  App.tsx            # Thin entry component
  app/               # Composes the host experience (stage, header, timeline)
  features/          # Product behaviour, one folder per feature (see below)
  shared/            # ui/ primitives and lib/ framework-neutral utilities
docs/
  BUILD_PROMPT.md    # Base spec (section numbering is frozen)
  ADDENDA.md         # Register of every decision made beyond the base spec
  addenda/           # One file per addendum
  ARCHITECTURE.md    # Module map, ownership rules, how to reuse the UI
```

Features under `src/features/`: `premiere` (sequence, audio, the classic WebGL runtime and
the React Three Fiber `scene3d/` port), `art-deco-frame`, `frame-studio`, `title-customizer`,
`qr-generator`, `research`, `gilded-portrait`, `avatar-studio`, `face-detection`,
`background-removal`, `enamel-backdrop`, `deco-lattice`, `spectacle`,
`spectacle-preview`, `lucky-draw`, `gilded-ui`, `event-night`.

`docs/ADDENDA.md` is the decision log: **33 addenda** covering everything from the frame
grammar to the sparkler renderer. Read it before changing a behaviour; the numbering is
append-only.

Import a feature through its barrel (`@/features/<name>`), never from its internals. Features
must not import from `src/app/`. The `@` alias points at `src/`. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding a new surface.

## Testing

Unit tests sit beside the module they cover (`foo.ts` + `foo.test.ts`) and run in Vitest's
node environment (`vitest.config.ts`, deliberately separate from `vite.config.ts`). Suites
that need a DOM opt in with a file-level `// @vitest-environment jsdom`.

The current suite is **122 files / 1144 tests** and holds the coverage gate at **100 %
statements, branches, functions and lines** over every logic module. Geometry is protected
by golden snapshots on data, not pixels (`src/test/digest.ts` quantises before hashing so
a snapshot from macOS still passes on Linux). The three.js scene graph is exercised headlessly
through `@react-three/test-renderer` in `scene3d/` and through the pure planners it consumes.

Three test-only guards are worth knowing about:

- `src/discipline.test.ts` — CLAUDE.md §3 as an executable ratchet (see below).
- `src/app/e2eContract.test.ts` — every test id the Playwright suite names must exist in
  `src/`, so the e2e suite cannot rot while it is not being run.
- `e2e/` — 42 Playwright tests in 2 files, written against `?freezeAt` and never executed in
  this sandbox (no Chromium download, no browser); they still need baselines (ADDENDUM-001).

## Contributing conventions

Standing rules live in [CLAUDE.md](CLAUDE.md). The short version:

- Every decision beyond the base spec gets an addendum in `docs/addenda/` and a row in
  `docs/ADDENDA.md`, in the same change.
- Tests first for pure modules. Functions at most 50 lines, files at most 800 lines — and
  this one is enforced: `src/discipline.test.ts` parses `src/` and fails on any function over
  a limit that is not in `src/test/disciplineBaseline.ts`. The table is a ratchet: a recorded
  function may shrink but never grow, and the total may only go down (currently **56**).
- `data-testid` on interactive elements, named `{component-kebab}__{element-role}`.
- Commit messages end with a validation line, for example
  `Validation: tsc ✓ vitest ✓ build ✓ — browser not available in sandbox`.

## Deployment

Not set up yet. `npm run build` produces a static `dist/`; the planned container contract is
that output served on port 3000, host `0.0.0.0`. See CLAUDE.md §9.
