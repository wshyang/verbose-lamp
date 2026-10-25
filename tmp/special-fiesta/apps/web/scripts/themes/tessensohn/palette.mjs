/**
 * ADR-299 — Tessensohn's venue-owned materials, light to dark, each with its own outline.
 *
 * Where Sentosa's are warm (sand, sea, palm, merlion stone), these are the cool, urban family of
 * CSC @ Tessensohn: a pale blue-grey in place of sand, a deeper institutional blue in place of
 * the sea, lawn green in place of palm, and terracotta in place of sunset red (the paving
 * outside the building). Gold is kept: it is the colour of the buttons in the mockup.
 *
 * The letters are the same six as Sentosa's (`s b g r p m`), because every shared sprite is drawn
 * in them; a venue changes what the letters MEAN, not which letters exist. See
 * `scripts/motifs/base-palette.mjs` for how a cell is spelled and the authoring rules.
 *
 * Values are sampled from region medians of the mockup and the aerial photograph, so they are
 * indicative; `src/themes/tessensohn/theme.css` carries the matching UI tokens and a test keeps
 * the two from drifting.
 */
export const RAMPS = {
  // pale blue-grey — the panels' material (Sentosa: sand)
  s: { tones: ['#eef4f6', '#cddbde', '#9fb4ba', '#6f868e'], outline: '#34464c' },
  // institutional blue — the title bar (Sentosa: sea)
  b: { tones: ['#9cc4e6', '#4f94cf', '#2372bc', '#143b6a'], outline: '#0a2142' },
  // gold — kept: the buttons in the mockup are gold
  g: { tones: ['#ffe89b', '#ffc72c', '#d99a00', '#9a6a00'], outline: '#4a3200' },
  // terracotta — the plaza paving (Sentosa: sunset red)
  r: { tones: ['#ee9a7e', '#c8553d', '#9a3b28', '#6b2519'], outline: '#3a130c' },
  // lawn green — the field beside the building (Sentosa: palm)
  p: { tones: ['#a8d080', '#5fa84a', '#3f8f4a', '#255a2e'], outline: '#102c17' },
  // facade silver — the diamond-faceted panels (Sentosa: merlion stone)
  m: { tones: ['#e6eaee', '#b9c1ca', '#8791a0', '#5a6574'], outline: '#262d38' },
};
