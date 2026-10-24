# Generic "real" scene — plan

**Status:** ideation recorded 2026-10-16 · not yet scheduled · no code or assets changed by this document
**Context:** the second venue (CSC @ Tessensohn, ADR-299) may become unusable for reasons outside the
project. Rather than generating a photoreal backdrop per venue, build **one generic photoreal scene**
that any venue can wear: decomposed scenery elements blended photographically, and a foreground
captain's ball court whose players are paper cuttings that jig. This document is the memory of the
ideation sessions of 2026-10-16 (paper-cutting assessment, generic real scene, Singapore skyline band,
player variants). It records intent, not implementation.

Related: ADR-193…214 (the Sentosa photoreal scene and its pipeline), ADR-195 (decomposed layers),
ADR-198 (rosters), ADR-201 (backdrop stickiness policy), ADR-298/299 (venue themes), and the
paper-cutting framework assessment that preceded this plan.

## 1. The concept in one paragraph

A neighbourhood court at the base-centre of the scene, heartland Singapore: a park court on
grass, rain trees around it, HDB blocks beyond, and the Marina Bay skyline faint behind everything.
Everything scenic is
a decomposed photographic element blended to fuse (no paper effect — one believable *place*).
The players are treated differently: paper cuttings with a torn white rim, baked lift shadow and a
small stop-motion **jig**, so they read as cut-out actors on a photographic stage and the eye goes
to the game. The background stays perfectly still; the stillness is what the cuttings read against.

## 2. Why generic

- The Sentosa `real` scene is landmark-locked (Merlion, USS globe, ferry terminal) and ~15 MB,
  inert and unoffered in the UI. A generic scene keeps the photoreal investment but drops the
  venue lock: skyline = Singapore the country, not any one venue.
- One scene to tune, one asset set to generate, instead of a panorama per venue (ADR-298's
  per-venue photoreal assumption is deliberately inverted; that needs its own ADR if built).
- Every scenic element is an individual layer (ADR-195's argument), so the band can be
  recomposed — park, beach, rooftop — without re-rendering anything.

## 3. Layer stack (back to front)

1. **Sky plate** (`sky`, full-bleed, 3 mood variants)
2. **Far skyline band** (keyed, far grade): `skyline-cbd`, `skyline-mbs`, `skyline-flyer`,
   `skyline-supertrees`
3. **Haze strip** (procedural) over the far band's bases
4. **Heartland band** (keyed, near grade): `skyline-hdb`, `mrt`, `shophouse`
5. **Ground plate** (`ground`, full-bleed park grass)
6. **Tree elements** (keyed): `raintree`, `palm` individuals; `playground-dragon` beside the court
7. **Court surface** (`court`, keyed slab, full-bleed width; near edge on the frame base,
   ends at the frame sides)
8. **Far-side players** (~27 units) → chairs + catchers at both ends → **near-side players**
   (~43 units) + ball, all feet-anchored, soft contact shadows (no paper treatment — see §6)
9. **Foreground framing palm** (keyed, closest thing in frame)

Deliberately excluded from the distant band: the Merlion and the USS globe. They are the Sentosa
scene's identity; leaving them out is what makes this scene generic-Singapore. Skyline presence is
a taste dial — default faint, the players are the subject.

## 4. The court and the player variant system

Captain's ball (Singapore school sport): 5-a-side, mixed gender, volleyball, no net, no running
with the ball; the catcher stands on a chair in the back goal circle and a 3-second held catch
scores. The chair silhouette is the sport's signature.

**Slots.** Five court players per side, two team kits (red vs blue). Five pose slots, defined
side-on to the court (play reads across the strip):

| Slot | Pose | Reading |
|---|---|---|
| S1 `thrower` | Two-handed chest pass, just released | The pass |
| S2 `receiver` | Both hands up taking the catch | The catch — the game's turning moment (cf. motif `catchhands`) |
| S3 `blocker` | Arms fully stretched up, on toes | The block |
| S4 `mover` | Mid-stride moving into space, no ball | Finding space (no ball: running *with* it is illegal) |
| S5 `marker` | Low wide defensive stance, arms spread | Cutting the passing lane; guards its own catcher (owner-added 2026-10-16) |

The catchers are a separate special asset pair (one per kit, standing on the chair, reaching);
variants for catchers are a later option, not phase 1.

**Variants (owner decision, 2026-10-16: team-dedicated pools).** Each slot gets **10 variants per
team** — 20 per slot, **100 player images** in total across the five slots — every one the exact same pose, varying
gender, body shape and ethnicity, Singaporean personas throughout. A slot is a role, not a person:
both teams field a thrower, so S1 exists twice on court at once (far side flopped), but each
side's instance is drawn **only from its own kit's pool of 10**. The scene picks a variant per
slot per visit (seeded/randomised at mount), so the court population changes between visits
instead of being a frozen sticker sheet — the ADR-198 roster lesson ("three identical cabins read
as one cabin") applied to people, with a 10-deep bench per role per side (10⁴ castings per side).
Same pose every time is what keeps the choreography (ball arcs, depth rows) valid regardless of
who is picked. (A shared 5 red / 5 blue pool was considered and rejected by the owner in favour of
the deeper per-team bench, at double the generation turns.)

**The 20-variant matrix** (applied per slot; 10 red, 10 blue):

| # | Red | Blue |
|---|---|---|
| 01 | Female, athletic build, Chinese | Female, athletic build, Indian |
| 02 | Female, slim build, Indian | Female, stocky build, Chinese |
| 03 | Female, heavier build, Malay, sports hijab | Male, slim build, Chinese |
| 04 | Male, athletic build, Malay | Male, heavier build, Indian |
| 05 | Male, stocky build, Chinese | Male, tall lean build, Malay |
| 06 | Female, stocky build, Indian | Female, slim build, Malay, sports hijab |
| 07 | Female, tall lean build, Chinese | Female, heavier build, Chinese |
| 08 | Male, slim build, Malay | Male, athletic build, Chinese |
| 09 | Male, heavier build, Chinese | Male, stocky build, Malay |
| 10 | Male, athletic build, Indian | Female, athletic build, Malay |

## 5. Generation protocol (how the art gets made)

The workflow used for the Sentosa renders applies: one subject per image, **never ask the image
model for a sprite sheet** (derived frames only — `generate-real.mjs` header), flat **magenta
(#FF00FF) background** for keying, full body head-to-shoes with clear margin, even lighting.

- Per slot: generate red-01 as the **master pose**, then generate the remaining 19 using the
  master (or the same kit's first variant) as the reference image, instructing: same pose, same
  camera angle, same framing, same magenta background; change only the person (per matrix) and
  kit colour where the matrix says so. Pose retention from reference-editing is approximate; the
  pipeline normalises by feet anchor and height, which absorbs small drift. Gross pose drift =
  regenerate that variant. (Demonstrated 2026-10-16 on S1: pose retention was near-exact.)
- Adults only, modest sports attire (team shirt, shorts; sports hijab where the matrix says).
- **Every subject faces right** (owner rule, 2026-10-16). Left-facing instances are produced by
  the pipeline (`-flop`, cf. `ferryMoored`), never generated: one facing keeps all 80 variants
  mutually floppable, and a generated left-facing set would double the art for nothing. Prompts
  for new slots must specify side profile facing right; see §9 for the flip-safety corollary.
- Naming: `.scene-src/players/<slot>-<kit>-<nn>.png` (e.g. `.scene-src/players/thrower-red-03.png`),
  committed beside the other sources.
- **Pacing: 10 image generations per turn.** Players took 10 turns (S1–S5, one kit-pool of 10
  per turn, plus fix-ups); catchers + chairs one turn. Scenery follows under the element-variant
  policy below. Total phase-1 art ≈ 125 images over ~13 turns.
- **Element variants (owner, 2026-10-16).** In like fashion to the players, every scenery
  class gets variants for the scene to cast from — but **3 per class**, not 10. The classes and
  their variant axes (variants within a class are interchangeable at the same anchor):
  - `sky` (background plate, full-bleed): sky mood — clear morning / bright noon / soft
    overcast, kept near-neutral (see normalisation below). *(Replaces the owner-rejected
    `seascape`: the court cannot sit on water; the setting is urban heartland.)*
  - `ground` (full-bleed): park grass — lush / sunlit-dry / with a worn path crossing.
  - `court` (court **surface only**, keyed slab): colourway — teal / green / warm-red acrylic.
    Line layout must be **identical** across variants (players anchor to it), so 02/03 are
    reference-edited colour swaps of the master, never fresh generations. Nothing else is in
    the frame — no trees, no surroundings (owner, 2026-10-16: the first plates baked the trees
    in; rejected and removed). **Frame geometry (owner, 2026-10-16):** the slab is *not*
    floating in the frame — its near edge runs along the **bottom edge** of the image and its
    two ends run out to the **left/right edges** (full-bleed width); only the far sideline
    crosses the frame, magenta above it for keying. The scene composites the court full-width
    with its base on the stage floor line.
  - `raintree`, `palm` (keyed): three individuals each — different silhouettes, same species.
  - `skyline-mbs`, `skyline-flyer`, `skyline-supertrees`, `skyline-cbd`, `skyline-hdb`
    (magenta-keyed elements): rendering variants — detail level and light, same elevation.
  - `playground-dragon` (keyed, park furniture): the iconic dragon playground of the HDB
    heartlands (owner request, 2026-10-16), placed on the grass beside the court. The real
    structure (Toa Payoh Lor 6, 1979, Khor Ean Ghee; NHB Roots): a **flat geometric dragon-head
    slab in profile** — orange-red mosaic/terrazzo with a thick white outline and one circular
    white-ring eye, angular snout, horns swept back — an orange mosaic slide slab beneath the
    head, and a body that is **not solid**: a winding elevated spine of dozens of vertical steel
    rings in repeating red/blue/green/white bands, arching on slim posts to a flat orange tail
    fin; it stands in a sand pit (ground dressing, not part of the element). The first AI set
    rendered a solid mosaic dragon statue instead — owner-rejected and deleted 2026-10-16;
    this class follows the researched structure.
  - `mrt` (keyed): an MRT train on its elevated viaduct — the heartland's moving signature;
    can sit in the heartland band or midground.
  - `shophouse` (keyed): a short row of two-storey shophouses — background band variety.
  - `haze` (haze strip): 3 densities, **procedural in the pipeline**, no image generations.
  The scene casts one variant per class per visit, independently — safe because the pipeline's
  aerial-perspective grade normalises every skyline element to one atmosphere, and the sky
  moods are graded toward the same neutral, so no combination can clash. Naming:
  `.scene-src/<class>-<nn>.png` (e.g. `.scene-src/court-01.png`, `.scene-src/skyline-mbs-02.png`).
  Element art total: 13 generated classes × 3 = 39 images.

## 6. Treatments

- **Scenery (blended):** existing key/despill/erode pipeline, unchanged. Skyline layers get an
  additional aerial-perspective grade (lifted blacks, desaturation, blue push; two grades).
- **Players (paper — DEFERRED by owner, 2026-10-16):** composition proceeds without the
  paper treatment; players ship as plain chroma-keyed cut-outs with soft contact shadows
  (see the P0 progress entry). The paper-cutting transform assessed 2026-10-16 — threshold alpha → tear
  silhouette (two-scale noise) → dilate paper rim (warm off-white, fibre grain, rim only) →
  art re-inset → edge-thickness shading → baked lift shadow. Applied per frame of the two-frame
  sheet with the *same noise field*, so the paper outline is rigid while the art inside shifts
  (frame B read as the piece being nudged). Jig pivot at the feet (`transform-origin: bottom
  centre`) so ground contact never breaks; a separate soft contact-shadow ellipse sits under
  each player (blended, static) — the paper jigs above it, the shadow stays.
- Which layers get paper: players and catchers only. The court lines and circles are painted on
  the blended court plate, so the thin-feature tear problem (net cords, cables) does not arise;
  scenery classes and exemptions follow the paper-cutting assessment of 2026-10-16.

**Catcher-on-chair registration (the placement algorithm).** The catcher (paper) and the chair
(blended) are separate assets that must meet exactly at the seat, at any scale, under the jig.
Neither is placed by eye; both declare an anchor as fractions of their trimmed, post-treatment
bounding boxes, and placement is arithmetic from the two anchors:

- **Chair seat anchor** `A = (seatX, seatY)`: detected by the generator — key, trim, take the
  alpha row-coverage profile (average opacity per row). The backrest alone gives low, flat
  coverage; the seat is the first band below it where coverage jumps (threshold ≈ 2.5× the
  backrest baseline). Measured on the 2026-10-16 chair asset: coverage jumps 0.20 → 0.79 across
  rows 16–18 of 40, i.e. `seatY ≈ 0.42`; `seatX` is the centroid of that band's opaque span.
- **Catcher feet anchor** `F = (feetX, 1.00)`: `feetX` is the centroid of opaque pixels in the
  asset's bottom rows, measured **after** the paper-cut pass, so the torn rim is inside the
  measurement rather than lifting the feet by a rim-width.
- **Placement:** the chair is placed on the court by its own geometry (bottom anchor). The seat
  point in scene coordinates is `chairBox + (seatX·w, seatY·h)`; the catcher's box is then
  positioned so `F` lands exactly on that point. Catcher height and chair size stay independent
  knobs — contact survives any rescale precisely because both anchors are fractions, which is
  why this is registration, not a pixel offset. (Rejected alternative: generating the catcher
  already standing on the chair as one image — the two treatments could never be separated.)
- **Jig:** the paper jig pivots at `F` (`transform-origin: feetX% 100%`), so the catcher sways
  on the seat instead of sliding off it. Draw order: chair, then catcher (the feet occlude the
  seat's front lip, which is correct from a side view). The flopped far-end pair reuses the same
  registration with mirrored fractions (`seatX → 1 − seatX`).
- **Verification (P2 gates):** the generator asserts seat-band coverage exists within ±2% of
  `seatY` on the shipped chair, catcher feet rows sit within 2 px of the box bottom, and the
  `_preview`-style t=0 composite of chair + catcher is a required visual gate (ADR-199's lesson:
  a still composite is how a mis-seated catcher gets caught).

## 7. Where it lives (architecture sketch, for the eventual ADR)

- **Assets:** sources in `.scene-src/` (`players/`, court, skyline clusters) beside the existing
  renders; derived layer sets and a generated geometry/parts module in the same shape as
  `generate-real.mjs` produces today. A shared tear helper under `scripts/scene/` that any
  venue's one-off script may import (ADR-298's shape respected).
- **Component:** a venue-neutral `GenericRealScene` consuming a generated parts record
  (SentosaRealScene's contract), parameterised by asset set and a `--paper` modifier class;
  any theme opts in by declaring the style.
- **Name:** `life` is the leading candidate (it already appears in two code comments referring
  to this scene family); Sentosa's landmark scene keeps `real` unless the owner retires it.
- **Policy:** photoreal bytes stay opt-in per URL and never remembered (ADR-201), inherited.

## 8. Phasing (when scheduled)

- **P0 — composition sketch:** mock court + skyline band + silhouetted players in the existing
  `_preview.html` live-review harness (ADR-199); judge density and the chair silhouettes at
  phone size. No app wiring.
- **P1 — spike:** court plate + one kit-pool of one slot + catcher/chair through the full
  pipeline (key → two-frame derive → paper-cut → jig CSS on the preview page). Judge tear scale,
  jig amplitude, feet contact.
- **P2 — production:** all 80 player variants through the pipeline; generic scene package
  (geometry, generated module, component); skyline grading.
- **P3 — wiring:** style registration + backdrop choice, reduced-motion + scene-motion tests,
  generated-module bijection tests, e2e, size budget, ADR superseding ADR-298 in part.

## 9. Risks and watch-items

- Generated hands and ball contact: mitigated by the separate ball layer (never generated in a
  hand) and open-palm poses; inspect at P1.
- Pose drift across a slot's 20 variants: feet-anchor + height normalisation absorbs small
  drift; gross drift is regenerated (protocol cost, not scene cost).
- Flip safety (corollary of the facing rule): `-flop` mirrors everything asymmetric — harmless
  for hair and hijab drape at scene scale, invisible for shoe logos, and it silently swaps a
  thrower's dominant hand on the far side, which nobody can read at ~40 art units. The binding
  constraint is already in the protocol: no text, numbers or logos on kits, so nothing ever
  reads backwards.
- Density: 4-v-4 + 2 catchers in a 270-unit strip can turn to soup; P0 exists to settle it.
- The generated magenta fields carry a faint watermark-like texture (observed on S1): the
  keying fuzz absorbs it, but despill settings must be re-checked per batch.
- File size: 80 player sheets at `SCALE = 8` would be heavy; players are small on screen, so
  generate/process them at a lower scale and enforce a budget line at P2.
- Cultural accuracy (kits, sports hijab, persona mix) gets an owner review pass at P1, like the
  motif skin ramps (ADR-070) had.

## 10. Decisions

- **Resolved 2026-10-16 (owner):** team-dedicated variant pools — 10 per team per slot, 80
  player images. Shared 5/5 pool and kit-neutral generation with pipeline recolour considered
  and set aside.
- **Resolved 2026-10-16 (owner):** **S5 is the `marker`** — low wide defensive stance, arms
  spread cutting the passing lane; it guards its own catcher and stands in the opposing
  thrower→receiver lane. The `pivot`, `interceptor` and `caller` candidates were ideated the
  same day and set aside. Player art total 100 images; the court fields 5 per side + catcher.
- **Resolved 2026-10-16 (owner):** proceed with scene composition, **skipping the paper-edge
  style for now**. Players/catchers are plain keyed photographic cut-outs with contact
  shadows; the §6 paper transform and jig are deferred, not cancelled.
- **Resolved 2026-10-16 (owner rejections):** `seascape` killed — a sea background makes no
  sense under a court; the setting is urban heartland (`sky` + HDB band + skyline). The first
  `court` plates (surface with trees and sky baked in) killed — trees are layers the scene
  places, never part of the court asset; the court class is now the surface slab alone, viewed
  from the long side. Six files removed from `.scene-src/` the same day; §1/§3/§5 rewritten.

## Asset progress

- 2026-10-16: plan recorded (commit `7fe4533`, truncated tail repaired in the follow-up commit).
- 2026-10-16: S1 `thrower` — **complete: 20/20** (red 01–10, blue 01–10). First 10 generated as an
  initial shared set and renamed to `<slot>-<kit>-<nn>`; 06–10 per kit followed the same day.
  Spot-checks confirm near-exact pose retention across gender/body-shape changes.
- 2026-10-16: S2 `receiver` red pool — **10/10 generated** (30 player images total). Pose (high
  catch, eyes up) retains near-exactly across the pool. Watch-item confirmed: red shirt hue drifts
  slightly between generations (some deeper red); kit hue normalisation is a pipeline step at P2.
- 2026-10-16: S2 `receiver` blue pool — **10/10 generated** (40/80 player images; S2 complete at
  20/20). Facing rule reconfirmed by the owner and recorded in §5: all subjects face right.
- 2026-10-16: S3 `blocker` red pool — **10/10 generated** (50/80 player images). The stretched,
  on-toes block reads distinctly from S2's crouched catch at silhouette level, as intended.
- 2026-10-16: S3 `blocker` blue pool — **10/10 generated** (60/80 player images; S3 complete at
  20/20).
- 2026-10-16: S4 `mover` red pool — **10/10 generated** (70/80 player images). The mid-stride
  pose retains across personas with only minor foot-plant variance, absorbed by feet anchoring.
- 2026-10-16: S4 `mover` blue pool — **10/10 generated. PLAYER ART COMPLETE: 80/80**
  (4 slots × 2 kits × 10 personas), all facing right, all committed under `.scene-src/players/`.
- 2026-10-16: S5 `marker` decided (owner) and written into §4; red pool **9/10 generated**
  (89 player images total) — `marker-red-04` (athletic Malay man) deferred: the turn's
  10-generation limit was consumed by a rejected first master (see §9, invented floors).
- 2026-10-16: S5 `marker` blue pool — **10/10 generated** (99/100 player images). Next turn fixes
  the single gap, `marker-red-04`, closing player art at 100/100.
- 2026-10-16: fix-ups — `marker-red-04` generated (**player art 100/100**); `marker-blue-09`
  regenerated (its background measured `srgb(183,18,122)` against the family `~(243,48,211)`;
  verified back in family). Chair (`.scene-src/chair.png`) and both catchers
  (`catcher-red-01`, `catcher-blue-01`) generated; first red catcher rejected (white shorts,
  airborne pointed feet) and regenerated grounded with black shorts. Seat registration algorithm
  designed and measured on the chair asset (§6): seat band at `seatY ≈ 0.42`.
- 2026-10-16: element variants begun (owner policy: 3 per class, §5). `skyline-mbs` ×3 done
  (daylight / golden / hazy-distant — the master reads unmistakably: three towers, boat SkyPark,
  rooftop palms; towers end mid-frame, bases hidden behind haze at scene scale) and
  `skyline-flyer` 1/3. First `court` ×3 and `seascape` ×3 were generated, **rejected by the
  owner the same day** (sea under a court; trees baked into the court plate) and removed;
  classes re-planned decomposed (§3/§5) and regenerated as `sky`, `ground`, `court`-slab.
- 2026-10-16 (correction pass): decomposed classes regenerated to the re-planned stack —
  `sky` ×3 (gradient sky plates; noon/overcast moods), `ground` ×3 (zoomed-out mown lawn
  receding to a far edge; the first attempt was a blade-level macro, owner-rejected and
  regenerated), `court` slab ×3 (**side view from the long side** — an end-view attempt was
  owner-rejected: side-profile players cannot play into the depth axis; teal master + green /
  terracotta reference-edited colour swaps, line layout identical), `raintree` 1/3, `palm` 1/3.
- 2026-10-16 (correction pass 2, owner): `court` regenerated to the frame-geometry rule —
  full-bleed width, ends cropped by the frame sides, near edge at the frame base (the pipeline
  trims any residual keyed sliver below the near-edge line so the edge lands exactly on the
  base); colour swaps 02/03 follow from it. Also done this pass: `raintree` ×3, `palm` ×3,
  `skyline-flyer` ×3 complete; `skyline-supertrees` 1/3. (Also repaired: §4/§5 text that had
  drifted stale — five slots, decomposed class list.)
- 2026-10-16 (heartland pass, owner request): `skyline-hdb` ×3 and `skyline-supertrees` ×3
  complete — the HDB master carries slab/point blocks, pastel facades and bamboo laundry poles.
  New owner-requested classes (§5): `playground-dragon` ×3, `mrt` 1/3, `shophouse` 1/3.
  **Watch-item:** the dragon masters stand on a magenta-*gradient floor* (model-invented, cf.
  the §9 floor problem) instead of flat magenta, and read more statue than the arch-bodied
  Toa Payoh original — regenerate the set next turn with the explicit no-floor clause before
  use; the keyer cannot be trusted with the gradient.
- 2026-10-16 (dragon research + completion): owner rejected the statue-style dragons; the
  three files are deleted. Researched the real playground (Toa Payoh Lor 6, 1979, Khor Ean Ghee;
  NHB Roots + photos): flat mosaic head slab, ring-spine body, sand pit — §5 now carries the
  researched structure, and the regenerated master matches it (head slab, slide, ring body,
  tail fin, flat magenta, no floor). Same pass completed `skyline-cbd` ×3, `mrt` ×3,
  `shophouse` ×3 and the dragon variants — **all 13 element classes × 3 are now generated**
  (39 images); `haze` remains procedural.
- 2026-10-16 (additional dragon attempts, owner request): generated `playground-dragon-04` to
  `playground-dragon-08`, pressing for separate upright hoops with visible gaps rather than a
  continuous coil. `playground-dragon-04` was deleted: the photo-guided edit still rendered a
  dense coil and imported a spring rider and tiled base from the reference photo.
  `playground-dragon-05`–`playground-dragon-08` are retained as additional candidates;
  `playground-dragon-05` and `playground-dragon-07` currently read closest to the reference
  photos. The class therefore has seven candidate files (`01`–`03`, `05`–`08`) pending the
  owner's final selection; this is an intentional exception to the usual 3-variant class size.
- 2026-10-16 (P0 composition, owner go-ahead; paper edges skipped per above):
  `apps/web/scripts/scene/generate-generic-composition.mjs` keys the selected variants and
  composes the full stack at 1920×1080 — sky, far skyline (CBD/MBS/Supertrees/Flyer, graded
  faint), haze, HDB + MRT + shophouses, ground, rain trees/palms, dragon playground
  (`playground-dragon-07`), full-bleed court, contact shadows, far row (27 units), chairs +
  catchers (seat registration at `seatY ≈ 0.42`), near row (43 units), ball, foreground palm.
  Output: `apps/web/public/themes/generic/scene-composition/_preview.{html,png}` (gitignored,
  regenerated on demand; 35 layers, ~5.7 MB). Pipeline lessons recorded in the script: the
  court render's perspective is forced to a shallower box or it swallows every layer behind
  it; players need the masked `people` despill — the blue-channel clamp turns blue kits
  teal, an unmasked red/blue clamp greys red kits (blue sits marginally above green), and
  sequential per-channel `-fx` passes leave blue fringes. The composite reads as one
  heartland place: MRT + HDB + dragon in the band, 5-v-5 + catchers on chairs on court.
- 2026-10-16 (z-axis + scale pass, owner review): the composer now has an explicit depth
  model — every sprite declares the ground line its feet stand on, draw order `z` is derived
  from that line (plates carry fixed band values; the chair/catcher pair is hand-pinned so
  the catcher stacks on its chair), and figure heights come from one `depthScale` function
  (half scale at the horizon). Owner-flagged scale faults fixed under it: the chair was an
  independent oversized knob (27 units wide) and the players too small (27/43 units); the
  chair is now sized off the human scale at its depth (21 wide) and players run 43 (far) /
  60 (near) units, so a catcher on a chair stands taller than court players without the
  chair dominating. MRT slightly reduced; mover contact shadows softened again.
- 2026-10-16 (extraction cleanup, owner report): some cut-outs carried corrupted feet —
  black splatter that is NOT in the sources. Diagnosis: the renders bake a faint, darker
  floor shadow onto the magenta; the old RGB fuzz key left that shadow semi-opaque, and
  the despill clamp then dragged its red/blue toward green, turning the residue
  near-black. The pipeline now cleans mechanically, no per-asset hand work: (1) a
  brightness-invariant ratio matte — alpha from `min(R,B)/G` computed on the ORIGINAL
  rgb before despill, so backdrop-family pixels key out at any brightness while white,
  skin, kits, foliage and concrete (ratio ≈ 1) stay opaque; (2) alpha hardening
  (level + 1px open); (3) a fragment pass that subtracts alpha only where a fragment is
  both detached from the subject's main mass (connected components, threshold at 1.5%
  of the sprite's own area) and near-neutral (saturation < 35%, any brightness — grey
  specks and soft shadow smudges). Keying runs at a capped 832px and trims before the
  display resize, so a subject that is small in its frame (the chair) is never shrunk
  into its own residue class. Verified sprite by sprite (mover, far receiver, chair,
  catcher, dragon, MRT, ball, flyer) and in the composite: feet are clean, the pale
  chair survives, the dragon's connected rings are untouched. One run ≈ 4–5 min.
- 2026-10-16 (extraction cleanup pass 2, owner review of the players): auditing every
  layer on contrast sheets found three more mechanical defects. (a) The ratio matte
  ate a crimson shirt outright — crimson is red with blue at a third of red, which a
  lone `min(R,B)/G` cannot tell from magenta — and dissolved black leggings, where a
  whisper of magenta bounce inflates relative ratios. The matte is now a four-factor
  score: green deficit × red/blue balance (zero below 0.55, so crimson is safe) ×
  absolute deficit × green's proportional weakness (magenta bounce on spandex keeps
  green near half the pair; a true backdrop shadow has almost none). The despill
  masks carry the same balance guard, so scarlet kit and the MRT stripe are never
  clamped. (b) Lavender haze in the skyline renders sits between colour families;
  because haze is always continuous with the backdrop at the frame edge, a
  border-connected component pass now cuts exactly the backdrop-candidate
  components that touch the border (with a brightness floor so the flood cannot
  eat dark cloth). (c) Magenta sheen still punches enclosed holes in dark cloth;
  an enclosed-hole pass restores alpha where a transparent component does not
  touch the border and the PRE-despill rgb is dark — judged pre-despill because
  despill turns genuine backdrop black (an early version filled the Flyer's
  wheel interior into a dark disc). The haze-washed -03 supertrees/flyer
  variants are no longer cast (flyer-03's wheel is drawn as a filled disc in
  the source); the crisp -01 variants are cast and the distance grade supplies
  the faintness. Verified per sprite and in the composite: black fuzz at
  feet/shoes gone, red kits solid crimson, Flyer an open ring, Supertrees
  clean silhouettes. One known residue: the far hijab player's black leggings
  keep a small sheen patch at audit magnification — sub-pixel at display
  size. One run ≈ 30 min on this sandbox (four fx passes per sprite).
- 2026-10-16 (extraction cleanup pass 3, mover tuning + regression sweep, owner
  direction): tuning was iterated on the two mover sprites alone
  (`mover-red-10`, `mover-blue-04`) in a mover-only harness before any full
  run. Two additions came out of their feet and clothes: (a) edge unmixing —
  a silhouette pixel is fg*a + backdrop*(1-a), so with the matte's own
  alpha the foreground colour is solved directly against the backdrop
  colour (0.95, 0.19, 0.83); this is what finally whitened the runners'
  shoes; (b) rim despill for magenta bounce baked into near-opaque pixels
  (the pink rim on shins), balance-guarded so crimson shirt rims stay out.
  The matte's proportional-weakness ramp was also raised (0.38→0.45) to
  stop eating sheen speckles in black shorts. Movers verified on white and
  contrast sheets: feet/shoes clean with no black fuzz, red and blue kits
  solid, shorts solid black. The tuned pipeline was then ported to the
  generator and a full sweep run as regression: people / architecture /
  midground sheets and the composite show no regressions — crimson
  receiver solid, Flyer an open ring, Supertrees clean, dragon rings and
  MRT stripe intact, chairs at both goals. One run ≈ 25 min.
- Next: owner review of the P0 composite (density, MRT prominence, shadow tuning), then
  P1 spike or P2 production packaging per the owner's call.