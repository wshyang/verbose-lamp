/**
 * ADR-296 / ADR-297 — what every venue's `theme.css` must define. One list, read by the
 * completeness test today and by the theme registry's contract test once the TS theme module
 * lands, so "what a theme is" is written down once.
 */

/** Colours a venue owns. The stylesheets read these by role, never by a beach name. */
export const VENUE_COLOUR_TOKENS = [
  '--primary-deep',
  '--primary',
  '--primary-light',
  '--sky',
  '--scene-sky',
  '--surface',
  '--surface-deep',
  '--secondary',
  '--hot',
  '--hot-deep',
  '--hot-pale',
  '--accent',
  '--accent-deep',
  '--landmark',
] as const;

/**
 * ADR-298 — how a venue's backdrop sits on the screen. `--scene-aspect` is the art's width over
 * its height (a strip is wide, a plate is tall); `--scene-edge` is the flat colour either side of
 * a full-height plate, defined by every venue even when its own scene never shows it.
 */
export const SCENE_GEOMETRY_TOKENS = ['--scene-aspect', '--scene-edge'] as const;

/**
 * ADR-299 — the page banner. Its look is a venue's: a sand plate with a red, ink-outlined title
 * (Sentosa), or a blue bar with a white title (Tessensohn). Five tokens rather than two because
 * the title's outline and the frame are what keep it legible on that venue's scene.
 */
export const BANNER_TOKENS = [
  '--banner-bg',
  '--banner-bg-deep',
  '--banner-ink',
  '--banner-outline',
  '--banner-border',
] as const;

/** Derived from the colours above; still defined per venue so a venue may override the mix. */
export const VENUE_DERIVED_TOKENS = ['--live-flash'] as const;

/** The sprites `gameboy.css` places by CSS. Each is a `url(...)` into the venue's motifs. */
export const MOTIF_ROLE_TOKENS = [
  '--motif-cloud',
  '--motif-bunting',
  '--motif-shoreline',
  '--motif-coin',
  '--motif-stamp',
  '--motif-bullet',
  '--motif-empty',
  '--motif-loader',
] as const;

export const VENUE_TOKENS = [
  ...VENUE_COLOUR_TOKENS,
  ...SCENE_GEOMETRY_TOKENS,
  ...BANNER_TOKENS,
  ...VENUE_DERIVED_TOKENS,
  ...MOTIF_ROLE_TOKENS,
] as const;
