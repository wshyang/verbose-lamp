/**
 * ADR-299 — CSC @ Tessensohn, as data for the generators. Everything a venue owns that the build
 * needs to know about sits here; everything the app needs at runtime is in
 * `src/themes/tessensohn/`. Same shape as Sentosa's manifest.
 */
import { GRIDS } from './motifs.mjs';
import { RAMPS } from './palette.mjs';

export const MANIFEST = {
  id: 'tessensohn',
  ramps: RAMPS,
  grids: GRIDS,
  /** Repo-relative (from apps/web) stylesheets whose sprite URLs the generator keeps stamped. */
  stylesheets: ['src/themes/tessensohn/theme.css'],
  /**
   * No `scene`: the backdrop is CSC's own committed files, not drawn by `generate-pixel.mjs`; see
   * `stamp-scene.mjs` and docs/design/tessensohn-scene-credits.md.
   */
};
