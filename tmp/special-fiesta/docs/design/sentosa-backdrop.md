# The Sentosa backdrop

> **Paths moved by ADR-294 (2026-10-16).** The art is unchanged; the files now live under `scripts/themes/sentosa/scene/`, `public/themes/sentosa/` and `src/themes/sentosa/`. See [`venue-themes.md`](venue-themes.md).

**Status:** shipped (ADR-022, ADR-023) · **Art:** `apps/web/scripts/themes/sentosa/scene/pixel-art.mjs`
(panorama) and `pixel-sprites.mjs` (moving parts) · **Output:**
`apps/web/public/themes/sentosa/scene/*.png`, `.../scene-2x/*.png` +
`apps/web/src/themes/sentosa/art/pixelArt.ts` · **Review sheet:**
[`../screenshot/sentosa-backdrop.png`](../screenshot/sentosa-backdrop.png)

Participant surfaces (fds.md §5.5 "Gameboy/Pokémon", DC-006) used to sit on a sky-to-sand
gradient with two palm sprites either side of the phone column. This replaces it with a
pixel-art panorama of Siloso-style Sentosa, drawn from `images/ingest/sentosa_backdrop.jpeg`.

## 1. What was taken from the reference photo

| In the photo | In the art | Where |
| --- | --- | --- |
| CBD towers hazy across the water | Nine towers, window speckle, two masts | x 2–80 |
| VivoCity's white roofline | White shed, wavy roof, gold sign bar | x 80–124 |
| The Merlion on its plinth (`images/ingest/merlion.jpg`) | 52×52 statue in **side profile** — ring of rounded mane lobes, blunt open muzzle, scaled fish body, tail fluke, teal wave base — outlined, on a stone terrace, spouting into the bay | x 88–166 |
| Pavilion on stilts over the water | Terracotta roof, colonnade, six stilts | x 188–222 |
| Resort roofs and the clock tower | Two terracotta wings, colonnade, clock at 10:02 | x 296–407 |
| Universal globe | 30 px sphere, meridians, lettering band, plinth | x 429–459 |
| Red and blue coaster loops | Laddered rails, a vertical loop, three cars cresting | x 352–442 |
| Cable cars on their span | Span running off frame at both edges, lattice pylon, three cabins | x −24–504 |
| Sentosa Express on its viaduct | Beam on piers, white-and-blue train | x 286–480 |
| Rocky breakwater | Boulder line at the waterline | x 0–72 |
| Turquoise bay shading to deep blue | Four dithered bands, swell dashes, float line | y 150–196 |
| Beach volleyball, net and blue lines | Court in perspective, net, posts, rallying ball | x 250–478 |
| Six people playing captain's ball | Four players in PSD kit — two women, two men — reaching for the ball | x 342–430 |
| Sand, footprints | Dithered warm sand, footprints, shells, parasol, towel, sandcastle | y 196–270 |

The players were the hardest thing to draw. A 22×30 figure has about six pixels of face
and four of arm, so the kit does the work: royal shirt with a white panel and a gold trim
line, charcoal shorts, a darker left edge so the body separates from bright sand. Two
builds and four skin-and-hair pairs give four distinguishable people; frame B lifts the
whole body one unit, swings both arms up and leaves the shadow where it is, which reads as
a jump for the ball.

## 2. Layout rules

- **Art space is 480×270** and the scene box keeps that ratio at every width, pinned to the
  bottom of the viewport. On a 1440 px window one art pixel is three device pixels.
- **The middle is dead space.** The participant column is 560 px wide and centred, so
  roughly x 146–334 is behind a panel on a 1440 px screen. Landmarks go either side of it;
  the pier pavilion and the open bay are what sits behind the panels.
- **The bottom 22 rows are dead space too** — the fixed nav bar covers them. Nothing above
  ankle height of the palms lives down there.
- **The panorama layer must be fully opaque.** It is the bottom layer, and a translucent
  pixel blends with the page background into a dirty halo. `scripts/scene/generate-pixel.mjs` asserts it.
- **The sky above the box** is `--scene-sky`, which is exactly the panorama's top row, so
  the seam is invisible on tall windows.

## 3. Layers

| Layer | Size (art px) | Animation | Period |
| --- | --- | --- | --- |
| `panorama` | 480×270 | — | — |
| `clouds` | 480×88, tiled | drift left | 150 s |
| `waves` | 480×46, tiled | drift left | 26 s |
| `foam` | 2 × 480×18 | two-frame surf | 0.85 s |
| `cablecar` | 15×15 | along the span, ×3 staggered | 33 s |
| `express` | 56×13 | left to right off frame | 19 s, 4 s delay |
| `portal` | 66×44 | — (hides the train's start) | — |
| `birds` | 2 × 11×7 | flap + slow crossing | 0.45 s / 58 s |
| `palmLeft`, `palmRight` | 2 × 58×38 | two-frame breeze | 2.4 s |
| `player1`–`player4` | 2 × 22×30 | ready stance ↔ reach | 0.72–1.12 s |
| `ball` | 13×13 | serve (x) × hop (y), nested layers | 3.4 s / 1.7 s |

Positions are percentages of the scene box, generated into `src/themes/sentosa/art/pixelArt.ts`:
`background-position: p%` places a sprite at `p%` of the free space, so the same percentage
lands on the same art pixel at any scale.

**A two-frame sheet gets a box exactly one frame wide** with the sheet at
`background-size: 200% auto`, and `gb-scene-frames` steps `background-position-x` from 0%
to 100% under `steps(2, jump-none)`. Painting a sheet into a full-box layer draws *both*
frames at once — that is how each palm grew a second crown floating beside the trunk.

`prefers-reduced-motion: reduce` stops all of it, and hides the cabins and the train rather
than parking them in mid-air.

## 4. Classic and fine (ADR-023)

The same drawing code emits two variants: `public/themes/sentosa/scene/` at one device pixel per art unit
and `public/themes/sentosa/scene-2x/` at two. Nothing else differs — same 480×270 art space, same
geometry, same animations — so they can be judged against each other in the running app:

| URL | Variant | Set size |
| --- | --- | --- |
| `…/home?backdrop=classic` | chunky, one pixel per art unit (default) | 19 kB |
| `…/home?backdrop=fine` | one more pixel of detail per unit | 44 kB |

The parameter is a switch, not a mode: it is written to `psd.backdrop.v1` (owned by
`src/lib/scene/backdropChoice.ts`, ADR-019) and the choice then follows you around the app
until you switch back.

## 5. Changing the art

1. Edit `apps/web/scripts/themes/sentosa/scene/pixel-art.mjs` (panorama) or `pixel-sprites.mjs` (moving parts);
   `scripts/scene/generate-pixel.mjs` places them and emits the geometry. All three draw through
   `pixel-canvas.mjs`: art units in, integer device pixels out, no blending, no
   antialiasing — a canvas made with `scale = 2` needs no other change.
2. `npm run scene --workspace @psd/web` — redraws the PNGs and rewrites `pixelArt.ts`,
   including the version stamp on every URL.
3. `npm run scene:review --workspace @psd/web` — rebuilds the review sheet: the frame on its
   own, then the same frame with the participant chrome blocked in over it. There is no
   headless browser here (ADR-139), so this sheet is the only way to see the composition.
4. Look at it at display size *and* zoomed:
   `node scripts/scene/render-review.mjs --scale=2 --zoom=6 --crop=96,80,180,140 --out=/tmp/x.png`
   crops any region at any magnification. Procedural texture (modulo strides, dense
   speckle) reads as corduroy or static on a 480 px canvas; hashed scatter and hand-placed
   landmarks do not.
5. Figures and faces are span-by-span work. The Merlion took seven drafts. A front-on
   bust read as a lighthouse; a smooth-maned profile read as a cockatoo; triangular mane
   spikes read as a dragon; lobes too large read as a poodle. What finally reads as the
   statue in `images/ingest/merlion.jpg` is a ring of small **rounded** mane lobes about a
   third of the head across, a short blunt muzzle with the jaw carried under an open
   mouth, a fish body heavier than the head with crescent scales and a tail fluke, and a
   teal wave at the base instead of legs.
6. **Outline anything that has to read against a busy background.** `outlineCanvas()`
   draws a one-art-unit contour into the transparent pixels around a figure: draw the
   figure into its own `Canvas`, outline it, then `stampCanvas()` it onto the panorama.
   The Merlion only stopped dissolving into the sky when it got a contour.
7. Keep the moving parts findable. The volleyball was a 9×9 white sphere that flew *below*
   the net line, over a white net on pale sand — effectively invisible. It is now 13×13,
   royal-and-gold with an ink contour, and its arc peaks above the net against the sea.
