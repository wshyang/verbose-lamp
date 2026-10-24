/**
 * ADR-297 — Sentosa's venue-owned materials, light to dark, each with its own outline.
 *
 * Hexes marked (token) are `src/themes/sentosa/theme.css` values and must not drift from them.
 * See `scripts/motifs/base-palette.mjs` for how a cell is spelled and the authoring rules.
 */
export const RAMPS = {
  // sand
  s: { tones: ['#fff6e0', '#f5e2b8', '#d9b97c', '#ab8a52'], outline: '#5c4526' }, // (token) --sand
  // sea
  b: { tones: ['#a8dcff', '#61b3f2', '#2f7dd1', '#0a4f8f'], outline: '#06304f' }, // (token) --sea-light, --sea, --sea-deep
  // gold
  g: { tones: ['#ffe89b', '#ffc72c', '#d99a00', '#9a6a00'], outline: '#4a3200' }, // (token) --gold
  // red / sunset
  r: { tones: ['#ff8f74', '#e8483f', '#b02f2c', '#7a1f1f'], outline: '#3f1220' }, // (token) --sunset
  // palm green
  p: { tones: ['#5fdcbe', '#2bbfa8', '#1b998b', '#0d6459'], outline: '#06342f' }, // (token) --palm
  // merlion stone
  m: { tones: ['#e2f4ec', '#9fd6c4', '#6fb9a5', '#47897a'], outline: '#234a44' }, // (token) --merlion
};
