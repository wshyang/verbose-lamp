# Application Architecture

## Intent

The Gatsby premiere is the host application, not the boundary of every reusable
piece. The Art Deco geometry, frame studio, QR generator, title editor, research
dossier, and shared interface controls are grouped so another React surface can
compose them without taking ownership of the cinema timeline or Three.js scene.

## Module Map

```text
src/
  App.tsx                       # Vite/React entry component
  app/                          # Compose a complete host experience
    components/                 # Stage, header, timeline, and HUD layout
  features/
    art-deco-frame/             # Frame grammar, glyphs, rails, materials
    frame-studio/               # Frame controls and state adapter
    gilded-portrait/            # Pure CPU image pipeline and optional portrait studio
    avatar-studio/              # Face detection, background removal, gold-cloisonné avatar studio
    premiere/                   # Sequence domain, audio, and WebGL runtime
    qr-generator/               # Encode, render, export, and modal surface
    research/                   # Read-only dossier and content
    title-customizer/           # Presets, normalization, and editor dialog
  shared/
    ui/                         # Button, IconButton, RangeInput, Dialog
    lib/                        # Small framework-neutral utilities
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
- `features/frame-studio` owns editor state and control presentation. Its hook
  talks to a small `FrameStudioTarget` port, so an editor can bind to another
  renderer that implements the same operations.
- `features/gilded-portrait` owns the tested RGBA-to-gold pipeline, local image
  adapters, and an opt-in modal/launcher. It is not mounted by the Gatsby host.
- `features/title-customizer`, `features/research`, and `features/qr-generator`
  are independently importable product features with their own data and UI.
- `shared/ui` contains interaction primitives, not page layouts. Its Button
  variants and range styling use CSS custom properties, so a host can theme them
  without forking the components.
- Dependencies point from the app composition into features, and from features
  into shared UI or domain modules. Feature code must not import from `app/`.

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