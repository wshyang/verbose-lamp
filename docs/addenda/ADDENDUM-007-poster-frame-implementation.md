# ADDENDUM-007 — Poster-frame genesis: implementation record

**Date:** 2026-10-23  
**Relates to:** ADDENDUM-006 (plan); BUILD_PROMPT §3, §4, §7  
**Decision Context:** DC-005

## 1. What was built

| Plan step | Outcome |
|---|---|
| Types | `FrameSource` includes `'poster'`. `FRAME_SOURCES` fifth chip: label “Poster”. |
| Generator | `buildPoster` in `generative.ts`: nested mitered half-rectangles, 90° corner fans (`posterFanDir`), stepped L-bands, mid-edge and seam clasps, margin pinstripes. Right half then `mirrorHalves`. |
| Dispatch | `buildGenerativeFrameSpecs` routes `source === 'poster'`. Authored path unchanged. |
| UI | Genesis chips `grid-cols-5`. Level 1–4 still applies (nest/ray/arc density). |
| Preservation | Default `{authored, 2}`. Golden snapshot still passes. GG glyphs still copied into poster (and every other generative source). |

## 2. Math as shipped

- Rings: `level + 1`, inset `0.09·i`, chamfer `0.22·(1 − 0.08·i)`. Ring 0 is `kind: frame`; inner rings `arch`.
- Fan direction at `t ∈ [0,1]`: `normalise((inwardX·(1−t), inwardY·t))`. Top-right inward `(−1,−1)`: `t=0` along −X, `t=1` along −Y, `t=0.5` the bisector.
- Rays: `5 + 2·level`, length `fanR = 0.42·min(hw,hh)`, starting at `0.12·fanR` so they do not pile on the corner vertex.
- Arcs: `min(3, level)` polylines at `r = fanR·(0.32 + 0.28·a)`.
- Stepped L-bands at `0.22·fanR` and `0.40·fanR`.
- Seam clasps are *half*-diamonds on `x = 0`; the mirror completes them.

## 3. Deviations from the plan

1. **No extra file.** Poster lives in `generative.ts` (449 LOC, under the 800 hard limit). `buildFractal` remains 55 lines of pre-existing debt (ADDENDUM-001); new poster helpers are each ≤ 50.
2. **Seam clasps are half-diamonds**, not full diamonds, so mirroring does not double a centred ornament.
3. **Inner rings tagged `arch`**, not `frame`, so Baroque echo-rings apply only to the outer picture-frame. Plan said this; confirming it was necessary — tagging them `frame` would have 4× echoed every nest.

## 4. Measurements (width 5.4, `k = 1`)

| card | L1 | L2 (poster-like) | L4 |
|---|---|---|---|
| hero | 132 specs / 388 pts | 154 / 464 | 194 / 588 |
| monogram | 135 / 418 | 157 / 494 | 197 / 618 |

All under the 1,200-point budget. One draw call.

## 5. What a future reader must know

- This is **not** a reproduction of the Concept Arts one-sheet. No photograph, no official type lockup, no trademarks. It is our 3D bevelled-gold rails following the *same geometric grammar* (D4 picture-frame + 90° corner fans).
- Authored remains the default. Selecting Poster is a genesis change; intricacy still layers ornament around it.
- Existing generative tests auto-included the new source (112 tests total).

## 6. Validation performed

`npx tsc --noEmit` ✓ · `npm test` ✓ (3 files, 112 tests) · `npm run build` ✓
(`dist/index.html` 888.9 kB, gzip 239.1 kB).  
**Browser not available in this sandbox.** Visual check pending: Poster at levels 1–4 against the one-sheet’s *structure* (nested miters, corner fans, clasps), gate parting, and the five-chip genesis row at 390×844.
