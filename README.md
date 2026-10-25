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
| `npx tsc --noEmit` | Type-check the whole project |

Before calling a change done, run `npx tsc --noEmit`, `npm test`, and `npm run build`.

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

## Network access at runtime

The app is client-only, but a few things load from the network:

- **Fonts:** Cinzel, Cormorant Garamond, Marcellus and Poiret One from Google Fonts
  (`index.html`). Offline, the browser falls back to system fonts.
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

Features under `src/features/`: `premiere` (sequence, audio, WebGL runtime),
`art-deco-frame`, `frame-studio`, `title-customizer`, `qr-generator`, `research`,
`gilded-portrait`, `avatar-studio`, `face-detection`, `background-removal`,
`enamel-backdrop`.

Import a feature through its barrel (`@/features/<name>`), never from its internals. Features
must not import from `src/app/`. The `@` alias points at `src/`. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding a new surface.

## Testing

Unit tests sit beside the module they cover (`foo.ts` + `foo.test.ts`) and run in Vitest's
node environment (`vitest.config.ts`, deliberately separate from `vite.config.ts`). Pure
logic such as frame grammar, timing math, and image pipelines is tested; geometry is
protected by snapshot tests on data, not pixels. Three.js and DOM rendering code is kept
thin and is unit-tested through the scene graph it builds. Coverage is gated at 100%.

Playwright e2e is live (`npm run e2e`): twelve frozen-frame likeness screenshots plus the
guest flows, in real Chromium on SwiftShader. Baselines are OS- and browser-specific and
are recorded per machine — see ADDENDUM-026 and ADDENDUM-028.

## Contributing conventions

Standing rules live in [CLAUDE.md](CLAUDE.md). The short version:

- Every decision beyond the base spec gets an addendum in `docs/addenda/` and a row in
  `docs/ADDENDA.md`, in the same change.
- Tests first for pure modules. Functions at most 50 lines, files at most 800 lines.
- `data-testid` on interactive elements, named `{component-kebab}__{element-role}`.
- Commit messages end with a validation line, for example
  `Validation: tsc ✓ vitest ✓ build ✓ — browser not available in sandbox`.

## Deployment

Not set up yet. `npm run build` produces a static `dist/`; the planned container contract is
that output served on port 3000, host `0.0.0.0`. See CLAUDE.md §9.
