/**
 * ADR-301 — The Kallang's venue-owned materials, light to dark, each with its own outline.
 *
 * The Sports Hub waterfront family: river blue in place of Sentosa's sea, stadium red in
 * place of sunset red, promenade stone in place of sand, park green in place of palm, and
 * the National Stadium's dome silver in place of merlion stone. The letters are the same
 * six as every venue's (`s b g r p m`), because every shared sprite is drawn in them; a
 * venue changes what the letters MEAN, not which letters exist. See
 * `scripts/motifs/base-palette.mjs` for how a cell is spelled and the authoring rules.
 *
 * `src/themes/kallang/theme.css` carries the matching UI tokens and a test keeps the two
 * from drifting.
 */
export const RAMPS = {
  // promenade stone — the panels' material (Sentosa: sand)
  s: { tones: ['#f2eee3', '#ddd5c0', '#b8ab8d', '#8a7c5f'], outline: '#4c4230' },
  // river blue — the title bar (Sentosa: sea)
  b: { tones: ['#9cc8ec', '#5b9bd5', '#1f6fb4', '#17375e'], outline: '#0a2142' },
  // gold — the colour of trophies and coins in the shared sprites (kept, as every venue keeps it)
  g: { tones: ['#ffe89b', '#ffc72c', '#d99a00', '#9a6a00'], outline: '#4a3200' },
  // stadium red — the seats and the dragon boats (Sentosa: sunset red)
  r: { tones: ['#f0967e', '#d8553a', '#b03324', '#701c10'], outline: '#3d1008' },
  // park green — the Kallang park connector (Sentosa: palm)
  p: { tones: ['#a9d69b', '#69b877', '#3f9155', '#256b3a'], outline: '#12331d' },
  // dome silver — the National Stadium roof (Sentosa: merlion stone)
  m: { tones: ['#eef1f4', '#ccd3d9', '#97a3ad', '#5f6d78'], outline: '#2b343c' },
};
