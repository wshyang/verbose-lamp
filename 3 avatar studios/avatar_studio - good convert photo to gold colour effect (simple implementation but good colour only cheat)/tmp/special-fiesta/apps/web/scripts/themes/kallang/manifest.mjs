/**
 * ADR-301 — The Kallang, as data for the generators. Everything a venue owns that the build
 * needs to know about sits here; everything the app needs at runtime is in
 * `src/themes/kallang/`. Same shape as Tessensohn's manifest.
 */
import { GRIDS } from './motifs.mjs';
import { RAMPS } from './palette.mjs';

export const MANIFEST = {
  id: 'kallang',
  ramps: RAMPS,
  grids: GRIDS,
  /** Repo-relative (from apps/web) stylesheets whose sprite URLs the generator keeps stamped. */
  stylesheets: ['src/themes/kallang/theme.css'],
  /**
   * No `scene`: the backdrop is one committed plate, not drawn by `generate-pixel.mjs`; see
   * `stamp-scene.mjs` and ADR-301 for its provenance.
   */
};
