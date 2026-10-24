/**
 * ADR-297 — a theme's motif corpus: the shared grids and base ramps, plus whatever the theme
 * itself draws and colours. Pure, no I/O beyond the static imports below.
 *
 * Callers (generator, review sheet, drift test, a unit test with a made-up venue) all go through
 * `corpusFor`, so "what is in this theme's set" has exactly one definition.
 */
import { BASE_RAMPS } from './base-palette.mjs';
import { GRIDS as BEACH_AND_SEA } from './grids/beach-and-sea.mjs';
import { GRIDS as CAPTAINS_BALL } from './grids/captains-ball.mjs';
import { GRIDS as EVENT_CORE } from './grids/event-core.mjs';
import { GRIDS as FOOD } from './grids/food.mjs';
import { GRIDS as PEOPLE } from './grids/people.mjs';
import { GRIDS as SPORTS } from './grids/sports.mjs';
import { GRIDS as UI_GLYPHS } from './grids/ui-glyphs.mjs';

/** Sprites every theme draws, in its own palette. */
export const SHARED_GRIDS = {
  ...UI_GLYPHS,
  ...EVENT_CORE,
  ...BEACH_AND_SEA,
  ...SPORTS,
  ...CAPTAINS_BALL,
  ...PEOPLE,
  ...FOOD,
};

/**
 * `{ ramps, grids }` for one theme (`theme.ramps` and `theme.grids` are the theme's own). A theme
 * may colour new materials or recolour a base letter; it may not redraw a shared sprite under the
 * same name, because two grids for one name would make "the same sprite" mean two things.
 */
export function corpusFor(theme) {
  const clash = Object.keys(theme.grids).filter((name) => name in SHARED_GRIDS);
  if (clash.length > 0) {
    throw new Error(`theme grids redraw shared sprites: ${clash.join(', ')}`);
  }
  return {
    ramps: { ...BASE_RAMPS, ...theme.ramps },
    grids: { ...SHARED_GRIDS, ...theme.grids },
  };
}
