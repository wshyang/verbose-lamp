# Additional backdrop patterns: an assessment

An assessment, not a build. Asked 2026-10-07, against `34346c3`.

Three pattern families were asked for:

- 🌀 **Concentric Radiating Shapes** (eco-logos)
- ⚡ **Chevron & Bargello Waves**
- 🌀 **Psychedelic Swirls & Groovy Waves**

with two stated requirements: the implementation must be **mathematical**, and each option must
**expose the knobs that tune its algorithm**.

---

## Decisions taken (2026-10-07)

The assessment below was written first and its recommendations were then ruled on. Where a
recommendation was **not** taken, the original reasoning is left standing rather than quietly
edited away, so the trade being accepted stays visible.

| Question | Decision | Status of the recommendation |
|---|---|---|
| Shape of the implementation | **Four literally-named patterns**, each a self-contained function | recommendation (two generators + a shared warp) **not taken** |
| How many colours | **Up to four bands, interpolated from two picked endpoint colours** | recommendation **taken** |
| Renaming `sunburst` → `backdropPattern` | **Rejected — not asked for, do not do it** | recommendation **withdrawn**, see below |

**On the rename.** It was never requested; it was offered here and declined. The ask was only
ever to take the spiral out from under its own heading and present it as one more option at the
end of the backdrop colours, which is done (ADR-204). `sunburst` therefore keeps its name. The
cost is recorded under "the name" below and is now a knowingly accepted debt, not an oversight.

**On four self-contained patterns.** This is more code than the generator approach and the
duplication is real — the p-norm, the band index and the warp terms will each exist in more than
one file. What it buys is that each pattern can be read, tuned and broken on its own, and that a
change to the chevron cannot alter what the spiral draws. Given that the spiral is already worn
by live participants, that isolation has a value the line count does not capture. The one thing
that must **not** be lost: the maths below is still the maths. "Self-contained" means four
functions, not four inventions.

**Consequence for 🌀 psychedelic swirls.** Under the generator plan it was a modifier available
on every pattern. As a standalone pattern it is its own generator — a warped field in its own
right — and the other three do not gain ripple. The vortex term stays where it already is, inside
the spiral.

---

## Short answer

**The drawing is cheap; the plumbing is not.**

The original recommendation was to build two generators and one warp and let the three families
fall out as combinations. That was declined in favour of four named patterns, so the shared-warp
saving does not apply — but the rest of the analysis stands unchanged, and in particular the
finding that *the renderer is already pattern-agnostic in the only place that matters*.

The existing renderer is already pattern-agnostic in the only place that matters, so the drawing
cost of all of this is roughly **150 lines of pure arithmetic with no DOM in it**. That is not
where the work is. The work is in three places the brief does not mention, and two of them have
to happen *before* any new pattern is added or they get much more expensive:

1. **The wire format.** `avatarLook` is a positional hyphen-joined string. ADR-173 appended the
   spiral to the end of it and relied on arity to tell "has a spiral" from "does not". That trick
   works exactly once. A second pattern family breaks it.
2. **Two colours.** The renderer splits backdrop cells into exactly **two** buckets. Bargello is
   a *shading* technique — its whole identity is four to six hues of one colour — and a two-tone
   bargello is not bargello. This is the one decision in the document with a real cost attached.
3. **The name.** `sunburst` is currently the name of both the feature and the category. With four
   patterns it is the name of one of them, and it is spelled into the schema, the wire code, the
   CSS, nine test ids and a `data-` attribute.

---

## What is actually there today

### The renderer is one predicate wide

`apps/web/src/lib/avatar/sunburst.ts` is 90 lines and its entire pattern-specific surface is:

```ts
isRayCell(cell: {x, y}, size: number, sunburst: AvatarSunburst): boolean
```

`splitBackdropCells` walks the grid, asks that question per cell, and swaps the cell's palette key
for a `ray` key or a `gap` key. Everything downstream is already general:

| Concern | How it is handled | Does a new pattern touch it? |
|---|---|---|
| Drawn avatar, 64×64 | `DRAWN_BACKDROP_KEYS` maps base **and** vignette shade, so the edge darkening survives | no |
| Photo sprite, 128×128 | `paintSpriteSunburst` finds the backdrop key and adds one synthetic key `z` | only if >2 colours |
| SVG emission | `svgOf` merges equal-key runs into `<path>` rects | no |
| Caching | pattern is applied at **draw** time, never baked into the stored sprite (ADR-173) | no |

That last row is the load-bearing one and it was a deliberate decision: because the pattern is a
function of the *look* rather than of the sprite, moving a slider re-derives it from scratch and
cannot corrupt anything. **Every pattern proposed here inherits that for free.**

So: a new pattern is a new pure function. Not a new pipeline.

### ADR-173's `twist` is already a domain warp

This is the finding that collapses the whole brief. `isRayCell` computes:

```ts
const angle = Math.atan2(dy, dx) + radius * curvature;   // θ + r·k
```

Rotating a point by an angle proportional to its radius **is** a vortex / twirl warp. It is not
a property of sunbursts; it is a transformation of the plane that happens to be written inside
the sunburst function. Lift it out into a shared `warp(u, v, params)` applied *before* any
pattern is evaluated, and:

- the spiral keeps drawing exactly what it draws (same formula, same place in the pipeline);
- **every other pattern gains twist for nothing**;
- 🌀 "Psychedelic Swirls" stops being a third pattern to write and becomes a *modifier* that the
  other patterns wear.

---

## The maths

Work in centred unit space, so nothing depends on the grid being 64 or 128 cells:

```
u = (x + 0.5)/size - 0.5          v = (y + 0.5)/size - 0.5          u, v ∈ (-0.5, 0.5)
r = hypot(u, v)                   θ = atan2(v, u)
```

The half-cell offset is already in `isRayCell` and is there for a reason: sampling the *middle*
of the pixel keeps the pattern symmetric about the centre instead of leaning half a cell up and
to the left. Every formula below inherits it.

Every generator returns a **band index**, and the band index picks a colour:

```
band(x, y) → 0 … bands-1
```

The current code returns `boolean`, which is the two-band case. That generalisation is the single
mechanical change the renderer needs; see "Two colours or many" below.

### Generator 1 — Radial (covers the spiral **and** 🌀 concentric radiating shapes)

A sunburst is bands cut by **angle**. Concentric rings are bands cut by **radius**. They are the
same function with two coefficients:

```
D(u, v) = sectors · θ/2π  +  R(u, v)/ringWidth
band    = floor(D + phase) mod bands
```

Set `ringWidth = ∞` and you have the sunburst. Set `sectors = 0` and you have concentric rings.
Set both and you get a barber-pole spiral, which nobody asked for and which comes free.

The "shapes" in *concentric radiating shapes* is the choice of **R**. Use the Minkowski
p-norm — the unit ball of ‖·‖ₚ is a diamond at p=1, a circle at p=2, a squircle at p=4 and a
square as p→∞ ([Superellipse](https://en.wikipedia.org/wiki/Superellipse),
[Squircle](https://en.wikipedia.org/wiki/Squircle)):

```
R_p(u, v) = (|u|^p + |v|^p)^(1/p)          p → ∞  ⇒  max(|u|, |v|)
```

and modulate it with a rose term `r = cos(kθ)` ([polar curve gallery]
(https://opentext.uleth.ca/apex-video/sec_polar.html)) to get petal/flower rings rather than
plain ones:

```
R(u, v) = R_p(u, v) · (1 + lobeDepth · cos(lobes · θ))
```

`lobes = 0` is plain rings; `lobes = 6, lobeDepth = 0.2` is the seventies eco-logo flower.

**Knobs:** shape (diamond · circle · squircle · square, i.e. p ∈ {1, 2, 4, ∞}) · rings ·
sectors · lobes · lobe depth · bands · phase.

> Implementation note: do not call `Math.pow` with a large `p`. Four named stops with
> `max(|u|,|v|)` for the square case is both faster and, at 64 cells, visually identical to a
> continuous slider — of which more under "what the pixel budget allows".

### Generator 2 — Linear (covers ⚡ chevron & bargello, and plain stripes)

Bargello is "upright flat stitches laid in a mathematical pattern", where the pattern comes from
**stepping** — each stitch offset vertically from its neighbour by a fixed amount, with colour
bands following the resulting profile ([Bargello (needlework)]
(https://en.wikipedia.org/wiki/Bargello_(needlework))). That is literally a band index taken
against a displaced coordinate:

```
rotate (u, v) by angle φ          → (u', v')
offset(u') = amplitude · W(u'/period + phase)
band       = floor((v' - offset(u')) / bandHeight) mod bands
```

`W` is the waveform, and the two asked-for looks are two choices of it:

| `W` | Formula | Look |
|---|---|---|
| triangle | `4·|t - floor(t + 3/4) + 1/4| - 1` | **chevron** — hard points |
| sine | `sin(2πt)` | **bargello** — the flame/curve |

The triangle form is the canonical closed form ([Triangle wave]
(https://en.wikipedia.org/wiki/Triangle_wave)); it needs no branches, which matters for a
function called 4,096 times per render and for the coverage gate.

**Knobs:** waveform · period · amplitude · band height · bands · angle · phase.

Worth noticing: `amplitude = 0` is **plain stripes**, and `angle = 90°` turns them vertical. One
generator, three recognisable patterns, no extra code.

### The warp — 🌀 psychedelic swirls & groovy waves

Applied to `(u, v)` *before* either generator runs. Two terms, both standard domain warping:

```
vortex:  rotate (u, v) about the centre by  r · twist        ← this already exists, inside isRayCell
ripple:  u += w · sin(2π·f·v + φ₁)
         v += w · sin(2π·f·u + φ₂)
```

The ripple is what makes a straight stripe field read as liquid, and what turns concentric rings
into a melting target. Because it is a pre-transform, it composes: vortex + ripple on the linear
generator is the "groovy wave" poster look; vortex + ripple on the radial generator with lobes is
the "trippy swirl" look.

**Knobs:** twist (exists) · ripple strength · ripple frequency.

### How this maps onto four self-contained patterns

The decision was four named functions rather than two generators, so the table below is a
reading guide rather than a build plan: each row is one file, and the "built from" column says
which of the formulae above that file implements. What is deliberately **not** shared is the
dispatch — no `kind` switch inside a generator, no pattern reaching into another's parameters.
What is worth sharing, because it is arithmetic with one right answer and no judgement in it, is
a small `unitSpace(x, y, size)` helper and the band→key lookup; duplicating *those* would be
copying a bug four times rather than isolating four patterns.

### Coverage of the brief

| Asked for | Built from |
|---|---|
| 🌀 Concentric Radiating Shapes | Radial, `sectors = 0`, p-norm shape, lobes |
| ⚡ Chevron & Bargello Waves | Linear, triangle or sine |
| 🌀 Psychedelic Swirls & Groovy Waves | either generator + warp |
| *(existing)* Spiral sunburst | Radial, `ringWidth = ∞`, `bands = 2`, vortex |
| *(free)* stripes, targets, barber pole, flower rings | combinations |

Two generators, one warp, four presets. Not three new pattern implementations.

---

## The three things that are actually expensive

### 1. The wire format breaks at the second pattern

`avatarLook` is a positional string:

```
skin-hairStyle-hairColour-facialHair-build-outfit-backdrop[-colourTwo-rays-twist]
    5 indices                          2 colours      ADR-173's three extra parts
```

`parseAvatarLook` decides whether there is a spiral by **arity**: zero trailing parts means none,
three means a spiral, anything else is malformed. ADR-029 (`build`) and ADR-173 (the spiral) both
used the same "append and omit" move, and it is genuinely good — every code ever minted stays
readable, and nothing needs a migration.

It does not survive a second pattern family. A chevron needs seven numbers, a radial needs eight;
sooner or later two patterns want the same count and the format has no way to tell them apart.
Guessing by arity would be a silent, unfixable corruption: the look would parse, and draw the
wrong thing.

**Recommendation — a kind token at the head of the trailing group:**

```
…-backdrop-r-f7d154-0-6-4-2-3        radial
…-backdrop-l-f7d154-t-8-3-4-2        linear
…-backdrop-f7d154-12-4               LEGACY spiral, unchanged, still parses
```

The back-compatibility rule is one line and is fully decidable: *if the first trailing part is a
six-digit hex colour, it is a legacy spiral; otherwise it is a kind token.* `#rrggbb` and a short
lowercase kind letter cannot collide. Every code in the database today keeps drawing what it
draws, and no migration runs.

**Prove the legacy path by exhaustion, not by sampling.** Legacy space is `rays 3…24 × twist
0…10` = **242** looks. Asserting that every one of them parses identically to its tagged form
is a single fast test and it retires the whole risk at once — the rendered avatar is a pure
function of the parsed look, so two codes that parse the same cannot draw differently.

### 2. Two colours, or many — the one real decision

`SunburstKeys` is `{ ray, gap }`. Exactly two.

Going to N bands is small in the renderer (`keys: string[]`, index instead of boolean) and small
for the photo sprite (`z0…zN` instead of one `z`). It is **not** small for the drawn avatar,
where every band needs a vignette-shaded twin, so N bands means 2N palette keys. And it is not
small in the studio, where N bands means N colour pickers and a control for N itself.

| | Two colours | Up to six bands |
|---|---|---|
| Renderer | unchanged | ~40 lines |
| Sprite palette | unchanged | ~15 lines |
| Drawn vignette map | unchanged | ~10 lines, 2N keys |
| Look code length | ~45 chars | up to ~80 chars |
| SVG size | unchanged | more key runs, more `<path>`s — **needs measuring** |
| Studio UI | one extra picker | a band editor, add/remove, reorder |
| **Bargello** | not really bargello | yes |

Bargello and the eco-logo both get most of their identity from a graded run of related hues. A
two-tone chevron is a perfectly nice pattern and is not the thing in the reference images. My
recommendation is **bands, capped at four**, and generated rather than hand-picked: let the
participant choose two endpoint colours and interpolate the intermediate bands in a perceptual
space. That gets the shading effect, keeps the wire code short, keeps the studio to two pickers
plus a count, and sidesteps the "six colour wells on a phone" problem entirely.

### 3. `sunburst` is the wrong name now, and renaming later costs more

`AvatarLook.sunburst` · `AvatarSunburst` · `SUNBURST_RAYS_MIN/MAX` · `SUNBURST_TWIST_*` ·
`isRayCell` · `splitBackdropCells`'s `SunburstKeys` · `paintSpriteSunburst` · `SPRITE_GAP_KEY` ·
`avatar-studio__sunburst-{colour,colour-wheel,rays,twist,first}` test ids · the preview's
`data-sunburst` attribute · the `.gb-swatch--spiral` class.

Today `sunburst` means "the backdrop has a pattern". After this work it means "the backdrop has
one particular pattern", and every one of those names becomes a small lie.

**This rename was offered and declined (see Decisions, above), and is not to be done.** It is
recorded here only so the next person to read `AvatarLook.sunburst` while holding a chevron
understands that the name is known to be wrong and is being carried deliberately. The practical
mitigation, since the field cannot be renamed, is that the *kind token* in the wire format and
each pattern's own type name must be honest: a chevron is stored under `sunburst`, but it is
never **called** a sunburst anywhere a reader can see.

---

## What the pixel budget allows

A drawn avatar is **64×64** and a photo sprite **128×128**, but the surface that matters is a
chat avatar at roughly **32–48 CSS pixels**. This is a harder constraint than any of the maths.

The existing `SUNBURST_RAYS_MAX = 24` is already at the edge: 24 rays plus 24 gaps is 48 sectors
around a circle about 64 cells across, so near the centre a sector is well under one cell and the
middle of the image is noise. ADR-173's `SUNBURST_TWIST_STEP` comment shows the same reasoning
applied to twist — the maximum is set at "unmistakably a spiral, not so much that the rays wrap
over themselves and read as noise at 32 pixels".

Every new knob needs the same treatment, and the limits below are **measured, not guessed**.

### The probe

`apps/web/scripts/probe-backdrop-patterns.mjs` renders candidate parameter spaces to six contact
sheets, downsampled to 32px and then point-resized so the pixels being judged are the ones that
will actually ship. It is a tool, not a build input; nothing imports it and nothing it writes is
committed. It is kept so that the next person to disagree with a range can re-derive it in one
command instead of re-arguing it:

```
node apps/web/scripts/probe-backdrop-patterns.mjs /tmp/bp
```

ADR-173 chose the twist limit this way. ADR-203 is the standing reminder of the alternative:
`adjacentSeedOrder`'s doc comment described a bye distribution the code had never produced, and
it survived for exactly as long as nobody printed the output. "Eight lobes reads well at 32px"
is the same kind of claim — easy to write, easy to never check.

### Two couplings that independent sliders would let a participant break

This is what the probe actually bought, and neither was visible from the formulae.

**1. Chevron amplitude is only meaningful relative to period.** Sheet 3 varies period 6…48
against amplitude 0…24. The failures do not fall on a line of constant amplitude; they fall on a
line of constant **ratio**. Period 12 reads at amplitude 8 and is mush at 16; period 48 reads at
all of them. The pattern dies when the waveform's slope gets steep enough that a band travels
further sideways than it is tall.

> **Therefore: do not offer amplitude in cells.** Offer it as a *fraction of period*, 0–0.7.
> Then every position of every slider produces something that reads, and the control cannot be
> used to make mush. Period itself floors at **12 cells** — below that the chevron points are
> sub-pixel at 32px regardless of amplitude.

**2. Ripple strength is only meaningful relative to the square of frequency.** Sheet 5 varies
warp 0…0.2 against frequency 1…5. Warp 0.2 at frequency 2 reads beautifully; warp 0.12 at
frequency 3 is already busy, and warp 0.08 at frequency 5 is noise. Products of `w·f` do not
separate the good from the bad, but **`w·f² ≤ 0.8`** separates every tile correctly — it is the
curvature of the displacement, not its size, that destroys the pattern.

> **Therefore: clamp the warp slider's maximum as a function of frequency**, `w_max = 0.8/f²`,
> rather than offering a fixed 0–0.2 range that is right at f=1 and wrong at f=5.

### A third finding, which vindicates the band decision

Sheet 4 varies band height 3…16 against band count 2…6 on a sine-waved field. The expectation
was that more bands would be busier and therefore worse at 32px. **The opposite happened.** At
band height 4, two bands is the worst tile on the sheet — hard moiré — and six bands is the
best. Because the bands are *interpolated between two endpoints*, adding bands makes each
neighbouring pair of colours **closer together**, so the aliasing that does occur is between
near-identical colours and reads as shading rather than as noise.

Interpolated bands are therefore not just a bargello feature; they are an anti-aliasing
mechanism. This is a point in favour of the decision already taken, and an argument for the
default band count being **3 or 4 rather than 2**.

### Measured ranges

| Knob | Range | Read off |
|---|---|---|
| bands | 2–4, default 3 | sheet 4 — 2 is the worst case at every band height |
| ring width | **4–14 cells** | sheet 1 — 3 aliases into moiré; at 16 the square variant is a dot on a flat field |
| shape `p` | 4 stops: 1, 2, 4, ∞ | sheet 1 — all four read as distinct shapes at 32px; a continuous slider would not |
| lobes | **0–12** | sheet 2 — 12 still reads; depth must come down with it |
| lobe depth | **0–0.5**, ≤0.25 above 8 lobes | sheet 2 — 12 lobes at 0.5 sprays into rim aliasing; 0.5 is also where `1 + d·cos` would reach 0 at d=1 |
| band height | **6–16 cells**, default 8 | sheet 4 — 3 and 4 are unusable at low band counts |
| period (chevron) | **12–48 cells** | sheet 3 — 6 and 8 are mush at any amplitude above 4 |
| amplitude | **0–0.7 × period** | sheet 3 — see coupling 1; `0` is plain stripes, which is a free fourth look |
| ripple frequency | **1–5** | sheet 5 |
| ripple strength | **0 … 0.8/f²** | sheet 5 — see coupling 2 |
| warp on a radial field | **≤ 0.12** | sheet 6 — 0.2 breaks the pinwheel into disconnected blobs |

Two incidental observations worth keeping:

- **Radial patterns die at the centre, not at the rim.** Sheet 6 at six rays is clean because
  there is no fine structure in the middle; sheet 1 at ring width 3 is muddy for the opposite
  reason. Low angular frequency is not a compromise for a radial pattern at this size, it is the
  good setting.
- **Amplitude 0 on the chevron is plain horizontal stripes**, and the rotation knob makes them
  vertical or diagonal. One generator, three recognisable looks, no extra code — worth shipping
  a named "Stripes" preset for, since a participant will not find it by dragging a slider to
  its end.

---

## Risks

- **Coverage gate.** Web branches sit at **98.45 %** against a **98.40 %** floor. A pile of
  branchy arithmetic with waveform switches, shape stops and clamped ranges will eat that
  headroom immediately. The maths must be pure, DOM-free and tested near-exhaustively — which it
  can be, cheaply, because every generator is a total function of six numbers.
- **`max-lines-per-function` is 50 and counts comments.** `SunburstControls` is already ~90 lines
  with its JSX; four pattern panels cannot live in one component. Budget for a control component
  per pattern plus a shared band/colour editor.
- **SVG payload.** More bands means more key runs means more merged `<path>` elements per avatar,
  and avatars ship inline in SSE payloads and the identities endpoint. Measure a worst case (four
  bands, high ripple, 128×128 sprite) before committing to a band cap.
- **Preset drift.** Four patterns × seven knobs is a lot of ways to make something ugly. Shipping
  each family with a named default that is known to read at 32px — the way `DEFAULT_SUNBURST` does
  — matters more than the knobs do.

---

## Agreed order

Revised against the decisions above: no rename, four self-contained patterns, four interpolated
bands. Each step is independently shippable and green.

1. ~~**The 32px contact-sheet probe.**~~ **DONE** — `apps/web/scripts/probe-backdrop-patterns.mjs`,
   six sheets, and the measured ranges are in "What the pixel budget allows" above. It changed
   two knobs from what the formulae suggested (amplitude becomes a fraction of period; the warp
   maximum becomes a function of frequency) and raised the default band count from 2 to 3.
2. ~~**Kind-tagged wire format**~~ **DONE** — ADR-205, `c2ecdb8`. The legacy-spiral rule is
   "if the first trailing part is a six-digit hex colour it is a pre-tag spiral", which is
   decidable with no lookahead. Proved by rendering all **242** legacy codes byte-identically —
   and the loop caught that "220" had been wrong in three documents, including this one.
3. ~~**Bands.**~~ **DONE** — ADR-206, `4abab69`. `splitBackdropCells` takes a list of keys and
   `bandOfCell` returns an index; the spiral is now simply the two-band case. Interpolation is
   in **linear light**, because halfway between dark blue and bright gold down the sRGB numbers
   is a muddy olive. The participant still picks two colours and a count.
4. ~~**🌀 Concentric radiating shapes**~~ **DONE** — ADR-207, `8bcffd3`. A Minkowski p-norm
   picks the silhouette and a rose term cuts the petals. Shape ships as **four discrete stops**
   rather than a slider, because the exponents between them do not read at 32px. Its wire group
   is **fixed arity**: the spiral's optional band count is a concession to codes that predate
   bands, and a pattern with no history has nothing to be lenient about.

   It was first on the grounds that it would carry the cost of the shared control scaffolding,
   and that turned out to be right for an unexpected reason — the scaffolding was almost all
   *already there*. A second pattern cost one swatch and one CSS rule, which is the evidence
   that ADR-204 put the spiral in the right place.
5. ~~**⚡ Chevron & bargello**~~ **DONE** — ADR-208, this commit. The first **linear** pattern:
   straight bands displaced sideways by a wave, where the waveform is the only difference
   between the two looks — triangle for the chevron's corners, sine for the flame stitch's
   rounded crests. Shipped as one pattern with a waveform knob rather than two patterns
   differing by one line.

   It was billed as "the one that will say whether four interpolated bands were enough", and
   the answer is **yes, for this**. Wikipedia's point that bargello uses many hues of one
   colour is about a tapestry you stand in front of; at 32px, four bands between two endpoints
   already give the flame its shading, and the fifth would be below the quantisation the grid
   can show. That was the open question behind the whole bands decision and it is now closed.

   Amplitude is exposed as a **percentage of the wave width**, never in cells — the probe's
   most important finding about this pattern, and the one thing a participant could never
   discover by fiddling, since a cell-valued setting that looks fine at one period is mush at
   another. Amplitude zero is **plain stripes**, named as such on screen; it is not a guarded
   special case but what the same expression does when the wave is multiplied by nothing.
6. ~~**🌀 Psychedelic swirls & groovy waves**~~ **DONE** — ADR-209, this commit. A domain warp:
   the sample point is displaced by a pair of sine terms before anything is evaluated, each
   axis reading its displacement off the other coordinate. Going last paid off exactly as
   hoped — the ripple ceiling `w·f² ≤ 0.8` was already measured, the fraction-of-maximum
   control was already a proven idea from ADR-208, and the only genuinely new problem was the
   angular seam.

   **The seam is the thing that would have shipped broken.** The angle jumps by 2π across the
   negative x-axis, so a running total combining radius and angle jumps by the arm count, and
   `floor` of it shows a hard radial line through the face unless that jump is a whole number
   of colour cycles. Making the arm count `swirl × bands` closes the cycle at every setting.
   The spiral never had this problem because `rays` is an integer and it takes the phase
   *within* a sector; this is the same observation applied to a pattern where the radial and
   angular terms share one total.

**Scoreboard, 2026-10-07: all six steps done.** All four patterns — Spiral, Concentric, Chevron
& Bargello, Psychedelic — are on screen, each with its own knobs, sharing one two-colour band
control. The brief is covered.

Steps 1–3 put no new pattern on screen and are still most of the cost. That is the honest shape
of this work and is worth saying out loud before it starts: **the patterns are the cheap part.**

Step 2 is the one with a deadline of sorts. The wire format is fine today and breaks the moment
a *second* pattern exists; doing it while there is still only one means no migration, and no
ambiguity to resolve later under pressure.
