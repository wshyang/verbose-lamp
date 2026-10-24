# ADDENDUM-006 — Theatrical poster frame: authored or mathematical? Adding it as a genesis source

**Date:** 2026-10-23  
**Relates to:** BUILD_PROMPT §3 (frame language), §4; ADDENDUM-004 (genesis axis)  
**Decision Context:** DC-005  
**Status:** Plan accepted; implementation in ADDENDUM-007.

---

## 1. Assessment of the 2013 theatrical one-sheet

The gold frame on Baz Luhrmann’s *The Great Gatsby* poster (Concept Arts / Warner Bros.
advertising, not the Deva/Method title sequence) is **authored as a finished 2D
illustration**. It is not a fractal, and it is not the same construction as our
hand-laid per-act title cards.

It is, however, a **highly regular geometric grammar** — more regular than our
`authored` archetypes — and therefore *can* be derived from a small set of parameters
without tracing the poster.

### What the eye is actually looking at

Reading the one-sheet as structure, not decoration:

1. **A picture-frame, not a cartouche.** Thick gold members on all four sides meet at
   **45° miters**, the way a wooden frame is joined. That is joinery, not a freeform
   ornament.
2. **Concentric nested rectangles**, each with the same mitered corners, inset by a
   roughly constant margin. The stacked miters at each corner are what read as
   “stepped Art Deco corners.”
3. **Four-fold dihedral symmetry (D4).** Rotate or flip any corner 90° and you have
   the other three. Mid-edge clasps repeat on all four sides. This is the strongest
   signal that the design is a *rule*, not a unique drawing.
4. **Corner fans occupying the margin.** In each corner, between the outer frame and
   the inner aperture, a 90° Art Deco sunburst: rays of equal length from the corner
   into the interior quadrant, plus a few concentric quarter-arcs / stepped L-bands.
5. **Mid-edge clasps and pinstripe bands** along each side, between the nested
   rectangles — small diamonds or stepped motifs at the midpoints, parallel gold
   rules filling the remaining band.
6. **An inner aperture** (the photograph, or in our case the title) with its own thin
   gold border. The poster is portrait; our cards are landscape. The *grammar*
   transfers; the *proportions* must come from `frameBox`, not from the poster.

### Authored vs mathematical (verdict)

| Layer | Verdict |
|---|---|
| The specific poster artwork (DiCaprio, type lockup, exact weights) | Authored illustration. We will not reproduce it. |
| Nested mitered rectangles, D4 symmetry, 90° corner fans, mid-edge clasps | Mathematical grammar. Parameterised by box, nest count, ray count, fan radius. |
| Our current `authored` genesis | A *different* authored script (octagons, ziggurats, top-centre sunbursts). Not this. |
| Fractal / rosette / arcade | Other generative rules. None of them is this picture-frame grammar. |

So: **the poster is authored; the frame language on it is a generative type we do not
yet have.** Adding it as a fifth `FrameSource` is the same move as ADDENDUM-004, not a
change to the delivered default.

## 2. Decision

Add `source: 'poster'` to `FrameSource`.

```
buildPoster(box, level) → right half → mirrorHalves
```

Default remains `{ source: 'authored', level: 2 }`. Golden snapshot untouched. GG
letterforms still copied into every generative source, including this one.

### 2.1 Construction (right half, x ≥ 0)

Let `rings = level + 1`, `rays = 5 + 2·level`, `arcs = min(3, level)`,
`fanR = 0.42 · min(hw, hh)`.

1. **Nested mitered half-rectangles.** Ring `i = 0..rings-1` inset by `0.09·i`,
   chamfer `0.22·(1 - 0.08·i)`. Ring 0 is `kind: frame` (Minimal still closes);
   inner rings are `kind: arch` (so Baroque echo-rings do not explode the nest).
2. **Corner fans** at top-right `(hw, hh)` and bottom-right `(hw, −hh)`. Inward signs
   `(−1, −1)` and `(−1, +1)`. Ray `t ∈ [0,1]` has direction
   `normalise((inwardX·(1−t), inwardY·t))` — at `t=0` along the edge, at `t=1` along
   the other edge, at `t=0.5` the diagonal. Equal-length rays plus `arcs` concentric
   polylines. Stepped L-bands at `0.22·fanR` and `0.40·fanR`.
3. **Mid-edge clasp:** diamond on the right member at `(hw, 0)`.
4. **Seam clasp:** half-diamond on `x = 0` at top and bottom, so the mirror completes
   a centred diamond without duplication.
5. **Pinstripe band:** one horizontal rule in the top and bottom margins.

Level is recursion/density of this grammar (nests, rays, arcs), not a different
topology.

### 2.2 Why not a linear morph from `authored`

The poster grammar is a picture-frame with D4 fans. Authored cards are top-centre
sunbursts and ziggurats. They do not share a topology; interpolating them degenerates.
A new source is the correct axis (ADDENDUM-004 §2).

## 3. Plan

1. Extend `FrameSource` + `FRAME_SOURCES` with `poster` / “Poster”.
2. `buildPoster` in `generative.ts`; dispatch in `buildGenerativeFrameSpecs`.
3. Genesis UI: five source chips (`grid-cols-5`).
4. Existing generative tests auto-include the new source via `FRAME_SOURCES.filter(isGenerative)`.
   Add: poster emits `frame` + `ray`; golden / authored tests remain green.
5. ADDENDUM-007 with measurements, deviations, pending-browser caveat.

## 4. Impact and risks

- Authored default unchanged. Intricacy still applies (outer ring echoes, ray tips,
  diamond nests).
- Vertex risk: rings × 6 pts + 2 corners × (rays + arc samples). Cap: rings ≤ 5,
  rays ≤ 13, arc samples ≤ 8. Test: ≤ 1,200 points at level 4, `k = 1`.
- We are not reproducing the poster’s photograph, type lockup, or trademarks — only
  the geometric frame grammar, original rails in our 3D bevelled gold.

## 5. Validation planned

`npx tsc --noEmit`, `npm test`, `npm run build`. Browser verification pending.
