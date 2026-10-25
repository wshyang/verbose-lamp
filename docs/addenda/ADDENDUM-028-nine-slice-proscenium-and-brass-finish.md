# ADDENDUM-028 — Nine-slice proscenium, brass finish and lattice export (ADDENDUM-021 §3.4–§3.6, phases 5–6)

**Date:** 2026-10-25 · **Relates to:** ADDENDUM-021 (plan, phases 5–6), ADDENDUM-026 (which left these open), ADDENDUM-027 (harness); BUILD_PROMPT §3, §4, §7; CLAUDE.md §2, §5, §6, §7.
**Status:** Implemented — visual check pending.

This closes the three items ADDENDUM-026 §6 listed as open: the nine-slice screen-border pattern, the brass finish, and the lattice SVG/PNG export. It also fixes a defect found while wiring the export.

## 1. Nine-slice decomposition (`deco-lattice/model/nineSlice.ts`)

ADDENDUM-021 §3.4 asks for a rectangle framing that stays exact when the aspect is not 1:1. `buildNineSlice({ hw, hh, level, density, cornerRatio, aperture })` returns `LatticeSpec[]` plus what a test needs to hold it to account:

- **Corners** — one square block of side `c = min(hw, hh) × cornerRatio`, ornamented with a D4 orbit *about the block's own centre*, then placed into all four corners by the D2 orbit. This was the subtle part: orbiting about the block's inner corner smears a quarter of the motif into the middle of the frame, which the aperture test caught immediately.
- **Edges** — frieze bands built on the half edge `[claspHalf, run]` and mirrored. The repeat count is chosen first (`planBand`) and the period derived from it, so **every count is an integer by construction** and no reed is ever clipped. `reedRow` gained an optional `count` for this, keeping its equal-gap formula.
- **The clasp** is the space deliberately reserved at mid-edge, centred and pulled inside the frame bar so its 45° ends cannot poke past the extent (another failure the tests found).
- **The aperture** is what the frame promises to keep clear: by default the box inset by the corner block, i.e. the nine-slice middle. A caller-supplied aperture shrinks `c` so the promise still holds.
- Levels 1–4 are nested supersets: L1 the frame bar, L2 hairline + corners, L3 bands + clasps, L4 a nested inner rail.

## 2. Screen border pattern (`pattern: 'poster' | 'lattice'`)

`ScreenBorderStyle` gains `pattern` (default `'poster'`) and `seed` (default 1925), and `buildEdgeBorder` branches to `buildLatticeProscenium`, which maps the nine-slice onto the grammar's `PolylineSpec` (kinds `frame`/`rule`/`diamond`/`reed`, z stepped per layer, delays ordered outward → inward).

`ScreenBorderRig` now compares pattern and seed as well as weight and genome, swaps the material when the finish changes, and disposes the old one. **The default is unchanged**: `buildEdgeBorder({aspect, density})` and `buildEdgeBorder({..., pattern: 'poster'})` are equal, and poster specs carry no `tone`.

Frame Studio gets a `Pattern` chip pair (`frame-studio__border-pattern`) and a `Reroll proscenium` button (`frame-studio__border-reroll`) that appears only for the lattice; the hook decides (`setBorderPattern`, `rerollBorder`), the control renders.

## 3. Brass finish

- `PolylineSpec` gains `tone?: number` and `brassAngle?: number`. Both are absent by default, so the golden snapshot (which compares geometry fields only) and every existing frame are untouched — asserted, not assumed.
- `deco-lattice/model/tone.ts` holds `LAYER_TONES = [1, 0.82, 0.68, 0.54]` and `brassAngleFor(seed, layer)`: the layer's tone and its seed-derived gradient tilt, shared by the WebGL and SVG renderers.
- `createChamferedFrameGeometry` writes a per-vertex `aTone` vec2 (tone, angle in radians).
- `createGoldFrameMaterial(uniforms, { finish })`: `'gold'` is the delivered metal with its existing cache key `gatsby-gold-frame-trim-v2`; `'brass'` is albedo `#ba9c72`, metalness 0.9, roughness 0.32, cache key `gatsby-brass-frame-trim-v1`. Brass injects four things in one place: albedo mixed toward `#775320` by the rail's tone, an anisotropic stretched-hash normal perturbation (hammered grain), a three-stop band sweeping with `uTime` (banded raking light), and hash-gated glints on a per-rail grid.
- The lattice proscenium picks brass through `finishFor(pattern)`; the printed poster edge stays 24k gold.

**Deviation from the plan, stated:** ADDENDUM-021 §3.6 describes `aTone` as a vec2 "base tone, gradient angle" taken from `PolylineSpec.tone?`. One scalar cannot carry both, so the angle is a second optional field (`brassAngle`) rather than being packed into the same number. Everything else matches.

## 4. SVG/PNG export

The generic helpers moved from `features/qr-generator/export.ts` to `shared/lib/svgExport.ts` (serialisation and downloads are not QR-specific); the QR module re-exports them, so no import path changed and the gilded portrait keeps working. `useLatticeExport()` puts a ref on `DecoLatticeFrame`, and the spectacle console's DECO LATTICE section now shows a **live frame preview** with `Export SVG` / `Export PNG` (`spectacle-preview__lattice-export-svg` / `-png`).

**Bug fixed on the way:** `serializeSvg` set `xmlns` only when `getAttribute('xmlns')` was empty, but a namespaced element already serialises its namespace while `getAttribute` reports nothing — so the output carried **two `xmlns` attributes**, which is invalid XML. It now inspects the serialised markup and adds the declaration only when it is missing. Both cases are tested.

## 5. Tests and coverage

New suites, all real assertions rather than smoke:

| Suite | Tests | What it holds down |
|---|---|---|
| `nineSlice.test.ts` | 15 | octilinear, D2-exact at 1/2/3.2, inside the box, aperture clear, integer counts, level supersets, rank-0 frame, determinism, clamping |
| `latticeProscenium.test.ts` | 8 | viewport containment, aperture, kind/tone/angle mapping, draw-on order, seed sensitivity, poster path untouched |
| `ScreenBorderRig.test.ts` | 11 | camera parenting, frustum fit, gold→brass swap and back, rebuild policy, viewport, disposal |
| `frameMaterial.test.ts` | 10 | both metals, uniform binding, `aTone` plumbing, brass injections present / absent, chunk preservation, cache keys |
| `railGeometry.test.ts` | 7 | vertex counts, degenerate rails, closure, part direction, reveal path, tone defaults and passthrough |
| `useFrameStudio.test.ts` | 13 | pattern/seed commits, surface switch, layer clamps, reset, F-key guard, no-scene tolerance |
| `svgExport.test.ts` | 12 | slugify, one `xmlns`, download names, revoke, PNG rasterise / reject / no-blob / no-context |
| `useLatticeExport.test.tsx` | 4 | the real frame exports its own `<svg>`, PNG size, detached ref |

`npm test` → **95 files / 754 tests**; `tsc --noEmit` and `npm run build` clean (1.35 MB single file). Global coverage rose from 60.3 % to **66.3 %**, and the WebGL layer is no longer dark: `frameMaterial.ts` 100 %, `railGeometry.ts` 97 %, `ScreenBorderRig.ts` 100 % lines, `nineSlice.ts` 100 % lines. Those four are now gated in `vitest.config.ts`.

The lesson worth keeping: **three.js and its shaders are not untestable in jsdom** — geometry builds headless, and `onBeforeCompile` is a plain function over strings. What genuinely needs a browser is only what needs a GPU to *draw*.

## 6. Caveat

No browser in this sandbox. The proscenium is verified as geometry (containment, symmetry, aperture, counts) and as shader text (injections present, chunks preserved), not as a picture. Nothing here has been seen running, and the brass is a look nobody has judged. The manual checks are ADDENDUM-027 §8, plus:

7. Frame Studio → **Screen border** → **Deco lattice**: the proscenium should read as the film's line-bundle edge with a clear picture area; the border should turn from bright gold to darker brass as you switch.
8. **Reroll proscenium** should change the corner ornament and the light's tilt, not the picture area.
9. Console → **Deco lattice** → **Export PNG**: the file should match the preview at 1600 px.
