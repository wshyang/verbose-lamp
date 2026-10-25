# Application Architecture

## Intent

The Gatsby premiere is the host application, not the boundary of every reusable
piece. The Art Deco geometry, frame studio, QR generator, title editor, research
dossier, and shared interface controls are grouped so another React surface can
compose them without taking ownership of the cinema timeline or Three.js scene.

## Module Map

```text
src/
  App.tsx                       # Vite/React entry component (renders DemoHost)
  app/                          # Compose a complete host experience
    DemoHost.tsx                # Mounts the premiere or the Event Night demo
    hooks/                      # useDemoScreen (History API), usePremiereSpectacle
    model/                      # parseDemoScreen (pure, tested)
    components/                 # Stage, header, timeline, and HUD layout
  features/
    art-deco-frame/             # Frame grammar, glyphs, rails, materials
    avatar-studio/              # Avatar composition, photo session, gold studio UI
    background-removal/         # Matte reading, 128-grid cut-out, soft subject alpha
    deco-lattice/               # Octilinear line-bundle frame generator (ADDENDUM-021)
    enamel-backdrop/            # Cloisonné pattern fields, gold leaf, panel renderer
    event-night/                # Dinner & Dance demo screen composing the four below
    face-detection/             # Avatar framing from BlazeFace detections
    frame-studio/               # Frame controls and state adapter
    gilded-portrait/            # Pure CPU image pipeline and optional portrait studio
    gilded-ui/                  # Gold plaques, glyphs and nav bar from emoji + label
    lucky-draw/                 # Fair draw rules, spin profile, canvas drum
    premiere/                   # Sequence domain, audio, pure choreography, R3F scene
    qr-generator/               # Encode, render, export, and modal surface
    research/                   # Read-only dossier and content
    spectacle/                  # Canvas-2D effects: fireworks, sparklers, sunburst…
    spectacle-preview/          # Docked console that drives the spectacle effects
    title-customizer/           # Presets, normalization, and editor dialog
  shared/
    hooks/                      # useReducedMotion
    ui/                         # Button, IconButton, RangeInput, Dialog
    lib/                        # Small framework-neutral utilities
      random.ts                 # Seeded PRNG (mulberry32, hash01) and crypto pick
      raster/                   # RgbaImage/AlphaMask contracts, resample, morphology
```

Each feature keeps its own `components`, `hooks`, `model`, `data`, or `engine`
folders only where those concerns exist. Feature `index.ts` files define the
supported import surface; internal files should remain private to that feature.

## Ownership And Dependencies

- `src/App.tsx` is intentionally thin. `src/app/GatsbyPremiere.tsx` composes the
  screen and connects feature APIs; it does not implement playback or geometry.
- `features/premiere` owns the five-act sequence, camera/audio controls, and the
  scene lifecycle. React UI talks to the renderer-neutral `PremiereSceneApi`
  (`scene/sceneApi.ts`) rather than reaching into Three.js objects; the R3F
  implementation (`scene3d/`) backs it with a vanilla Zustand store read
  transiently in frame loops, and the camera/timing/style decisions are pure,
  tested modules (`scene/choreography.ts`, `styleClamp.ts`, `orbitFocus.ts`,
  `model/freeze.ts`).
- `features/art-deco-frame` owns reusable frame grammar, genome data, beveled
  rail geometry, typography glyphs, and materials. It has no timeline or HUD.
- `features/frame-studio` owns editor state and control presentation. Its hook
  talks to a small `FrameStudioTarget` port, so an editor can bind to another
  renderer that implements the same operations.
- `features/gilded-portrait` owns the tested RGBA-to-gold pipeline, local image
  adapters, and an opt-in modal/launcher. It is not mounted by the Gatsby host.
- `shared/lib/raster` owns the pixel contracts every image feature speaks, plus
  resampling and morphology, so no feature imports another just for a type.
- `features/face-detection`, `features/background-removal` and
  `features/enamel-backdrop` have no React and no knowledge of this app. Their
  model loaders are thin, cached and never throw; the decisions (framing,
  cut-out grid, pattern fields) are pure and tested. Any one can be reused alone.
- `features/avatar-studio` composes those three with the gilded-portrait pipeline
  into a framed avatar. Hooks decide (session machine, look, memoised layers);
  components only render. The header mounts its launcher. The composite carries
  a per-pixel metal map, so the preview's glint (`shimmer.ts`) lights gold and
  leaves enamel and skin alone; the PNG export is always the still.
- `features/title-customizer`, `features/research`, and `features/qr-generator`
  are independently importable product features with their own data and UI.
- `shared/ui` contains interaction primitives, not page layouts. Its Button
  variants and range styling use CSS custom properties, so a host can theme them
  without forking the components.
- Dependencies point from the app composition into features, and from features
  into shared UI or domain modules. Feature code must not import from `app/`.

## Switching Demos

`src/app/DemoHost.tsx` mounts exactly one demo. `GatsbyPremiere` carries a header
launcher (`EventNightLauncher`); `EventNightScreen` carries a back button. The
choice lives in the URL hash (`#event-night`) through the History API, so the
browser's Back button returns to the premiere. Switching unmounts the other demo:
the premiere's Three.js scene and audio dispose through their existing cleanup,
and the premiere starts over when it is shown again.

## Spectacle And Event Night

- `features/spectacle` is a typed stage: `play(id, params)` returns an
  `EffectHandle`; params are declared in `EffectParamsMap`. `engine/layers.ts`
  owns the lazily created canvases (light layers use CSS `screen` blending, the
  solid overlay normal blending) and `engine/effectScheduler.ts` owns the frame
  loop, which runs only while an effect is live. React never reaches into canvases.
- Pure modules (`model/`, `particles/`, `*Plan.ts`, `show.ts`, `shells.ts`) carry
  the logic. `testing/recordingCanvas.ts` is a test-only fake 2D context behind
  the golden recordings that lock each effect's drawing across refactors.
- `features/lucky-draw` keeps the fairness boundary: `pickWinner` uses crypto
  entropy, the animation only plays the result out. It renders inside the shared
  `Dialog` and does not use the spectacle stage; the host chains confetti and the
  name reveal after it lands.
- The transition formerly called "orbs" is the `sparkler-transition`
  (`effects/sparklers/`): sparkler wands travel the tracks, shed crackle sparks,
  and flash on inward collision. `orb-transition` survives as a deprecated typed
  alias of the same implementation.
- `features/event-night` is the only feature that composes `spectacle`,
  `spectacle-preview`, `lucky-draw`, `gilded-ui` and `deco-lattice`. The Gatsby
  Premiere composes the same preview panel as a left-docked non-modal overlay
  from `src/app` (`usePremiereSpectacle`), per ADDENDUM-020 §3.9. Features do not
  import each other except through barrels, and none import `app/`.

## Reusing The UI

Use the shared controls for common interaction semantics and keep feature
presentation in the consuming component:

```tsx
import { Button, Dialog, IconButton, RangeInput } from '@/shared/ui';

<Button variant="panel" onClick={onOpen}>Open editor</Button>
<IconButton label="Close editor" icon={<X />} onClick={onClose} />
<RangeInput min={0} max={100} value={value} onChange={onChange} />
<Dialog open={open} onClose={onClose} labelledBy="editor-title">
  <h2 id="editor-title">Editor</h2>
</Dialog>
```

Then import a feature from its barrel, for example
`import { QrGeneratorLauncher } from '@/features/qr-generator'`. Use a feature
hook when the host must supply a renderer or state adapter; keep dialogs
self-contained when they own their own session state. Do not copy the Gatsby
header or timeline into another product simply to reuse a button or modal.

## Adding A Feature

1. Put product state, validation, and pure computations in the feature's
   `model` or `hooks`; add adjacent tests for pure modules.
2. Keep React components focused on markup, accessible state, and event wiring.
3. Expose only supported components, hooks, and types through the feature barrel.
4. Reuse shared controls when their interaction contract fits; add a new shared
   primitive only when it is useful to more than one feature.
5. Record architectural or behavior decisions in the sequential addenda register.

The three.js renderer is deliberately isolated from normal feature UI. A new app
can reuse the QR generator, title customizer, research dialog, or frame studio
without mounting `PremiereCanvas`; a frame-based experience can reuse the
Art Deco engine through its typed exports.

## Testing

`npm run test:coverage` enforces a literal 100% gate (lines, statements,
functions, branches) over `src/**`, per ADDENDUM-025's recorded override of
CLAUDE §2. Pure modules carry correctness; rendering is exercised through seams —
the recording 2D canvas for spectacle effects, `@react-three/test-renderer` for
the R3F scene graph, jsdom for DOM components. Golden snapshots pin geometry and
draw-call digests, never pixels. `e2e/` holds the Playwright likeness scaffold
(ADDENDUM-022): it drives the `?freezeAt=` hook at fixed times, but has no
committed baselines yet — `npm run e2e:update` on a machine with a browser
creates them, and a human reviews them before they gate anything.