# The avatars

**Status:** shipped (ADR-021, ADR-026) · **Art:** `apps/web/scripts/avatar-art-source.mjs`
+ `avatar-canvas.mjs` · **Output:** `apps/web/src/lib/avatarArt.ts` · **Contact sheet:**
[`../screenshot/avatar-sheet.png`](../screenshot/avatar-sheet.png)

A participant *is* their avatar on every Gameboy surface (fds.md §5.5, DC-006): the trainer
card, the leaderboard, the team roster, the match feed. It has to say who you are at 32 px
in a list and reward you at 128 px on your own card.

## 1. The frame

Art space is **64×64** and the framing is a mugshot — head and shoulders, not a doll on a
stage:

| Anchor | Row |
| --- | --- |
| Crown of the hair | 4 |
| Top of the skull | 9–10 |
| Brows | 22–25 |
| Eyes | 29–39 (sclera 31–37) |
| Nose | 39–40 |
| Mouth | 41–45 |
| Chin | 48–49 |
| Neck | to 56 |
| Shoulders | 51–63, filling the bottom edge |

The head is 62 % of the frame wide and 72 % tall. The previous art was the same head at
half the resolution and a third smaller in frame, which is why it read as a distant doll.

## 2. The style

Anime/manga, and specifically the things that make it read at this size:

- **An ink contour** around the head, the hair and the shoulders (`KeyCanvas.outline`).
  Without it a pale character dissolves into a pale backdrop.
- **Oversized eyes**, about a third of the face: sclera, a two-tone iris (accent over a
  lighter lower half), a small pupil, and two catchlights. The lash line is *tapered* —
  one cell at the inner corner, three at the outer — and flicks up and away at the outer
  corner. Getting that flick backwards mirrors into a dark bridge between the eyes and the
  character is suddenly wearing spectacles; it is the single easiest mistake here.
- **Blush** on the cheeks, dithered at the edges.
- **A hair shine band** across the upper left of the crown.
- **One expression per archetype**, not one mouth reused five times.
- **The iris takes the archetype's accent colour**, so a Sprinter looks out with blue eyes
  and a Hype with rose ones, whatever else the participant picked.

## 3. The five archetypes

Each is a Pokémon-trainer-class read: silhouette first, then the face.

| Variant | Archetype | Headwear | Garment | Expression | Eyes |
| --- | --- | --- | --- | --- | --- |
| 1 | Skipper | Captain's cap with a badge | Sailor collar, two stripes | Confident smirk | Gold |
| 2 | Sprinter | Knotted headband, tails flying | Track jacket, zip and stripe | Mid-shout, one fang | Blue |
| 3 | Strategist | Round glasses | Hoodie, drawstrings | Small, unbothered smile | Ice |
| 4 | Hype | Star clip and a ribbon bow | Cheer top, bold chevron | Full open grin | Rose |
| 5 | Sundowner | Shades pushed up, hibiscus | Open shirt, flower lei | Half a smile | Jade |

Each is drawn twice, once per build. The two builds differ in skull taper, jaw, brow
weight, lash weight, lip, neck and shoulder slope — not only in hair length.

## 4. What a participant chooses

| Axis | Choices | Why |
| --- | --- | --- |
| Skin tone | 8 | An index into hand-drawn art |
| Hair style | 5 per build | Ditto — each is a drawn layer |
| Hair colour | 10 | Ditto |
| Facial hair | 3 (masculine) | Ditto — and clipped to the jaw it sits on (ADR-029) |
| **Build** | 5 — Slight, Lean, Regular, Sturdy, Broad | Five necks, five shoulder lines **and five jaws** (ADR-029/030) |
| **Shirt** | **any colour** | Not anatomy: 10 named quick picks **plus the colour wheel** (ADR-028) |
| **Backdrop** | **any colour** | Ditto |

All of it travels as one dash-joined code,
`skin-style-hair-facial-build-outfit-backdrop`, where the last two groups are `rrggbb`:
`3-1-2-1-3-ff7ac3-0b0f1a`. Codes from either older format still read — a colour written
as an index is looked up in the swatch list it used to mean, and a code with no build
gets the middle one — and each is rewritten to the canonical form the first time it is
saved.

The archetype is the **starting preset**; any axis the participant has touched survives a
change of character (ADR-023). The shade of a free colour is derived with `darken()`, and
the ink contour (§2) is what keeps a figure readable against a backdrop of any lightness.

### Build, and why it is three layers

A portrait shows the top of a person, so build reads through the **neck**, the **slope of
the shoulders** and the **jaw** — not a waistline nobody can see. Only the head rows
*below* row 42 change with the build (0.80× for Slight, 1.22× for Broad): that is under
every hairstyle's side band, so hair keeps framing every build with no gap of backdrop
between hair and cheek, and the ten hair layers stay build-independent. The torso is therefore its own layer
per build (`torso.{gender}.{build}`), and the garment is another
(`outfit.{gender}.{persona}`) drawn over whatever shoulders are underneath. Five builds
and five archetypes cost ten layers instead of twenty-five, and a new archetype does not
have to be drawn five times. Everything above row 56 of a garment stays inside the
narrowest build's silhouette, so a Slight character is never wearing a collar that floats
off their shoulders.

## 5. How the art is written

Layers are **drawn as shapes**, not typed as ASCII (ADR-026). `avatar-canvas.mjs` is a grid
of role keys with `span`, `rows`, `rect`, `ellipse`, `disc`, `curve`, `triangle`,
`mirrorLeft`, `swap`, `stamp` and `outline`. A face is drawn on the left half and mirrored,
so it is symmetric by construction and half the work.

Hair is cut from the head it sits on: a slightly larger, slightly taller skull clipped to
the hairline, plus a band down each side of the face that stops one cell **outside** the
cheek. Drawing a cap and punching a hole for the face — the obvious way — buries the cheeks
and leaves a character peering out of a hood.

```bash
npm run art --workspace @psd/web          # redraw src/lib/avatarArt.ts (+ ART_VERSION)
npm run art:review --workspace @psd/web   # contact sheet → docs/screenshot/avatar-sheet.png
node scripts/render-avatar-sheet.mjs --only=female:4 --hair=4 --zoom=10 --out=/tmp/one.png
```

The generator refuses to emit art that breaks an anchor, and it checks **all 100
combinations**, not a sample: the frame must be opaque, the shoulders must reach the bottom
edge, the eye band must still contain an iris and a sclera, and the row under the eyes must
still be skin. The last two are how a hairstyle that ate the face and a prop that covered
the eyes were caught.

## 6. Size

An avatar is composed at render time into one SVG data URL, memoised per appearance:

1. Layers ship **run-length encoded** (`.22s20.22`) — 34 kB instead of 170 kB of source.
2. Cells merge into the biggest rectangle of one colour (greedy horizontal run, extended
   downwards), and the rectangles of one colour merge into **one `<path>`**.

That is 16 paths and **8.7 kB** per face, against 81 kB if every cell were its own `<rect>`.
Thirty faces in a leaderboard cost about what one used to.

## 7. Wearing your own face (ADR-031)

A participant can put a photograph in the studio instead of choosing a character. The
photo is converted **on the device** and thrown away; what is saved is a sprite.

![photo sprites](../screenshot/photo-sprites.png)

| Step | What happens | Why it is there |
| --- | --- | --- |
| Decode | `createImageBitmap`, drawn into a canvas at 320 px | The browser already has every codec the phone does |
| Find the head | `FaceDetector` if the browser has it, else the segmentation mask, else the widest band of skin in the upper half (ADR-034) | Each is better than the next; the skin estimate is a guess and goes last |
| Crop | Head to 72 % of the height, eyes at 52 % | The same framing as the drawn avatars, so the two mix in one list |
| Resample | Box average per cell, pulled 30 % toward the **darkest** sample | A plain average erases eyes, nostrils and lips at 64×64 |
| Enhance | Mild contrast and saturation, a light unsharp mask | Averaging flattens both |
| Quantise | Median cut to 14 colours, the face counted twice | A portrait is mostly hair and shoulders; left alone the palette spends itself there |
| Despeckle | A cell matching none of its neighbours takes the commonest one | Quantisation freckles a face |
| Background | **The model's mask when there is one** (ADR-033); otherwise seeded at the frame, grown step by step, gated on hue (ADR-032) | A wall can be cut out by colour; a café cannot |
| Outline | Ink where the backdrop meets the subject | The same contour the drawn avatars have |

The result is `64:<palette>:<runs>` — an indexed 64×64 grid, run-length encoded, about
2.5 kB. It renders through the same rectangle merger as everything else, and a code that
will not parse falls back to the drawn character.

Six photographs are committed to test it: two from a studio (grey, sharp) and four from
an induction booth (teal, unevenly lit, soft). The booth ones are the useful ones — every
naive version of the background rule passed the studio pair and failed these.

### Two answers, in order (ADR-033)

The colour cut-out runs first — instant, no download — so the participant sees themselves
straight away. Then the same pixels go through **MODNET** (Transformers.js over ONNX
Runtime Web, WebGPU where available), and the sprite is replaced if a mask comes back.
The model is fetched from a CDN on first use and cached by the browser; if any of that
fails, the colour cut-out stands, and the hint says the background was removed as best it could. It does not
yet name which step fell back (plan F15). The photograph still never leaves the device.

| Photo | What cuts it out |
| --- | --- |
| Studio or booth wall | Colour rules, exactly, in milliseconds |
| Selfie in a café, a beach, a crowd | The model — nothing about colour can separate those |
| Any of the above with no network, an old browser, or a locked-down CSP | Colour rules, and the app says so |
| A busy background with no model | **Nothing** — the frame is pixelated as it is (ADR-034) |

```bash
npm run photo:review --workspace @psd/web            # the colour path, over real photos
npx tsx apps/web/scripts/photo-sprite-review.ts path/to/photo.png
```

### What happens to the sprite (ADR-031/034)

| | |
| --- | --- |
| **Stored** | `participant.avatar_photo`, a text column, RLE-encoded indexed 128×128 (ADR-037; 64×64 before, still valid): ~10–20 kB. No blobs, no object store, no image server. |
| **Validated** | `parseAvatarSprite` at both ends, and a CHECK constraint on the column. |
| **Addressed** | By a hash of itself (ADR-035): rows carry `avatarPhotoId`, sixteen characters, and the body is fetched from `GET /api/avatars?ids=…` — one request for a whole screen. |
| **Cached** | In `localStorage` under `psd.sprites.v1`, 150 faces, oldest evicted first. A sprite is immutable, so a device fetches each face **once, ever**. |
| **Compressed** | The API gzips (ADR-034). |
| **Rendered** | Composed into one SVG data URL by the same rectangle merger as the drawn avatars, memoised per appearance for the session. |

Measured on the demo event, a board showing ten photo avatars:

| | Payload per poll |
| --- | --- |
| Sprites inline, no compression | 41.8 kB |
| Sprites inline, gzipped | 2.3 kB |
| **Ids + gzip (now)** | **902 B**, and the ~1 kB of sprites behind it is fetched once per device |

### Choosing the square by hand (ADR-036)

If the browser has no `FaceDetector` and the model did not run, the crop is a guess from
skin colour — so the participant is shown the photo and drags a square over their own
head. It is always square (the sprite is), never leaves the picture, and never shrinks
below a fifth of it. The button is there even when detection worked, for the times it
worked badly.

### The studio while a photo is worn

Hair, build, beard, skin, shirt and backdrop are pixels of a photograph, not layers —
so those controls are not shown. What remains is the photo itself, "Replace my photo"
(which opens the photo's dialog, ADR-229, and keeps the saved photo until Done), and
"Remove my photo" (which holds the photo until the save, ADR-227). The characters stay on
show, and choosing one does not take the photo off.
