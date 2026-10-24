# Venue themes: spec

**Status:** shipped for Sentosa; the architecture is ready for a second venue (Stages 1–6 done) · **Date:** 2026-10-16 · **Supersedes:** `2026-10-15-backdrop-venues-plan.md`
(its §2 analysis of where Sentosa is hard-coded in the scene still holds and is not repeated here)

Decisions: ADR-294 (module and layout), ADR-295 (selecting the venue), ADR-296 (tokens and CSS),
ADR-297 (motif roles and per-venue palette).

---

## 1. Goal

The participant frontend is themable by **venue**. A venue supplies, as data:

| Facet | Today (Sentosa) |
|---|---|
| Colour palette | gold-led, sand, sea blue, palm green |
| Backdrop scene | pixel panorama (classic, fine) and photoreal (real) |
| Motifs | the sprite set, drawn in the venue's palette; plus which sprite plays each role |
| Copy | the Landing tagline and station line |
| Browser chrome | the `theme-color` meta |

Sentosa is the only venue now. Adding another must be a data change, not an edit to shared code.

Out of scope: the staff console (deliberately spartan), avatar swatch labels and personas, demo
seed team names, a superadmin venue picker.

Naming: the unit is a **theme** keyed by a **venue id**. Directories say `themes/`, because "the
venue's courts" (ADR-285, ADR-288) already means tournament courts.

## 2. Layout

```
apps/web/
  scripts/
    motifs/            generate.mjs, render-sheet.mjs, core.mjs, base-palette.mjs, grids/*.mjs
    scene/             generate-pixel.mjs, generate-real.mjs, render-review.mjs
    themes/<id>/       manifest.mjs, palette.mjs, motifs.mjs, scene/{pixel-art,pixel-sprites,real-geometry}.mjs
  public/themes/<id>/  motifs/  scene/  scene-2x/  scene-real/
  src/themes/
    index.ts           THEMES registry, themeFor(id)
    types.ts           VenueTheme, MotifRole, SharedMotifName
    themes.css         imports every theme's CSS
    themes.test.ts     contract test over every registered theme
    <id>/              index.ts, theme.css, scene.css, <Id>Scene.tsx, <Id>RealScene.tsx, art/*.ts (generated)
```

Rules:
- Everything a venue owns lives under a directory named for that venue. Everything outside such a directory is venue-agnostic.
- `src/themes/<id>/` is imported only by `src/themes/index.ts` and by files inside that theme (`venue-isolation`, enforced by `check-standards.mjs`). Staff surfaces may not import `themes/` at all.
- Source photographs stay where they are (`images/ingest/`, `.scene-src/`); the manifest names them.

## 3. Colour

Tokens that are structural stay in `styles/tokens.css`: `--ink`, `--ink-soft`, `--paper`, `--led`,
`--console-*`, spacing, fonts, tap sizes.

Tokens a venue owns are renamed from their beach names to roles and defined per theme in
`src/themes/<id>/theme.css` under `:root, :root[data-venue='<id>']`:

| Old | New | Role |
|---|---|---|
| `--gold` | `--accent` | primary call to action, current tab, focus ring |
| `--gold-deep` | `--accent-deep` | the accent's shadow / pressed |
| `--sand` | `--surface` | cards, panels |
| `--sand-deep` | `--surface-deep` | panel edges, dividers |
| `--sea-deep` | `--primary-deep` | page background, strong headings on light |
| `--sea` | `--primary` | |
| `--sea-light` | `--primary-light` | rank, soft highlights |
| `--palm` | `--secondary` | progress bars |
| `--sunset` | `--hot` | points, danger |
| `--merlion` | `--landmark` | landmark tint |
| *(new)* | `--hot-deep`, `--hot-pale` | the danger button shadow and hover that were literals |
| *(new)* | `--live-flash` | the row-flash colour `useLiveList` hard-coded |

`--sky` and `--scene-sky` keep their names. `--scene-sky` must equal the top row of that venue's
panorama (ADR-022); the manifest's `skyTop` and the theme's `--scene-sky` are asserted equal.

The default theme's values are on `:root` as well as `[data-venue]`, so the page is correct before
any script runs. `<html data-venue>` is set above the router, so `UpdateBanner` and
`PhotoDialog` (which render outside `.theme-gameboy`) and the hall screen follow it.

Tests: every `var(--x)` in `gameboy.css`, `screen.css`, `base.css` is defined; every theme defines
every venue token and every `--motif-*` role; per-theme contrast of the text-on-fill pairs the
stylesheet uses (AA 4.5:1, or a pinned measured floor where Sentosa already falls short).

## 4. Motifs

192 sprites, colours baked into the SVG at generation. Two kinds:

- **Shared names**: UI glyphs, sports, weather, Gameboy chrome. Same grids in every theme, but drawn in that theme's palette, so they exist once per theme at `public/themes/<id>/motifs/`.
- **Venue names**: landmark, fauna and local-food sprites (`merlion`, `cablecar`, `kueh`...). They exist for a theme only if its `motifs.mjs` draws them.

Components never name a venue sprite. They name a **role**:

| Role | Sentosa sprite | Used in |
|---|---|---|
| `bannerMark` | `merlion` | shell banner |
| `navSocial` | `shell` | Social tab |
| `groundStripLeft/Middle/Right` | `crab`, `shell`, `starfish` | QR home strip |
| `landingHero` | `sun` | Landing welcome |
| `teamsHero` | `sandcastle` | Teams heading, Landing "running the event" |
| `teamsQuiet` | `crab` | Teams, browse heading |
| `myTeamHero` | `shell` | My team heading |

The list is the set of `PixelMotif` call sites that named a venue sprite. Nav tabs for `badge`, `flag`, `trophy`, `volleyball` and `face` stay shared: they are UI glyphs.

CSS-placed sprites are roles too, exposed as variables in `theme.css`: `--motif-cloud`,
`--motif-bunting`, `--motif-shoreline`, `--motif-coin`, `--motif-stamp`, `--motif-bullet`,
`--motif-empty`, `--motif-loader`. `gameboy.css` contains no motif URL.

`PixelMotif` accepts only a shared name; `<RoleMotif role>` resolves through the active theme.
Naming `merlion` in a page is a compile error.

### Generation

`scripts/motifs/core.mjs` is pure: `buildSprites({ palette, ramps, grids })`. The generator loops
every `scripts/themes/*/manifest.mjs`, merges `base-palette.mjs` with the theme's palette, merges
the shared grids with the theme's, writes SVGs and the version stamp into the theme's own
directories, and deletes stale SVGs only inside them. The version stamp (ADR-067) is per theme.

Invariant: Sentosa's generated output is byte-identical to the pre-restructure output (260 files
hashed before the move). `MOTIF_VERSION` stays `f222a466`.

## 5. Scene

Venue and style are orthogonal. Style (`classic`, `fine`, `real`) stays per user in
`psd.backdrop.v1` (`backdropChoice.ts` is unchanged). A theme contributes `Scene`, a component
that owns style dispatch for that venue. `BeachScene`/`RealBeachScene` become `SentosaScene`/
`SentosaRealScene`; the `beach-scene*` and `real-beach-scene*` test ids are kept so e2e specs
stay valid.

Venue-specific scene CSS (`gb-scene__cablecar`, `__express`, `__ferry`, `__palm`, their keyframes
and the reduced-motion hide rule) moves to the theme's `scene.css`. `gameboy.css` keeps only the
generic `.gb-scene`, `__layer` and `__frame` boxes.

The cache lists (`apps/api/src/webStatic.ts`, `apps/web/src/sw/policy.ts`) match
`/assets/` and `/themes/<id>/{motifs,scene,scene-2x}/`. `scene-real` stays non-immutable.

## 6. Selecting the venue

- `PSD_VENUE` (env, default `sentosa`, validated against `VENUE_IDS`; an unknown id fails at boot).
- `GET /api/venue` returns `{ venue }`, public, `no-cache`. Public because the scene is drawn on Landing and Sign-in before any session.
- The web caches the id in `psd.venue.v1` (`lib/storage/venueStore.ts`), applies it before first render from the cache, then confirms from the server. It is not polled: changing it needs a restart, and the next page load picks it up.

## 7. Add a venue (checklist)

1. Add the id to `VENUE_IDS` in `packages/contracts`. `THEMES` fails to compile until a theme exists.
2. `scripts/themes/<id>/`: `manifest.mjs`, `palette.mjs` (the venue's ramps), `motifs.mjs` (venue-only grids), `scene/*` if it draws its art in code. A venue whose backdrop is committed files declares no `scene` and is stamped by its own script (see §8).
3. `npm run motifs --workspace @psd/web` and `npm run scene --workspace @psd/web`.
4. `src/themes/<id>/`: `index.ts` (roles, copy, `Scene`), `theme.css`, `scene.css`.
5. Register in `src/themes/index.ts`.
6. Set `PSD_VENUE=<id>`.
7. `themes.test.ts` is the gate: roles resolve to files that exist, every token is defined, contrast passes.

A venue may start with a pixel-only scene (`styles: ['classic','fine']`) and no `real` art.

## 8. CSC @ Tessensohn (the second venue, ADR-299)

- **Palette:** cool and urban. Blue primary `#2372bc` (deep `#143b6a`), blue-grey panels `#cddbde`, terracotta `--hot` `#c8553d`, lawn `--secondary` `#3f8f4a`. Panels are opaque. The banner is a blue bar with a white title, expressed through `--banner-*` tokens that Sentosa defines as its sand plate with a red title. Since ADR-300 the accent is blue too (`--accent` `#6fa8d6`, `--accent-deep` `#2372bc`) and the lit bottom tab is the deep blue under paper; ADR-299's kept gold survives only in the drawn sprites.
- **Motifs:** its own 175 generated sprites in its palette. All nine roles use shared sprites (`kueh`, `chat`, `cone`, `bib`, `whistle`, `flag`, `court`, `face`, `badge`); no Sentosa landmark appears.
- **Backdrop:** the Civil Service Club's own banners from csc.sg, 130 SVG/PNG files copied as served and animated by CSC's own CSS (`src/themes/tessensohn/scene.css`, classes prefixed `csc-`). Two compositions: on a portrait screen the phone banner as a `data-fit="plate"` box of 445 / 671 (`data-layout="phone"`, no pool, the court where the pool was); on a landscape screen the desktop banner as a full-width bottom strip of 3259 / 1204, like Sentosa's (`data-layout="wide"`). Provenance and the (owner-stated, unwritten) permission: `docs/design/tessensohn-scene-credits.md`.
- **Ours, not CSC's:** on a phone, the badminton court with two players (CSC's desktop art, enlarged and put where the pool was) and the removal of the pool; the layout choice by screen shape; the once-per-page-load rule for entrances (`data-intro="play" | "rest"`), the reduced-motion end state, and the `?v=` content stamp.
- **Not generated:** the venue's manifest has no `scene`, so `npm run scene` skips it. After replacing a file run `npm run scene:stamp --workspace @psd/web`; `sceneVersion.test.ts` fails if you forget.
- **Styles:** `classic` and `fine` only (`styles` on the theme); `?backdrop=real` draws the same scene.
- **Browser proof:** `npm run test:e2e:tessensohn` (own stack, `PSD_VENUE=tessensohn`).

## 9. The Kallang (the third venue, ADR-301)

- **Palette:** riverine. River blue primary `#1f6fb4` (deep `#17375e`), blue-grey panels `#dde5e6`, stadium red `--hot` `#b03324`, park `--secondary` `#3f9155`, lagoon-teal accent `#7cc7b4`. The banner is a river-blue bar with a white title. Since ADR-300 the accent family is each venue's own; Kallang never had a gold phase to correct.
- **Motifs:** its own 175 generated sprites in its palette; all nine roles use shared sprites (`flag`, `chat`, `cone`, `bib`, `whistle`, `trophy`, `court`, `face`, `badge`); no venue-only grids in v1.
- **Backdrop:** one photographic plate of the Sports Hub waterfront (`public/themes/kallang/scene/backdrop-day.jpg`, 1920 x 1072, ~475 KB, content-stamped) on a full-height stage that crops around the stadium on narrow screens. Since ADR-306 the population is drawn by the source project's own animation engine, ported to `src/themes/kallang/engine/` and rendered on one canvas at the source's seed — clouds, tents and arch, promenade crowds with its four-phase gait, court players and balls, all eight boats with anchor-stitched paddles, wakes, per-station catch splashes and mapped water effects in its painter order. The served scene set is the plate plus the 91 sprites that engine can reference (including the four plain-kit `reach-right` idler gestures); dawn/dusk grades and the extraction pipeline remain left behind.
- **Styles:** `classic` and `fine` only; `?backdrop=` is ignored, as at Tessensohn.
- **Browser proof:** pending on the owner's stack (`PSD_VENUE=kallang`); unit contract is green.
