/**
 * ADR-070 / ADR-297 — the venue-independent four-tone ramps every theme's motifs are drawn from.
 *
 * Each material is a letter and four tones, light to dark, plus its own outline. A grid cell is
 * `<letter><tone>`: `r1` is the red highlight, `r3` its shadow, `r0` the red contour. Tone 2 is
 * the base — the colour the material "is".
 *
 * The venue-owned materials (sand `s`, sea `b`, gold `g`, sunset `r`, palm `p`, merlion `m`) are
 * NOT here: they live in `scripts/themes/<id>/palette.mjs`, because they are what makes a venue
 * look like itself. A theme's corpus is `{ ...BASE_RAMPS, ...theme.ramps }`; a theme may redefine
 * any base letter too, but a base ramp that every theme shares should stay here.
 *
 * Tones marked (token) in a theme's palette are `themes/<id>/theme.css` values and must not
 * drift from them. The two PSD brand colours (`d`, `x`) are sampled from
 * `images/ingest/PSD_logo-01-320x320.png` and are deliberately NOT tokens — they belong to the
 * mark, not to the design system, and so do not change with the venue.
 *
 * Authoring rules these ramps assume (docs/design/motif-catalogue.md §1):
 *   - tone 2 holds the largest area; tone 1 and tone 4 are accents of >= 3px or a 2x2 block
 *   - tone 1 never touches tone 4
 *   - one key light, upper left: tone 1 on upper-left rims, tone 4 in lower-right contact shadow
 *   - engraved detail jumps two steps or uses tone 0, never the neighbouring tone
 */
export const BASE_RAMPS = {
  // ink — for type, engraving and anything that is genuinely a line
  k: { tones: ['#3c5a78', '#12243a', '#0b1726', '#060d15'], outline: '#12243a' }, // (token) --ink-soft, --ink
  // paper / white
  w: { tones: ['#ffffff', '#fdfaf2', '#dfe5ee', '#b0bccb'], outline: '#4a5a6e' }, // (token) --paper
  // wood / rattan
  t: { tones: ['#cf9f63', '#a9743c', '#7a4a24', '#4d2c12'], outline: '#26170c' },
  // steel / chrome
  c: { tones: ['#f4f8fc', '#c8d6e5', '#8da4bb', '#5b7288'], outline: '#2b3a4d' },
  // pink
  n: { tones: ['#ffd6ea', '#ff9ecd', '#d1699f', '#92406d'], outline: '#47203a' },
  // orange
  o: { tones: ['#ffc38f', '#ff8c42', '#d9641c', '#99430f'], outline: '#4a2210' },
  // purple
  v: { tones: ['#d2aef2', '#a06cd5', '#7344a8', '#4a2a70'], outline: '#261541' },
  // turf
  l: { tones: ['#d2f79a', '#a8e05f', '#79b73c', '#4e7a26'], outline: '#26401a' },
  /*
   * Three skin ramps. Any motif with a hand or a figure in it needs these: `face` borrowed the
   * sand ramp back when it was the only such sprite, and that trick does not survive a second
   * one. Three tones of range rather than one, because a corpus of people drawn in a single
   * skin tone is a corpus that says something it did not mean to.
   */
  f: { tones: ['#ffe0c4', '#f3c9a0', '#cf9f76', '#a3714c'], outline: '#5c3a22' },
  q: { tones: ['#e8b98c', '#c98d5e', '#a06a3f', '#714629'], outline: '#3f2413' },
  h: { tones: ['#b57f52', '#8a5a35', '#603c22', '#3d2513'], outline: '#231409' },
  // PSD navy — sampled from the mark, not a token
  d: { tones: ['#4a90c0', '#1a6291', '#004069', '#002b47'], outline: '#001a2e' },
  // PSD crimson — sampled from the mark, not a token
  x: { tones: ['#f4657c', '#cc0733', '#9c0026', '#6b001b'], outline: '#37000f' },
};
