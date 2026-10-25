# Application Architecture

## Intent

The event-night stage is the host application, not the boundary of every
reusable piece. Spectacle effects, the lucky draw, the gilded UI kit and the
Deco Lattice frame generator are independent features that another React
surface can compose without taking ownership of the stage.

## Module Map

```text
src/
  App.tsx                       # Thin entry: provider + shared defs + host
  app/
    EventNight.tsx              # Composes header, stage, nav, overlays
  features/
    spectacle/                  # Callable animation effects (ADDENDUM-020)
      model/                    # types, geometry, quality, motionPolicy, timeline,
                                #   decoGlyphs, chasePattern (pure, tested)
      particles/                # ballistics, blackbody, particlePool, sparkRenderer
      engine/                   # createSpectacleStage, effectRegistry, contracts
      effects/                  # fireworks/ orbs/ sunburst/ confetti/ champagne/
                                #   searchlights/ countdown/ nameReveal/ flash/
      hooks/                    # SpectacleProvider, useSpectacle, useReducedMotion
      components/               # SpectacleLayer (host + aria-live), MarqueeBorder
    lucky-draw/                 # Fair draw product rules (ADDENDUM-020 §3.7)
      model/                    # entries, reel, spin, fitLabel, pickWinner (pure)
      render/                   # drumRenderer (thin canvas layer)
      hooks/ components/ data/  # useLuckyDraw decides; stage renders; guests fixture
    gilded-ui/                  # Gold UI from emoji + label (ADDENDUM-020 §3.8)
      model/                    # goldRamps, goldTable, navItems, plaqueGeometry
      components/               # GlyphDefs, Glyph, Tile, NavBar, Panel
    deco-lattice/               # Octilinear frame generator (ADDENDUM-021)
      lattice, symmetry, bundle, motifs, walk, clip-free composition,
      presets, latticeSvg (pure) + DecoLatticeFrame.tsx (thin SVG + brass)
    spectacle-preview/          # Docked non-modal console
      hooks/                    # useSpectaclePreview decides
      components/ data/         # panel, launcher, catalogue
  shared/
    lib/random.ts               # mulberry32 + hash01 (shared by both plans)
```

## Ownership And Dependencies

- A component renders, a hook decides. All computation over effect, draw or
  frame state lives in hooks or pure modules; no `.filter/.find` in JSX.
- Cross-feature imports go through feature barrels (`index.ts`) only. Feature
  code never imports from `app/`.
- React never touches canvas internals: the stage exposes a typed
  `play(id, params) → EffectHandle` API; params are declared in
  `EffectParamsMap`.
- The lucky draw owns its own canvas and does not use the spectacle stage; it
  chains confetti and name-reveal through the host after landing.
- Layering: light canvases (z 1 / 40, `mix-blend-mode: screen`), solid overlay
  (z 41), lucky-draw overlay (z 35), host content (z 10–30), preview panel
  (z 60). Canvases are lazy and disposed after 10 s idle; the loop runs only
  while an effect is live.
- Tests live beside pure modules (`foo.ts` + `foo.test.ts`); fixtures use the
  Gatsby guest list. See `docs/addenda/ADDENDUM-022-implementation-record.md`
  for deviations from the plans and the validation caveat.