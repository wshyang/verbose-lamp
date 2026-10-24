import type { ArtPalette } from '../types';

/**
 * ADDENDUM-017 — the enamels the gold plate is inlaid with.
 *
 * The source app's backdrops were flat psychedelic colour on a plain ground. Here the
 * ground is gold, and these are the colours of the art laid into it — the glazes of a
 * cloisonné piece rather than the light of a discotheque.
 *
 * Four colours each: the bands cycle through them, so a four-band pattern uses one
 * colour per band and a three-band pattern repeats the first.
 */

export const ART_PALETTES: readonly ArtPalette[] = Object.freeze([
  Object.freeze({
    id: 'faience',
    name: 'Faience',
    colours: Object.freeze(['#1f5f8b', '#2e9bb0', '#d96f32', '#f2e3c4']),
  }),
  Object.freeze({
    id: 'bargello',
    name: 'Bargello',
    colours: Object.freeze(['#8c1c2b', '#1d6b4f', '#f4ead0', '#22407d']),
  }),
  Object.freeze({
    id: 'orpiment',
    name: 'Orpiment',
    colours: Object.freeze(['#b5651d', '#e0a526', '#f6e2b3', '#6b4a1f']),
  }),
  Object.freeze({
    id: 'cameo',
    name: 'Cameo',
    colours: Object.freeze(['#c96a86', '#e7a0a0', '#f7dcc4', '#5c2b45']),
  }),
  Object.freeze({
    id: 'verdigris',
    name: 'Verdigris',
    colours: Object.freeze(['#2f6b5f', '#5fa08c', '#e8dcc0', '#1d4438']),
  }),
]);

export function artPaletteById(id: string): ArtPalette {
  return ART_PALETTES.find((palette) => palette.id === id) ?? ART_PALETTES[0];
}
