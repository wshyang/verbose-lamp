# Living spec — PSD Active Day at The Kallang (animated pixel-art scene)

Status: living document (CLAUDE §1). Decisions that fill gaps or deviate are
recorded as sequential addenda in `docs/addenda/` in the same change that
makes them. Anything below tagged `[DRAFT]` is unconfirmed¹.

¹ FDS_BUILDER.md in wshyang/greenfield advocates `[DRAFT — {source}]` tags for
unconfirmed AI content; we keep that habit here (addendum 0001).

## 1. Product contract

A web app that renders the Singapore Kallang waterfront ("THE KALLANG",
Sports Hub) as a living pixel-art scene for a sports / active day:

- The Kallang backdrop is a two-layer composition (sky gradient + keyed
  transparent scene plate) with dawn/morning/day/evening/dusk themes
  (addendum 0009); the original clean daylight plate remains published.
- Extracted sprites populate it: drifting clouds, characters walking /
  running / cheering on the promenade and plaza, dragon boats and kayaks
  racing on the water with synchronised paddling, wakes and splashes, and
  event props (tents, start/finish arch, banners, podium) on land.
- Everything animates in deterministic loops; the viewer can pause, change
  speed, switch the camera between the scene and a composite "lab" that shows
  how boats + paddles are stitched at their anchor points.

## 2. Source assets (see docs/asset-manifest.json)

19 unique images in `src/images/` (11 from the original import, 2 exact duplicates removed; 8 layered-backdrop assets added from `main` in addendum 0009):

| Role | Count | Use |
|---|---|---|
| backdrop | 3 | day-clean = stage; sunset-front + magenta-sky-front = alternate-geometry variants |
| backdrop-reference | 1 | populated mockup guiding placement/scale |
| sky-plate | 1 | gradient for sky replacement / fills |
| backdrop-scene-layer | 3 | dawn/day/dusk magenta-sky plates, keyed transparent |
| backdrop-sky-layer | 5 | full-frame sky gradients composited under scene plates |
| sprite-sheet | 5 | characters, boats, clouds, water-effects+props v1 & v2 |
| reference-photo | 1 | real Sports Hub photo (likeness reference, not rendered) |

## 3. Sprite pipeline (tools/)

`tools/extract_sprites.py` + `tools/sheet_config.py` turn each magenta-keyed
sheet into transparent PNGs under `public/sprites/<class>/…` (publicly
accessible at `/sprites/<class>/…` once served) and a typed manifest at
`src/generated/sprite-manifest.json`:

1. Magenta key → alpha (distance from the key colour), despill, 1px alpha erode.
2. Connected components on a dilated grouping mask (keeps detached splash
   droplets with their splash), min-area filter, per-sheet ignore regions
   (baked-in text headings/labels are never extracted as sprites).
3. Reading-order sort (rows top→bottom, left→right) + semantic names from
   per-sheet config; fallback `<class>-NN` names are a config bug to fix,
   not a deliverable.
4. Manifest records per sprite: id, class, public URL, pixel size, source
   sheet + source bbox. Sprite file + manifest land in the same change.

## 4. Composite objects (src/objects/, anchors in src/generated/anchors.json)

One module per object class. Composites:

- **Dragon boat** (6 liveries): hull+crew sprite (crew painted without
  paddles) + one wooden paddle per paddler station + bow/stern wake + catch
  splashes. Paddles rotate about their top-grip pivot through a 4-phase
  stroke (catch → pull → exit → recovery), phase-locked to the drummer.
- **Kayak K1/K2/K3** (per-livery): hull+paddler sprite + double-ended paddle
  rotating about each paddler's chest pivot, alternating blade dips + splashes.
- Anchor coordinates are fractions of the base sprite; the paddle pivot is a
  fraction of the paddle sprite. Tuned by screenshot loop (composite lab),
  recorded in addenda.

Non-composite object classes: character (walk/run/cheer loops from the
pose sheet), cloud (drift), water effects (wake stretch/fade, splash frame
cycle, ripple pulse), props (static set dressing with flag/bunting sway).

## 5. Scene composition (src/scene/)

Layer order (back→front): backdrop sky → backdrop scene plate → drifting clouds (sky band) → land props
→ land characters (plaza & promenade paths) → water traffic far→near lanes
(boats with wakes/splashes, depth-scaled) → foreground sparkles [DRAFT].

Placements follow the populated-reference backdrop (people concentrated on
the plaza/steps/promenade; boats in the lower water band). The stage is the
backdrop's 2752×1536 world, letterboxed to the viewport with
`imageSmoothingEnabled = false`. Portrait/narrow viewports instead crop
horizontally around the stadium opening (x=750) at 1:1 scale
(addendum 0011).

## 6. Animation & determinism

Seeded RNG + injectable clock (`?seed=`, `?t=` for QA stills). Named loops:

- `strokeCycle` (dragon boat, ~0.9–1.3 s varied per boat), `kayakStroke`
  (~1.1 s, phase-offset per seat), `gaitCycle` (4-phase: contact/passing/contact/passing from every
  motion pose in the sheet, phase-locked bob + lean; addendum 0007), `cheerCycle` (arms pose swap + hop), `cloudDrift` (constant velocity,
  wrap), `wakePulse`, `splashCycle`, `ripplePulse`, `flagSway`, `bob`
  (hull bob/roll synced to stroke).

## 7. Controls (every control carries data-testid, CLAUDE §6)

Pause/play, speed (0.5×/1×/2×), scene⇄lab view toggle, anchor-overlay toggle
in lab view, and a sprite-atlas link. Copy is user-facing; no internal slugs.

## 8. Testing & validation (CLAUDE §2, §3, §8)

- Python: pytest over keying/component logic on synthetic fixtures + a
  manifest-consistency test (every manifest entry exists on disk & vice versa).
- TS: Vitest over RNG determinism, stroke/anchor math, row-clustering-free
  pure logic, and manifest typing. No mocks of the pipeline under test.
- Visual: Pillow QA stills (`tools/preview_composites.py`, contact sheets)
  reviewed by eye each tuning round; Playwright e2e (video on) drives the
  real page where a browser is available. Always state which layer ran.
- Container: static `dist/` on port 3000 / `0.0.0.0`; SHIP-HATS inert (§10).

## 9. Out of scope (v1) [DRAFT — agent]

Alternate-geometry backdrops as switchable stages, sound, user accounts,
photo reference rendering, and interactivity beyond the controls in §7.
