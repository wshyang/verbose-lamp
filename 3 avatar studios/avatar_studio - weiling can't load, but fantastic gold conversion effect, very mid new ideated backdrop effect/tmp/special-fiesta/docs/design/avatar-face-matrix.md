# Avatar Face Matrix — portraits, then a character studio

**Status:** Superseded in part and extended by **ADR-021**. §1–§6 below record the portrait
assessment that produced the first ten faces (ADR-020); **§7 is the system that actually
ships**: the same five personas, but as *presets* over a layered character studio where the
participant chooses build, hair style, skin tone, hair colour, shirt colour and backdrop.

Shipped art: [`../screenshot/avatar-sheet.png`](../screenshot/avatar-sheet.png) ·
the two builds side by side: [`../screenshot/avatar-builds.png`](../screenshot/avatar-builds.png) ·
the personalisation axes: [`../screenshot/avatar-studio.png`](../screenshot/avatar-studio.png).

**Problem.** The ten shipped avatars are two body silhouettes — one masculine, one feminine —
recoloured five times each (`apps/web/scripts/generate-avatar-sprites.mjs`). Same pose, same
face, same 2-pixel eyes; only the palette moves. At the sizes they actually render (32 px in a
leaderboard row, 64 px on the QR badge) they are indistinguishable, and a third of every sprite
is torso nobody can read.

---

## 1. Assessment of the proposed matrix

### Adopt

| Proposal | Why it holds here |
| --- | --- |
| **Portrait-only (mugshot)** | Correct. A half-body sprite spends rows 11–15 on a shirt; a head-and-shoulders portrait spends them on a jaw and a collar. Same budget, four times the face. |
| **Facial geometry as pillar 1** | Correct, and it is the pillar that survives scaling: skull width and jaw taper are still legible at 32 px when everything finer has collapsed. |
| **The Eye-Line Rule** | Essential, not optional. Avatars appear in vertical lists (leaderboard, team roster); a one-pixel difference in eye height reads as jitter down the column. Fixed here at **row 15 of 32**. |
| **The Neck Base Standard** | Adopted as built: the shoulders **fill the bottom edge** — no backdrop is visible on row 31 — and the neck is 6 px wide for every persona, so no portrait floats. |
| **Functional colour coding** | Adopt the idea, change the variable — see §3. |

### Cut

| Proposal | Why it fails here |
| --- | --- |
| **The five archetypes** | They are RPG tropes for a fantasy roster: broken noses, facial scars, cauliflower ear, hood shadow, facial piercings, hidden tattoos, glowing irises, runic tattoos. This avatar stands for a **colleague at a Public Service Division family day**. "The Rogue — cunning, deceptive" and "The Paragon — handsome" versus "The Tactician — geek, dark under-eye circles" also rank people by looks and personality, which is not a thing to ship into a staff event. Replaced in §2. |
| **Lighting as a pillar** | Three-point studio lighting, chiaroscuro, rim light, under-lighting and catchlights need a tonal ramp. The medium is a flat palette at 32×32: "lighting" collapses to **one shade tone and one highlight pixel**. Keep a single fixed key light (upper-left) for the whole set — mixed light directions across a grid read as mistakes, not mood. |
| **Per-archetype camera angles** | "Low angle for the Juggernaut, high angle for the Tactician" **contradicts the Eye-Line Rule in the same document**: you cannot hold every pair of eyes on a shared grid line while moving the camera. Everything is front-on at eye level; the archetype is carried by geometry and props. |
| **Micro-expressions as a primary signal** | At 32 px a raised eyebrow is one pixel. The 1× samples in the preview show what actually identifies a portrait at that size: **silhouette and headwear first, backdrop colour second, geometry third, expression last.** Expression is worth drawing — it carries at 64 px and 96 px — but it cannot be load-bearing. |

### Missing from the proposal

- **A resolution contract.** Portraits are 32×32 and may only be displayed at 32 / 64 / 96 px,
  so every pixel lands on a whole device pixel. (Today's profile size of 72 px becomes 96.)
- **Gender as a layer, not a list.** The matrix as written is implicitly masculine — stubble,
  beard, broken nose, cauliflower ear. Here, **both genders get the same five personas**;
  presentation is carried by hair mass, brow weight, lash and lip emphasis, and jaw width. No
  persona is gendered, and the sign-up picker is symmetrical: 5 × 2 = 10 sprites, which is
  exactly the existing `AVATAR_VARIANT_COUNT = 5`.
- **Where avatars are not allowed.** Facilitator and superadmin consoles stay text-only
  (fds.md §5.5 / DC-006, enforced by `npm run standards`), and an avatar is never the only
  carrier of identity — the nickname is always next to it.

---

## 2. The revised matrix

Five personas, all flattering, all readable as "someone at a beach sports day". Persona is what
the participant picks; `avatarVariant` 1–5 maps to it in this order.

| # | Persona | Geometry | Expression | Focal props | Backdrop |
| --- | --- | --- | --- | --- | --- |
| 1 | **The Skipper** — captain energy | Wide skull, square jaw held to the chin | Confident open grin, level brows | Cap worn forward with a crest, collared shirt | Sea blue |
| 2 | **The Sprinter** — pure go | Narrow skull, short taper, high cheekbones | Set mouth, hard-angled brows, narrowed eyes | Headband with a trailing knot, windswept hair | Sunset crimson |
| 3 | **The Strategist** — reads the game | Long skull, slim jaw, high forehead | Asymmetric smirk, one brow raised | Sports glasses with a catchlight, side-parted hair | Indigo |
| 4 | **The Hype** — loudest on the sand | Round skull, soft jaw | Open-mouth cheer, wide eyes | Cluster-coloured face paint stripes under both eyes | Gold |
| 5 | **The Sundowner** — seen every Active Day | Oval skull, lined cheeks | Serene half-smile, relaxed brows | Bucket hat with a band, sunglasses catching the sun | Sea green |

Presentation layer (applied to any persona):

| | Masculine | Feminine |
| --- | --- | --- |
| Hair | Crop or swept fringe, sideburn pixel | Shoulder-length, ponytail or bun, framing both cheeks |
| Brow | 1 px heavier, closer to the eye | 1 px higher, thinner |
| Eye | No lash pixel | Lash pixel at the outer corner |
| Jaw | Full persona width | One pixel narrower from row 21 |
| Lip | Line only | Line plus a 1 px lower-lip tone |

Everything else — eye row, chin row, neck width, shoulder line, key light — is identical by
construction, which is what makes the grid look like one set.

## 3. Functional colour: persona or cluster?

The proposal colours the backdrop by archetype. We have no stats to signal, but we do have 16
clusters and a leaderboard organised by them, so there are two options:

- **A — persona colour (baked into the sprite).** Ten static files, nothing to plumb, the
  picker is a rainbow of five. What the preview shows.
- **B — cluster colour (applied at render time).** Sprites ship with a transparent backdrop and
  the `Avatar` component fills it from the participant's cluster. A team roster or a leaderboard
  then colour-codes itself, which is real information rather than decoration. Costs: a checked
  16-hue palette, a fallback for surfaces that do not carry the cluster code, and contrast
  testing against the ink outline.

Recommendation was **B**; **A was chosen** — ten static files, nothing to plumb, and a picker
that reads as five distinct characters. B stays available later: the sprites would need their
backdrop keys made transparent and the `Avatar` component would fill from the cluster code.

## 4. Production rules (what the generator enforces)

1. Eyes on row 15. Chin on row 24. Shoulders fill the bottom edge — asserted by the
   generator, which refuses to write a sprite that breaks any of these.
2. One key light, upper-left: one shade tone on the right of every form, one white catchlight
   in the left eye. No other light sources.
3. A prop colour must contrast its backdrop — never red on red.
4. Palette per sprite ≤ 12 colours, all from the existing Sentosa palette plus PSD navy.
5. Art is 32×32; display sizes are 32, 64 and 96 only.
6. Sprites stay generated from a committed script and committed as SVG (ADR-008). Edit the
   grids, never the SVGs.

## 5. Migration

`avatarVariant` stays `1..5` and no data changes, so nobody's record breaks — but everyone who
has already picked a number gets a new face for it. That is free before the event and awkward
after it, which makes this a pre-event change or not one at all.

## 6. Answers to the questions the proposal ends with

- **Art style:** already fixed by fds.md §5.5 — flat-palette pixel art in the Gameboy/Pokémon
  register, the same ink and Sentosa palette as the motif sprites. Not realistic 3D, not anime,
  not gritty ink.
- **Static or animated:** static 2D SVG (ADR-008). A two-frame blink is possible in CSS, but it
  doubles the art for no functional gain and is not proposed.

---

## 7. What ships: the character studio (ADR-021)

Two complaints closed the portrait-only design: **the two builds were one doll in two wigs**,
and **nothing about a face belonged to the person wearing it**. Both are structural, so the
art stopped being ten files and became layers with roles.

### 7.1 One face, eight layers

| Order | Layer | Varies by | Carries |
| --- | --- | --- | --- |
| 1 | backdrop | chosen colour | the disc and its vignette — the only thing legible at 32 px |
| 2 | body | build | shoulder width and slope, neckline, sleeve |
| 3 | head | build | skull, jaw, ears, neck, the key-light shade |
| 4 | face | build | brows, eyes, lashes, nose, lips |
| 5 | hair | build × 5 styles | the largest silhouette signal |
| 6 | beard | 3 options, masculine only | clean, stubble, full |
| 7 | mouth | build × persona | the expression, drawn narrower on the feminine jaw |
| 8 | prop | persona | cap, headband, specs, war paint, bucket hat + shades |

A layer stores **role keys**, never colours: `s/d` skin and its shade, `h/g` hair, `t/u`
shirt, `B/b` backdrop, `c/e/A` the persona's prop, plus ink, eye white, iris and lip. The
palette is resolved at render time from the wearer's choices, which is why 1.2 million
appearances cost 34 layers of art.

### 7.2 What makes the two builds different

Not hair. Hair is the loudest signal but the least structural, so the difference is drawn
into the geometry — and the two share a cranium width only so that one set of headwear fits
both heads:

| | Masculine | Feminine |
| --- | --- | --- |
| Face | 14 px wide, straight sides | 12 px, tapering from the cheekbone |
| Jaw | square, full width to row 22, chin 8 px | tapered, chin 4 px at row 22 |
| Brow | 2 rows, heavy, low | 1 row, arched, higher |
| Eyes | one row, deep-set under a lid line | two rows, lash line above, outer flick |
| Mouth | 6 px wide | 4 px wide, coloured lips |
| Neck | 8 px | 6 px |
| Shoulders | reach the frame edge by row 28 | narrower, sloped, reach it by row 30 |
| Neckline | crew collar with a placket | scoop, with a cap sleeve |
| Facial hair | clean / stubble / beard | — |

### 7.3 The axes a participant controls

| Axis | Options | Where it lives |
| --- | --- | --- |
| Character (persona) | 5 — Skipper, Sprinter, Strategist, Hype, Sundowner | `avatar_variant`, unchanged by ADR-021 |
| Hair style | 5 per build | `avatar_look` field 2 |
| Facial hair | 3 (masculine) | `avatar_look` field 4 |
| Skin tone | 8 | `avatar_look` field 1 |
| Hair colour | 10 | `avatar_look` field 3 |
| Shirt colour | 10 | `avatar_look` field 5 |
| Backdrop | 10 | `avatar_look` field 6 |

`avatar_look` is one dash-joined code — `skin-style-hair-facial-outfit-backdrop`, e.g.
`6-4-10-1-3-8` — so one column and one wire field carry the whole appearance, and adding an
axis later is a migration of one column rather than six.

A persona is a **preset, not a cage**: picking one applies its kit (shirt and backdrop) and
its prop, and leaves the wearer's own face, skin and hair alone.

### 7.4 Rules the generator still enforces

Unchanged from §4, now checked across **every** combination rather than on ten files: crown
at row 5, eyes on rows 13–14, shoulders filling the bottom edge, no transparent pixel
surviving the stack, and no layer inventing a key the palette cannot resolve.
