/**
 * ADR-294 / ADR-297 — Sentosa, as data for the generators. Everything a venue owns that the
 * build needs to know about sits here; everything the app needs at runtime is in
 * `src/themes/sentosa/`.
 *
 * To add a venue, copy this shape: an id, the materials that make it look like itself (`ramps`),
 * the sprites only it draws (`grids`), and the stylesheets that name its sprites by URL.
 */
import { GRIDS } from './motifs.mjs';
import { RAMPS } from './palette.mjs';

export const MANIFEST = {
  id: 'sentosa',
  ramps: RAMPS,
  grids: GRIDS,
  /** Repo-relative (from apps/web) stylesheets whose sprite URLs the generator keeps stamped. */
  stylesheets: ['src/themes/sentosa/theme.css'],
  /**
   * ADR-298 — the pixel scene. `compose` is a path, relative to this theme's directory, to a module
   * exporting `SCENE` ({ id, size, componentName, playerPeriods, compose(scale) }). It is a path
   * rather than an import so that loading a manifest for its palette stays cheap and does not draw
   * a panorama. A venue with no pixel scene omits this field.
   */
  scene: { compose: 'scene/compose.mjs' },
};
