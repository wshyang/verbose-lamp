# AGENTS-frontend.md — a component renders, a hook decides

> Section file of [`AGENTS.md`](AGENTS.md). Adopted from `GREENFIELD.md` §6–7 (frontend half).

## 1. The split is the server boundary, not "looks like state"

| The component owns | The hook owns |
|---|---|
| Layout and JSX | Anything calling `lib/api` |
| View-only state (is a modal open, which tab) | Any computation over server data |
| Event **wiring** | Validation of user input against domain rules |
| DOM-only effects (`focus`, scroll) | Fetching effects, retries, the offline queue |

- **The hook returns a plain object; the component destructures it.** No JSX in a hook.
- **No API import in a component.** That is the checkable signal:
  `grep -c "lib/api" <Component>.tsx` must be `0`. `npm run standards` enforces it.
- Hooks live in `src/lib/hooks/use<Feature>.ts` **beside their test**
  (`use<Feature>.test.ts`, driven with `renderHook`) and **must not import from
  `components/`**.
- **Move bodies, don't rewrite them.** A separation refactor must be verifiable by diffing the
  extracted function against the original with whitespace normalised. Anything not
  byte-identical is a behaviour change wearing a refactor's clothes.

## 2. The JSX interior is presentation-only

This is the half that gets missed: a component can satisfy every rule above and still compute
domain rules on every render, because most gates never look inside the `return`.

Between `return (` and its closing `)`:

- only markup, bindings already computed above the return, and wiring;
- **no** `.filter()` / `.reduce()` / `.sort()` / `.find()` / `.some()` / `.every()`. A bare
  `.map()` that renders a list is fine;
- **compute a derivation once** — `{xs.filter(p).length === 0 ? <Empty/> : xs.filter(p).map(…)}`
  runs the predicate twice and reads as two rules that happen to agree. Name it above:
  `const scoredScans = …`;
- inline handlers are wiring only — a setter, a navigation, a `.focus()`. The moment one needs
  a branch or a computation, name it above the return (or move it to the hook if it touches
  server data);
- **no inline `new Date()` / `.toFixed()` / `JSON.parse`** — use `lib/format.ts`.

A derivation inside JSX cannot be unit-tested without rendering; computed twice it can drift;
and a cascade rule buried in an `onChange` is domain logic no test can reach.

## 3. `data-testid` on every interactive element, at authoring time

Convention: **`{component-kebab}__{element-role}`**

```tsx
<button data-testid="signup-form__submit">Sign up &amp; join!</button>
<input data-testid="signup-form__nickname" />
<li data-testid="team-browse__row">…</li>      {/* repeated rows share one testid */}
```

- Repeated rows **share one testid**; scope by anchor text first, index last.
- Interactive = `button`, `a`, `input`, `select`, `textarea`, `form`, and anything with
  `onClick`. Gaps defeat the point, so `npm run standards` fails the build on a missing one.
- Testids are a **contract** the unit and e2e suites depend on. Renaming one is an API change:
  update the specs in the same commit.

## 4. Two UI languages, kept apart

| Theme | Applies to | Rules |
|---|---|---|
| `theme-gameboy` | Participant surfaces S1–S17, S60 | Pixel type, Sentosa palette, avatars, motif sprites (ADR-014), chunky bevelled controls, ≤1-tap QR from the persistent bottom nav |
| `theme-console` | Facilitator S18–S33 and superadmin S34–S59 | **Text only. No avatars, no sprites, no decoration.** Facilitator: huge tap targets, high contrast, one primary action per screen. Superadmin: dense tables, filters, explicit reason inputs |

`fds.md` §5.5 is a hard rule: **avatars and sprites appear on participant-facing surfaces
only.** `check-standards.mjs` fails if anything under `components/participant/` (avatars,
`PixelMotif`, the motif URL helper) is imported under `routes-facilitator/` or
`routes-superadmin/`, or if a `gb-*` class appears there.

A labelled field on a console form is a `ConsoleField` (or `CheckField`) from `components/console/`, not a hand-rolled `<label>`: it renders the (i) help tooltip and wires `aria-describedby`. Its sentence is a topic in `packages/contracts/src/fieldHelp.ts` (ADR-319), so a new field adds its copy there; `fieldHelp.copy.test.ts` fails on a topic nobody renders or a screen asking for one that does not exist.

Decoration rules for `theme-gameboy` (ADR-014):

- sprites are rendered by `components/participant/PixelMotif.tsx`, always `aria-hidden` with an
  empty `alt` — a heading, tab or row must still read correctly with images off;
- art is generated and committed (`npm run motifs --workspace @psd/web`), never drawn at
  runtime, and referenced by URL;
- background scenery is the generated Sentosa panorama (ADR-022/023), drawn by `SentosaScene` (`src/themes/sentosa/`) from
  the PNG layers in `src/themes/sentosa/art/pixelArt.ts` — not CSS-only motif sprites, which is what this bullet
  used to claim. It renders at every width (ADR-256), and in portrait the shell paints a sky
  with drifting cloud motifs above the scene strip (ADR-265); every animation is switched off
  under `prefers-reduced-motion`.

## 5. Copy discipline

- User-facing strings come from `@psd/contracts` (`messages.ts`, `emptyStates.ts`) — the FDS
  tables are normative and live in exactly one place.
- **Never show internal design decisions to end users.** No surface anchors (`S27`), no DC/ADR
  numbers, no slugs, no "snapshot"/"idempotency" vocabulary in visible copy. Keep the rationale
  in code comments and `docs/addenda/`.
- Keep third-party/external contract keys exactly as the external system requires, even when
  they clash with our casing. Not everything is ours to rename.

## 6. Offline behaviour is a first-class UI concern

The fringe scanner is used on a beach with unreliable connectivity (`fds.md` DC-004):

- a scan that cannot reach the server is queued in `localStorage` and the UI confirms
  **immediately** with the queued variant of the confirmation;
- the queue is drained by a sync worker with idempotent retries (`client_scan_uuid`);
- the pending count is always visible, and S32 lists the queue with a manual retry;
- queue access goes through `lib/offline/scanQueue.ts` only — no component touches
  `localStorage` directly.
