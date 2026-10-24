# ADDENDUM-013 — Golden QR code generator module

**Date:** 2026-10-24 · **Relates to:** BUILD_PROMPT §3 (visual language), §5 (UI/HUD), §7 (tooling); CLAUDE.md §2, §4, §5, §6
**Status:** Implemented — visual and scan verification pending.

## 1. Decisions

### Scope and placement

- A QR code generator is added as a self-contained module at `src/qr/` with a single
  barrel (`src/qr/index.ts`). The host (`src/App.tsx`) imports exactly one component,
  `QrGeneratorLauncher`, which owns its own open state and renders both the header
  button and the modal. `App.tsx` therefore grows by three lines and is not otherwise
  touched (it is listed as known debt in ADDENDUM-001).
- The modal is rendered through a React portal onto `document.body`. The header it is
  launched from carries a `translate` transform, which would otherwise make the
  `position: fixed` overlay resolve against the header rather than the viewport.
- Keystrokes inside the dialog stop propagating so the cinema shortcuts (Space, 1–5,
  O, H) do not fire while typing; Escape closes the dialog. The inscription field is
  auto-focused on open so the first keystroke already lands inside the dialog.

### Encoding (tooling choice)

- Symbol generation uses `qrcode-generator` 2.0.4 (MIT, zero dependencies, ships its
  own type declarations, works in Node so the pure layer is unit-testable). Writing a
  Reed-Solomon encoder in-repo was judged not worth the risk for a feature whose value
  is in the rendering.
- The library reads one byte per input character, so `encode.ts` expands UTF-8 text
  via `TextEncoder` before `addData(…, 'Byte')`. Version is automatic (`typeNumber 0`).
- Output is wrapped in a frozen `QrMatrix` (readonly rows) so render layers cannot
  mutate it (CLAUDE.md §4 immutability rule).
- A 1,200-character UI cap (`MAX_QR_TEXT_LENGTH`) sits well under the 2,953-byte
  theoretical maximum; larger symbols are unreadable at modal size. Overflow at any
  level yields user-facing copy, never a thrown error (`tryEncodeQr`).

### Geometry (pure layer)

- `geometry.ts` converts the matrix into **three SVG path strings**: all dark modules
  outside the finder zones, the three finder rings (even-odd octagon with square hole),
  and the three finder cores. One path per layer keeps the DOM at 13 elements
  regardless of version (a version-10 symbol would otherwise be ~2,000 `<rect>`s per
  visual layer, and the renderer stacks four layers).
- Finder zones are the 8×8 corners (7×7 finder + 1-module separator). Format
  information at row/column 8 and the timing patterns from index 8 remain in the
  module path untouched.
- Finder rings and cores are chamfered (0.85 and 0.425 modules) for the Art Deco cut.
  Scanners locate finders by the 1:1:3:1:1 ratio along lines through the centre, which
  chamfered corners do not disturb. Data modules may be drawn as `plaque` (inset
  square), `diamond`, or `dot` ("Pearl"); each keeps its centre and ≥ 0.88 module span.
- **Quiet zone defaults to 5 modules, not the spec minimum of 4.** The renderer draws
  a hairline border and corner brackets inset one module from the edge; the extra
  module keeps four clean modules between the symbol and that hairline.

### Rendering (thin layer)

- `GoldenQrCode.tsx` is SVG, not Three.js. A QR plaque is a flat artefact that must
  export cleanly; SVG keeps it crisp and downloadable, and the sheen can be reproduced
  with SMIL inside the exported file.
- The gold vocabulary matches `src/webgl/frameMaterial.ts`: deep `#8c661c` → primary
  `#d4af37` → bright `#f8e29b`; a warm `#ffe085` diagonal sheen that sweeps on an
  eight-second period (the shader uses `mod(uTime * 0.55, 4.4)`); a brushed grain via
  `feTurbulence`; and a soft `feGaussianBlur` bloom underneath. Obsidian `#050406`
  plaque with a radial warm centre, hairline border, and the same corner brackets used
  by the HUD proscenium and modals.
- Gradient/filter ids are derived from `useId()` (sanitised) so multiple instances can
  coexist and exported SVGs do not collide when inlined together.
- Caption text uses Cinzel with serif fallbacks. The exported SVG/PNG does not embed
  the webfont; a viewer without Cinzel falls back to Georgia/serif. Accepted.

### Export

- SVG export serialises the live `<svg>` (with the SMIL shimmer intact). PNG export
  rasterises the serialised SVG through an `Image` → `canvas` at 1024 px, painting the
  obsidian background first. The sheen's first animation frame is off-canvas, so the
  PNG shows the resting gold.
- File stems are slugified from the caption (`toSafeFileStem`, tested), falling back
  to `golden-qr`.

### Data

- Presets live module-locally in `src/qr/presets.ts` as frozen `as const` data rather
  than in `src/data/`. This is a deliberate deviation so the module can be lifted out
  wholesale; the immutability rule of CLAUDE.md §4 is honoured.

### Repository hygiene

- A `.gitignore` is added (`node_modules/`, `dist/`, `.DS_Store`). The checkout had
  none and a tracked `.DS_Store`, which is removed in the same change.

## 2. Why

The sequence already has a complete gold-on-obsidian vocabulary (material, HUD, modals).
A QR code is the first artefact a viewer might take away from the piece, so it should
be unmistakably part of the same set rather than a generic black-and-white square. The
module boundary mirrors the existing `frameGrammar/` pattern: pure, snapshot-protected
geometry underneath a thin renderer, with a hook deciding and components rendering.

## 3. Practical impact

- New module `src/qr/` (12 source files, 1,227 LOC including tests; largest file
  `QrGeneratorModal.tsx` at 253 LOC). No existing module other than `App.tsx` changed.
- New dependency: `qrcode-generator@2.0.4` (installed via `npm install`, not by hand
  edit of `package.json`).
- Test IDs follow `qr-generator__{role}`: `launch`, `backdrop`, `close`, `preview`,
  `error`, `summary`, `preset`, `input`, `caption`, `ec-level`, `shape`, `shimmer`,
  `download-svg`, `download-png`.
- Golden geometry for the Act I inscription (`GATSBY`, level M, plaque) is protected
  by `src/qr/__snapshots__/geometry.test.ts.snap`. A change to the quiet zone, inset,
  chamfer or path formatting will move this snapshot and must be explained in an
  addendum.
- Known gaps a future reader should expect: no alignment-pattern styling (alignment
  modules draw as ordinary data modules); no logo/centre emblem; no colour options
  beyond gold; no persistence of the last inscription.

## 4. Validation

`npx tsc --noEmit` passed. `npm test` passed (9 files, 135 tests: the 111 pre-existing
plus 24 new across `encode`, `geometry`, `export`; one new snapshot written).
`npm run build` passed (`dist/index.html` 956.26 kB / 260.79 kB gzip, up from 915.80 kB).
`GoldenQrCode` was additionally rendered server-side in Node for a version-4 diamond
symbol to confirm well-formed SVG with 13 path elements and the SMIL sheen present.

**No browser is available in this sandbox.** Pending visual verification: shimmer
sweep timing and brightness against the WebGL frame, brushed-grain intensity, chamfered
finder legibility, modal layout at narrow widths, PNG export fidelity in Safari (SMIL +
filters inside `<img>`), and — importantly — a physical scan test of all three module
shapes at each error-correction level on at least one iOS and one Android camera app.
