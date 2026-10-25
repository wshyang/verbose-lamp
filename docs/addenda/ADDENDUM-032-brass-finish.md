# ADDENDUM-032 — The Brass Finish (ADDENDUM-021 §3.6) Behind the Gate

**Status:** Implemented and gate-proven. Supersedes the "brass shader
deferred" notes in ADDENDA 021/026 records.

## What shipped (per §3.6)

- **Material** (`art-deco-frame/render/frameMaterial.ts`):
  `createGoldFrameMaterial(uniforms, finish = 'gold')`. Gold is byte-for-byte
  the old program (same parameters, injections, and
  `customProgramCacheKey 'gatsby-gold-frame-trim-v2'`). Brass: albedo
  `#ba9c72`, metalness 0.9, roughness 0.32, cache key
  `gatsby-gold-frame-trim-v2-brass`, plus injections — a per-rail tone
  gradient toward dark `#775320` swept along a seeded angle, vertical hash
  scratch grain (0.30-strength normal perturbation), a banded raking-light
  emissive sweep, and sparse hash-gated glints. Emissive `#281802` and
  envMapIntensity 2.35 kept (spec silent; brass must survive the black
  vacuum glow regime).
- **Tone data** (engine, pure): `PolylineSpec.tone?: RailTone {base, angle}`
  beside `depth`/`delay`. New `frameGrammar/railTone.ts` —
  `latticeRailTone(layer, seed)`: base alternates 0.25 (even layers) / 0.75
  (odd), angle ∈ [0, π) seeded via `mulberry32` (per-layer reroll ⇒ the
  tutorial's inverse gradients). Stamping happens at the single funnel
  `latticeToRails` (both title and border consumers), using the composition
  seed both callers already had — the lattice engine itself is untouched.
  Grammar productions spread specs, so tone rides elaboration echoes.
- **Geometry**: `aTone` vec2 emitted only when some spec is toned; untinted
  geometry is identical (same trick as the absent `uv`).
- **Opt-in (§3.5)**: `frameFinishForStyle` — brass iff the frame's genesis
  source is lattice or an enabled layer is lattice (mixed frames wear brass
  whole; authored rails inside read the light-brass default tone 0). Title
  cards swap materials in `setFrameStyle`; the screen border swaps in
  `ScreenBorderRig.setStyle` when the pattern flips to/from lattice. Default
  authored frames and the poster border keep gold.

## Evidence

- `npx tsc --noEmit` ✓; `npm test` 99 files / 687 tests ✓ (+6: railTone ×5,
  adapter tone ×1); coverage 100% ✓; build ✓ 2,431.00 kB (gzip 1,077.41).
  Note: `frameGrammar/golden.test.ts` stays green by design — its
  `toGeometryOnly` projection drops render-only fields, so tone cannot
  disturb the geometry golden.
- **Likeness gate**: desktop 13/13 (10.0m), mobile 13/13 (3.9m) — the
  original 24 baselines pass **unchanged** (gold isolation proven), plus a
  new frozen shot `act5-lattice-brass` in both projects driving lattice
  title + lattice border through Frame Studio (the gate previously had no
  WebGL lattice coverage; now the brass program itself is regression-pinned).
  Scratch grain and tone variegation confirmed by eye in the desktop capture.

## Caveats

- Sandbox SwiftShader reads brighter/flatter than a real GPU; the antique
  "muted" quality wants one human look before final aesthetic acceptance
  (same standing note as ADDENDA-030/031). Tunables if needed: flow scale
  0.10, scratch strength 0.30, rake/glint gains in `frameMaterial.ts`.
- The SVG Deco Copperplate light theme (ADDENDUM-026) is unrelated and
  unchanged.
