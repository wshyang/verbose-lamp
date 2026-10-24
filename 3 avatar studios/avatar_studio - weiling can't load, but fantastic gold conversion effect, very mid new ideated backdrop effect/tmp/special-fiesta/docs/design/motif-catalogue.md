# Motif catalogue

The register of every decorative pixel sprite in the participant theme: the art standard they are
drawn to, and the status of each one. Sprites live in `apps/web/scripts/motifs/grids/` (shared) and `apps/web/scripts/themes/<id>/motifs.mjs` (venue-only; ADR-294, ADR-297); the
pipeline is ADR-014, the content stamp ADR-067, the retired sprites ADR-068.

Decoration is participant-only (`fds.md` §5.5) and always `aria-hidden` with an empty `alt` — a
heading, tab or row must read correctly with images off. Nothing in this catalogue may carry
meaning that the text does not already carry.

---

## 1. The art standard

Gameboy/GBA item-sprite craft: **four tones per material plus that material's own hue-shifted
outline**, one key light from the upper left, a single specular accent.

The shipped corpus predates this. Today `crab`, `starfish`, `shell` and `flag` are a single flat
fill inside a 1-px global-ink ring, and eleven of the sixteen sprites use four distinct colours or
fewer. Bringing them up to the standard is the first batch of work, before any new art, because
shaded icons standing beside flat ones make the flat ones look broken.

### Two failures that became rules

Both found by rendering candidates and looking at them, not by reasoning:

- A shaded coin **lost its engraved star**. The engraving used the ramp step adjacent to its
  surroundings, and the shade tone swallowed it. → *Engraved detail jumps two ramp steps, or uses
  the material's own outline colour.*
- A shaded crab **grew a pink stripe**. The highlight was lightened toward white, losing
  saturation, so it read as a band laid on top rather than a lit surface. → *A highlight only gains
  value; it never loses saturation.*

### Rules enforced by `assertGrid`

1. **No dithering, ever.** A checkerboard between two tones is the one thing that genuinely
   collapses under edge-width modulation. `ditherBand` is a tool for the 480-px panorama.
2. **No isolated single pixel of tone 1 or tone 4** — minimum a 3-px run or a 2×2 block. One
   specular dot per sprite is the only exception.
3. **Tone 1 never orthogonally adjacent to tone 4.** A one-cell jump from highlight to darkest
   reads as a puncture; transit through 2 or 3.
4. **Tone 4 area ≤ 20 %** of its material.
5. **Never ship a sprite below 1× of its grid.** Enforced at the call sites by
   `checkMotifScale` in `scripts/check-standards.mjs`, because this is the only rule whose
   violation silently destroys four-tone art.
6. **A feature needing interior fill is ≥ 3 px on both axes** — below that, derived outlines
   consume it entirely, which is correct behaviour for what is really a line.

### Rules reviewed on the contact sheet

7. One key light, upper left, every sprite — matching `lib/avatars.ts`, or motifs will not sit with
   the avatars.
8. Area budget per material ≈ base 55 %, shadow 25 %, highlight 10 %, core shadow 10 %.
9. Tone 1 on upper-left rims; tone 4 in lower-right contact shadow and in concavities. Never tone 1
   on a lower edge.
10. **ΔL ≥ 10–12 between consecutive tones**, or four tones read as two.
11. The tone-1↔tone-2 step is *smaller* than the material↔outline step, or the highlight reads as a
    separate object stuck to the sprite.

### On scale — what is and is not true

These are SVGs with `shape-rendering="crispEdges"`, not rasters. At any scale ≥ 1× **no source
pixel is ever dropped**; the artifact is edge-width modulation. At the real device DPR of 2–3 every
shipped size gives ≥ 2.25 device pixels per source pixel, so four tones survive comfortably. Tone 4
turns to noise because of *where it is put*, not because of the scale — which is why rules 2–4
exist and why "shimmer at fractional scale" is not a reason to draw flatter art.

The one genuine hazard is shipping *below* 1×, where pixels are dropped outright. Hence rule 5.

---

## 2. Cell format

Cells are two characters: `<ramp letter><tone digit>`. `r1`…`r4` are red tones light to dark, `r0`
is an explicit red outline, `..` is transparent. Sixteen ramps × four tones + one outline each is
about eighty keys — single-character cells cap at sixty-two with no headroom.

The capacity limit is the weakest reason for the format. The real ones:

- **Tone becomes a comparable field.** "Is this lighter than its neighbour?" is answered by reading
  digits in place rather than recalling a sixty-entry table. The old case-pairing convention
  (`s`/`S`, `g`/`G`) had already broken down at twenty-two keys: `r`, `o`, `n`, `v`, `c` and `t` had
  no shade at all, and `d` was sea-deep while `D` was PSD navy.
- **It makes rules 2–4 checkable.** They are impossible if the cell does not carry tone.
- **The source reads closer to true aspect.** A monospace cell is roughly 0.48 aspect, so one
  character per pixel displays the art 2:1 vertically stretched — circles look like ellipses. Two
  characters per cell lands within 4 % of square.

Outlines are **derived, not authored**: any painted cell with a 4-neighbour that is transparent or
a different material becomes its own material's outline colour. Hand-tracing a hue-shifted contour
across a hundred sprites is where a corpus goes incoherent, and derivation preserves silhouettes
exactly — which matters because eleven of the current grids paint the frame edge. A declared
`tiles` axis is exempt on that axis, or `wave` would grow a dark seam every 20 px.

---

## 3. Register

**Status key:** `flat` = shipped, pre-standard · `toned` = at the standard · `planned` = designed,
not drawn · `wired` = drawn *and* placed on a surface.

### 3.1 Shipped (16) — all `flat`, awaiting the re-tone

| Sprite | Grid | Where it appears |
|---|---|---|
| `psd` | 16×16 | Banner title plate, 40 px — "the one sprite that must stay legible" |
| `badge` | 16×16 | Nav "QR", 26 px; Teams page, 20 px |
| `coin` | 16×16 | Profile points, 20 px; `.gb-points::before`, 16 px |
| `crab` | 16×16 | Browse-teams heading, 20 px; QR sand strip, 22 px |
| `face` | 16×16 | Nav "Me", 26 px; team roster and leaderboard, 20 px |
| `flag` | 16×16 | Nav "Teams", 26 px; Teams and Profile headings, 20 px |
| `kueh` | 16×16 | **No production call site** — referenced only by `PixelMotif.test.tsx` |
| `merlion` | 16×16 | Banner, 32 px |
| `sandcastle` | 16×16 | Landing, 16 px; Teams, 20 px |
| `shell` | 16×16 | Nav "Social", 26 px; My Team, 20 px; QR strip, 22 px; empty state, 40 px |
| `stamp` | 16×16 | `.gb-list--stamped li::before`, 22 px |
| `starfish` | 16×16 | QR strip, 22 px; loading spinner, 18 px |
| `sun` | 16×16 | Landing heading, 20 px |
| `trophy` | 16×16 | Nav "Board", 26 px; leaderboard and My Team, 20 px |
| `volleyball` | 16×16 | Nav "Feed", 26 px; My Team and team detail, 20 px |
| `wave` | 16×8 | Repeating strip under the banner (20×10) and the nav (24×12) |

Notes carried forward: `kueh` is pinned by a test but unused in the app — it wants either a surface
or retirement. `wave`'s two tile sizes are 1.25× and 1.5× of its grid, which `npm run motifs`
reports as a warning; moving it to a 20×10 grid makes the first exact.

### 3.2 Batch 1 — eleven drawn, one deferred

All eleven are `toned`: four tones per material, two-character cells, reviewed on the sheet against
grey, sand and sea, and at their shipped sizes.

| Sprite | Status | Notes from the render loop |
|---|---|---|
| `chat` | `toned` | Tail was two detached blobs on the first pass; now a connected wedge |
| `bellalert` | `toned` | Reads at 20 px; the alert dot is crimson against gold, two ramps apart |
| `crown` | `toned` | First pass had 2-wide dark caps that read as notches; spikes now gold-topped |
| `cone` | `toned` | Cleanest of the batch — read correctly on the first pass at every size |
| `medal` | `toned` | Crossed ribbon plus crimson centre keeps it distinct from `trophy`/`coin` |
| `net` | `toned` | White mesh vanished on sand; mesh moved to `k1`, which holds on all three |
| `raincloud` | `toned` | Reads first pass |
| `waterbottle` | `toned` | Solid blue disappeared on sea — redrawn as translucent plastic over water, which is both legible and more accurate |
| `whistle` | `toned` | **Three passes.** Read as a fish, then a handbag once it had a lanyard, then correctly as mouthpiece + chamber + air hole with the cord dropped entirely |
| `emptybox` | `toned` | Weakest of the batch: reads as a crate, but the open lid flaps read a little like towers. Worth another pass |
| `bunting` | `toned`, `wired` | 24×6 tile on `.gb-banner::before` at 48×12 — exactly 2×, unlike `wave` |

**`otter` is deferred, and not for lack of pixels.** Two passes produced a bat and then a bear. A
head-only mammal cannot be made species-specific at this size; it needs a pose or a prop — floating
on its back, or holding a shell. That is a design decision, so it moves to the next batch rather
than shipping as a generic animal.

All eleven are in `MOTIF_NAMES` and therefore addressable from JSX. Only `bunting` is wired to a
surface so far; the other ten await placement on the headings named in §3.1's gaps.

### 3.2b Drawn since — UI state and tournament (`toned`)

**UI-state glyphs (14):** `arrowdown`, `arrowup`, `camera`, `door`, `exclaim`, `heart`, `lock`,
`magnifier`, `pencil`, `plustile`, `question`, `sync`, `undo`, `xstamp`. All fourteen read on the
first pass — geometric shapes are the easiest group in the whole catalogue.

**Captain's ball and tournament (10):** `armband`, `bracket`, `captainhat`, `court`, `hourglass`,
`klaxon`, `laurel`, `podium`, `scoreboard`, `stopwatch`. All ten read on the first pass.

**Active-day games (15):** `otter` (finally — holding a shell; see below), `highfive`, `bib`,
`takraw`, `chapteh`, `fivestones`, `sneaker`, `dumbbell`, `shuttlecock`, `pingpong`, `frisbee`,
`bullseye`, `baton`, `hoop`, `dragonboat`.

**Beach and sea (12):** `anchor`, `clownfish`, `coconut`, `dolphin`, `gull`, `jellyfish`, `kite`,
`lifering`, `pail`, `parasol`, `slippers`, `turtle`. All twelve read on the first pass.

`otter` took **four** passes and the fix was never pixels: bat, then bear, then a lumpy mask with
horns for ears and slits for eyes. What made it work was small ears low on the sides, round dark
eyes instead of slits, and the shell held clear of the chin by paws so it reads as a held object
rather than as lips. Three skin ramps (`f`, `q`, `h`) were added for `highfive` and anything else
with a hand in it.

**Sentosa place & fauna (13):** `cablecar`, `lighthouse`, `luge`, `zipline`, `peacock`, `macaque`,
`monitor`, `hornbill`, `kingfisher`, `fort`, `signpost`, `map`, `buoy`.

**Royalty (9):** `crown`, `throne`, `sceptre`, `orb`, `tiara`, `cape`, `palace`, `chalice`,
`standard`.

**Emoji (17):** `smile`, `wink`, `laugh`, `sad`, `shock`, `sleepy`, `angry`, `cry`, `loveeyes`,
`thumbsup`, `thumbsdown`, `clap`, `peace`, `okhand`, plus `heart`, `flame`, `twinkle`. Built from
one shared gold face template — a row of faces that each shade differently reads as sloppiness,
not variety.

**Sports at large (6):** `football`, `basketball`, `tennis`, `swim`, `cycle`, `goal`.

**Captain's ball, the game itself (5):** `basket` (what the captain actually holds), `throwball`,
`jump`, `timeout`, `refflag`.

**Activity-day games, the rest (8):** `tugrope`, `sackrace`, `skiprope`, `beanbag`, `paddle`,
`kayak`, `parachutegame`, `waterballoon`.

**Weather (8), rank (7), Gameboy chrome (6), food & drink (12)** — see the register above.

Three more redraws, all organic or figurative, none fixable with pixels alone: `cape` read as a red
dome until the collar was narrowed; `macaque` read as a fox until the ears moved to the sides of the
skull; `jump` read as a figure standing with its arms out until the arms went overhead and the legs
splayed with air under the feet.

**Deepening pass (28):** Sentosa `butterfly`, `hibiscus`, `sealion`, `boardwalk`, `skyline`;
sports `rugby`, `bowling`, `archery`, `golf`; captain's ball `catchhands`, `huddle`, `courtline`;
activity day `finishtape`, `wristband`, `tshirt`, `lanyard`, `firstaid`; royalty `signetring`,
`sash`, `royalseal`, `coronet`; emoji `grin`, `cool`, `thinking`, `tongue`, `sweat`, `party`,
`confetti`.

`huddle` is the sprite the three skin ramps were added for — three heads, three ramps.

Running total: **16 re-toned + 177 new = 193 sprites.** The six commissioned categories are
exhausted: Sentosa, sports, captain's ball, activity day, royalty, emoji.

### 3.5 What the corpus taught, in one line

Geometric objects and props land on the first pass almost every time. Organic and figurative
subjects cost three or four, and the fix is never pixels — it is a pose or a prop decision:
`otter` needed a held shell, `macaque` needed ears on the sides of the skull, `jump` needed its
arms overhead, `cape` needed a narrower collar. Budget accordingly.

### 3.2c The review sheet had to grow paging

At ~140 sprites a single overview render is around 3,000 px tall, and reading it back loses exactly
the detail the sheet exists to show — two defects reached the user rather than being caught here.
`--page=N --per=M` fixes it; `--per=12 --zoom=6` is the setting where flaws are visible again.

### 3.3 The rest of the catalogue (`planned`)

Drawn in themed batches of 8–12, ordered by how much each earns its place.

**Sentosa place & fauna** — `cablecar`, `lighthouse`, `luge`, `zipline`, `peacock`, `macaque`,
`monitor`, `hornbill`, `kingfisher`, `fort`, `signpost`, `map`, `buoy`

**Captain's ball & tournament** — remaining: `bib`, `highfive` (needs skin tones, which no ramp
provides yet)

**Active-day games** — `takraw`, `chapteh`, `fivestones` (the three strongest local hits),
`frisbee`, `tugrope`, `sackrace`, `baton`, `skiprope`, `hoop`, `bullseye`, `beanbag`,
`parachutegame`, `waterballoon`, `dragonboat`, `paddle`, `kayak`, `sneaker`, `dumbbell`,
`shuttlecock`, `pingpong`

**UI-state glyphs** — remaining: `key`, `offline`, plus the Gameboy chrome `dpad`, `cartridge`,
`battery`, `abutton`

**Beach & sea** — `jellyfish`, `seahorse`, `hermitcrab`, `clownfish`, `turtle`, `dolphin`, `gull`,
`coconut`, `driftwood`, `seaweed`, `pail`, `parasol`, `deckchair`, `slippers`, `towel`, `snorkel`,
`surfboard`, `kite`, `anchor`, `bottleletter`, `lifering`, `sunscreen`

**Food & hydration** — `waterjug`, `coconutdrink`, `potong`, `kopi`, `bandung`, `satay`,
`kayatoast`, `watermelon`, `pineappletart`, `durian`, `thermos`, `bento`

**Weather & sky** — `cloud`, `lightning`, `rainbow`, `moon`, `sunsettile`, `twinkle`, `windsock`,
`thermometer`

**Rank & progression** — `ribbon1`, `ribbon2`, `ribbon3`, `pip`, `flame`, `chevrons`, `gem`

**Wide tiles** — `boardwalk`, `railing`, `ropetwist`, `netmesh`, `footprints`, `skyline`, `palmrow`,
`courtline`, `finishtape`, `towelstripe`, `measuretape`

### 3.4 Needs its own decision before drawing

- **The cluster / team crest set** — one shield silhouette with a swappable inner glyph
  (`crest-wave`, `crest-otter`, `crest-takraw`, …), assigned to a team deterministically from its
  id. This gives every team a face with nobody uploading anything, and the shared frame keeps ten
  sprites looking like one family. It needs an addendum first, because a crest derived from an id
  is decoration that *aids recognition* — so the text label must still carry all the meaning
  (`fds.md` §5.5).
- **A 5×7 label font for the contact sheet.** Worth authoring once the sheet passes roughly thirty
  sprites. Not 3×5: the sheet is read back by an agent as well as a human, and 3×5 glyphs are
  legible to neither at review zoom, while 5×7 costs the same thirty-six glyphs to author.

---

## 4. Working on the corpus

```
npm run motifs --workspace @psd/web          # validate + emit + stamp. Writes nothing if it throws.
npm run motifs:review --workspace @psd/web   # contact sheet to docs/screenshot/motif-sheet.png
```

The contact sheet is the quality gate, not the diff. It renders each sprite large on mid-grey, then
on sand and on sea — an outline that reads on sand can vanish on sea — then at each of its real
shipped sizes so tonal decisions can be judged where they actually land. There is no headless
browser in this workspace (ADR-013), so the sheet composites that itself.

`apps/web/src/lib/motifSprites.test.ts` recomputes the content stamp from the committed SVGs, so a
sprite edited without regenerating, or a name added without art, fails the suite.
