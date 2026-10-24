# ADDENDUM-004 — Base-frame genesis: is it a fractal, and can the base itself be tunable?

**Date:** 2026-10-23  
**Relates to:** BUILD_PROMPT §3 (frame language), §4 (per-act construction), §6 (objects/state), §7 (surfaces)  
**Decision Context:** DC-004  
**Status:** Plan accepted; implementation in ADDENDUM-005.

---

## 1. How the base frame is generated today (assessment)

**It is not a fractal.** The current base is a **hand-authored parametric script**:
`buildCoreFrameSpecs(archetype, mainWidth)` calls a fixed vocabulary of helpers
(`addZigguratFrame`, `addCutOctagon`, `addSunburstFan`, `addDiamond`, `addSplitRule`,
`addChevronWings`, plus literal point lists for the two monogram G's). Counts, radii,
insets, Z planes and delays are **literals in the source**, not derived from a recursion.

What *is* mathematical today:

- rail cross-section, miters and normals (`appendChamferedPolyline`);
- the sunburst fans, whose ray length/delay are functions of angular offset;
- the box dimensions, which are functions of `mainWidth`;
- trim reveal and gate parting, which read per-vertex path attributes;
- the intricacy grammar added in ADDENDUM-002, which layers/removes detail around the
  authored base.

So we have **one authored sculpture plus a detail grammar**, not a generative family.

### Why this matters for "can the base be tunable?"

Intricacy answers *how much ornament surrounds the base*. It cannot answer *what rule
draws the base*. To make the base tunable, the base needs its own second axis: a
**genesis** — the rule that produces the primary rails.

## 2. Decision

Add a second, orthogonal tunable: **Frame Genesis**.

```
FrameStyle = { intricacy k ∈ [0,1],  formula F = { source, level } }
buildFrame(archetype, width, F, k) = elaborate_k ∘ reduce_k ∘ annotate ∘ genesis_F(archetype, width)
```

- **`source`** ∈ `authored | fractal | rosette | arcade`. Discrete, because the four
  constructions have different topologies (a Cantor rail is not a rosette sample; a
  linear morph produces degenerate geometry).
- **`level`** ∈ 1..4. Continuous-in-feel recursion depth: iterations for the fractal,
  sampling density and exponent for the rosette, bay count for the arcade. **Ignored by
  `authored`**, whose shape is fixed — surfaced in the UI as disabled, documented here.
- Default `F = { source: 'authored', level: 2 }`. At this default, output is
  bit-identical to today (golden snapshot unchanged). Today's frame becomes **one
  point in the family**, exactly as requested.
- Intricacy keeps working on every source because every generated rail carries a
  `kind` and is passed through the same annotate → reduce → elaborate pipeline.

### 2.1 Generative sources (all deterministic, all mirror-symmetric by construction)

Each source builds **only the right half** (x ≥ 0, starting at top-centre) and then
mirrors it with `partDir = −1`, so symmetry and gate parting are guaranteed rather
than hoped for. The monogram glyph pair is preserved verbatim into every source for
`monogram_gate`, so the signet never disappears.

| source | construction | math |
|---|---|---|
| `fractal` | Cantor-cut rails on φ-inset rings. Primary half-outline, then rings inset by `φ^-(i+1)`; each ring's top/bottom rail is replaced by a Cantor set | `φ = (1+√5)/2`; `cantor(a,b,d) = cantor(a, a+⅓) ∪ cantor(b−⅓, b)` until `d = 0` (d ≤ 3). Widths `0.062·0.7ⁱ`, Z planes stepped back per ring |
| `rosette` | Superellipse cartouche modulated by a harmonic rose | `x = hw·sgn(cosθ)·|cosθ|^(2/n)·(1+a·cos mθ)`, `y = hh·sgn(sinθ)·|sinθ|^(2/n)·(1+a·cos mθ)`, θ from π/2 to −π/2; `n = 2 + 1.2·level`, `m = 3 + level`, `a = 0.045 + 0.018·level`, 48–80 samples; two inner echoes and radial spokes at harmonic peaks |
| `arcade` | Recursive bays of stepped arches between piers, nested per level | `bays = level + 2`; bay `b` spans `[b/bays, (b+0.82)/bays]·hw`; arch apex `0.55–0.61·hh`; recursion insets by `0.12·r` while the bay remains wider than `2.4·inset` |

All sources derive their box from the same `mainWidth` functions as the authored frames,
so typography clearance is unchanged.

### 2.2 Preservation guarantees

1. `authored` at any `level` reproduces the current geometry exactly; the golden
   snapshot test from ADDENDUM-002 must keep passing untouched.
2. The four new sources must each pass: symmetry, determinism, kind/rank coverage,
   monotone count in `level`, and the ≤ 1,200-point Baroque budget.
3. `monogram_gate` keeps its two authored G's in every source, identical point-for-point.

## 3. Plan

1. Extend `frameGrammar/types.ts` with `FrameSource`, `FrameFormula`,
   `DEFAULT_FRAME_FORMULA`, `FRAME_SOURCES`, level bounds.
2. New `frameGrammar/generative.ts` (pure, no Three.js): `frameBox`, Cantor, the three
   builders, `mirrorHalves`, `buildGenerativeFrameSpecs`.
3. `buildFrame({ archetype, mainWidth, formula?, intricacy? })`; existing
   `buildFrameSpecs(archetype, width, intricacy)` stays as a delegating wrapper so the
   golden test and any existing call site are untouched.
4. Rig/manager: replace `setIntricacy` with one `setFrameStyle({ intricacy, formula })`
   so both axes rebuild geometry once, coalesced per animation frame. Typography and
   material are still never re-rasterised.
5. UI: `GenesisControl` (source chips + level slider disabled for authored) above the
   intricacy control; `useFrameGenesis` hook; `G` cycles source; testids
   `genesis__panel`, `genesis__source`, `genesis__level`, `genesis__level-readout`.
6. Tests + ADDENDUM-005 with measurements and the pending-browser caveat.

## 4. Impact and risks

- Camera framing unchanged; generative boxes match authored extents by design. The
  rosette is scaled to `0.94·hw` to absorb harmonic amplitude.
- Vertex budget is the main risk: rosette sampling + 4 echo rings is the heaviest path.
  Mitigation: sample cap 80, inner echoes tagged non-`frame` (no echo production), test
  asserts ≤ 1,200 points at `level 4, k = 1`.
- `level` spanning 1..4 is visible as discrete jumps for the fractal/arcade. This is
  deliberate: it is recursion depth, not a decorative multiplier.
- No persistence; default remains the authored frame.

## 5. Validation planned

`npx tsc --noEmit`, `npm test`, `npm run build`. Browser verification remains
unavailable in the sandbox and will be listed as pending.
