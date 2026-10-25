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
    hooks/                      # useDemoScreen: screen state over the History API
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
    premiere/                   # Sequence domain, audio, and WebGL runtime
    qr-generator/               # Encode, render, export, and modal surface
    research/                   # Read-only dossier and content
    spectacle/                  # Canvas-2D effects: fireworks, orbs, sunburst, confetti…
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
  scene lifecycle. React UI talks to the typed controller rather than reaching
  into Three.js objects.
- `features/art-deco-frame` owns reusable frame grammar, genome data, beveled
  rail geometry, typography glyphs, and materials. It has no timeline or HUD.
- `features/premiere/scene3d` is the React Three Fiber port (ADDENDUM-022 Phase 2,
  ADDENDUM-032). It is mounted only when the URL asks for it — `?renderer=r3f` — and
  the default remains `scene/GatsbySceneManager.ts`, which stays the fidelity
  reference. The port's pure layer (`scene/styleClamp`, `scene/orbitFocus`,
  `scene/rendererMode`, `scene3d/playback`) holds the timing and clamping rules;
  `scene3d/premiereStore.ts` is the single zustand store, and `storeSceneApi.ts`
  presents that store behind the *same* scene API the manager implements, so no
  hook, surface or keyboard shortcut had to learn about the second renderer.
  Components are one concern each (`PlaybackClock`, `TitleCard`, `DecoWall`,
  `Searchlights`, `GreenLight`, `GoldDust`, `LightingRig`, `BallroomEnvironment`,
  `CinemaCamera`, `ScreenBorder`), composed by `PremiereScene` and mounted by
  `PremiereCanvas`; `CinemaComposer` keeps the manager's exact post order (bloom →
  silver nitrate → output) rather than adopting a different post-processing stack.
  `usePremiereRuntime` installs whichever renderer is active behind the same scene
  API, so no hook or surface changes; `?freezeAt=` pins either one to a moment for
  the screenshot gate. Both are held to the same baselines: `e2e/likeness.spec.ts`
  reads `PREMIERE_RENDERER` and appends it to every frozen-frame URL.
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
- `features/event-night` is the only feature that composes `spectacle`,
  `spectacle-preview`, `lucky-draw`, `gilded-ui` and `deco-lattice`. They do not
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
without mounting `GatsbySceneManager`; a frame-based experience can reuse the
Art Deco engine through its typed exports.