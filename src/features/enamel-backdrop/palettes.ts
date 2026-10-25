import type { BackdropKind, BackdropPattern, BackdropPreset, BackdropSpec, EnamelPalette, InlayStyle, KnobRange, SpecKnob } from './types';

/** Five Jazz-Age enamel families (ADDENDUM-017). Frozen; never mutated at runtime (CLAUDE.md §4). */
const CLASSIC_PALETTES = [
  { id: 'emerald-ballroom', name: 'Emerald Ballroom', colourOne: '#0f5c4a', colourTwo: '#1f8a70', ground: '#06221c' },
  { id: 'daisys-sapphire', name: "Daisy's Sapphire", colourOne: '#163a7a', colourTwo: '#3a74c4', ground: '#0a1630' },
  { id: 'gatsby-ruby', name: 'Gatsby Ruby', colourOne: '#7a1424', colourTwo: '#b8323f', ground: '#2a070d' },
  { id: 'klimt-leaf', name: 'Klimt Leaf', colourOne: '#7a5a12', colourTwo: '#1e6b6b', ground: '#1f1806' },
  { id: 'midnight-jet', name: 'Midnight Jet', colourOne: '#0b0a10', colourTwo: '#2b2340', ground: '#050407' },
] as const satisfies readonly EnamelPalette[];

/** Four-tone jewel enamels from avatar-studio implementation B, in B's band order (ADDENDUM-019). */
const JEWEL_PALETTES = [
  { id: 'peacock', name: 'Peacock', colourOne: '#0f6b7a', accents: ['#1d3f8c', '#127a5a'], colourTwo: '#3a2a7a', ground: '#071c22' },
  { id: 'ruby-onyx', name: 'Ruby & Onyx', colourOne: '#8c1027', accents: ['#2a0f18', '#b3263c'], colourTwo: '#4a0d1e', ground: '#16060b' },
  { id: 'imperial-jade', name: 'Imperial Jade', colourOne: '#1f7a4d', accents: ['#0e4a3a', '#5aa36b'], colourTwo: '#164f45', ground: '#06201a' },
  { id: 'midnight-lapis', name: 'Midnight Lapis', colourOne: '#16245c', accents: ['#0a1233', '#2e4aa3'], colourTwo: '#1b1a4a', ground: '#05091a' },
  { id: 'riviera-sunset', name: 'Riviera Sunset', colourOne: '#c2452d', accents: ['#7a1f5c', '#e08a2e'], colourTwo: '#4a1a6b', ground: '#22091c' },
] as const satisfies readonly EnamelPalette[];

export const ENAMEL_PALETTES: readonly EnamelPalette[] = Object.freeze([...CLASSIC_PALETTES, ...JEWEL_PALETTES]);

/** Reference defaults per pattern (`schemas.ts` DEFAULT_*), plus B's fan. */
export const DEFAULT_PATTERNS: Readonly<{ [K in BackdropKind]: Extract<BackdropPattern, { kind: K }> }> = Object.freeze({
  sunburst: { kind: 'sunburst', rays: 12, twist: 4 },
  radiance: { kind: 'radiance', shape: 2, ringWidth: 8, lobes: 6, lobeDepth: 2 },
  chevron: { kind: 'chevron', wave: 1, period: 24, amplitude: 4, bandHeight: 8 },
  swirl: { kind: 'swirl', swirl: 1, frequency: 2, ripple: 6, scale: 8 },
  fan: { kind: 'fan', rays: 12, lift: 2 },
});

export const PATTERN_LABELS: Readonly<Record<BackdropKind, string>> = Object.freeze({
  sunburst: 'Sunburst',
  radiance: 'Radiance',
  chevron: 'Chevron',
  swirl: 'Swirl',
  fan: 'Deco Fan',
});

export const INLAY_LABELS: Readonly<Record<InlayStyle, string>> = Object.freeze({
  cloisonne: 'Cloisonné',
  'gilded-bands': 'Gold-leaf bands',
});

/** Slider ranges, read off the reference `schemas.ts` (fan ranges chosen for this house). */
export const PATTERN_KNOBS: Readonly<Record<BackdropKind, readonly KnobRange[]>> = Object.freeze({
  sunburst: [
    { key: 'rays', label: 'Rays', min: 3, max: 24, step: 1 },
    { key: 'twist', label: 'Twist', min: 0, max: 10, step: 1 },
  ],
  radiance: [
    { key: 'shape', label: 'Ring shape', min: 1, max: 4, step: 1 },
    { key: 'ringWidth', label: 'Ring width', min: 4, max: 14, step: 1 },
    { key: 'lobes', label: 'Petals', min: 0, max: 12, step: 1 },
    { key: 'lobeDepth', label: 'Petal depth', min: 0, max: 5, step: 1 },
  ],
  chevron: [
    { key: 'wave', label: 'Stitch', min: 1, max: 2, step: 1 },
    { key: 'period', label: 'Period', min: 12, max: 48, step: 1 },
    { key: 'amplitude', label: 'Swing', min: 0, max: 7, step: 1 },
    { key: 'bandHeight', label: 'Band height', min: 6, max: 16, step: 1 },
  ],
  swirl: [
    { key: 'swirl', label: 'Arms', min: 0, max: 6, step: 1 },
    { key: 'frequency', label: 'Ripple count', min: 1, max: 5, step: 1 },
    { key: 'ripple', label: 'Ripple', min: 0, max: 10, step: 1 },
    { key: 'scale', label: 'Scale', min: 4, max: 14, step: 1 },
  ],
  fan: [
    { key: 'rays', label: 'Rays', min: 4, max: 24, step: 1 },
    { key: 'lift', label: 'Hub depth', min: 0, max: 8, step: 1 },
  ],
});

export const SPEC_KNOBS: Readonly<Record<SpecKnob, KnobRange>> = Object.freeze({
  bands: { key: 'bands', label: 'Bands', min: 2, max: 4, step: 1 },
  gilt: { key: 'gilt', label: 'Gilt glaze', min: 0, max: 1, step: 0.05 },
  wireWidth: { key: 'wireWidth', label: 'Wire width', min: 0.3, max: 2.5, step: 0.1 },
  leafDensity: { key: 'leafDensity', label: 'Gold leaf', min: 0, max: 1, step: 0.05 },
  guilloche: { key: 'guilloche', label: 'Guilloché', min: 0, max: 1, step: 0.05 },
});

const FINISH = { gilt: 0.35, wireWidth: 1, leafDensity: 0.3, rampId: 'bright' } as const;

function preset(id: string, name: string, spec: Omit<BackdropSpec, keyof typeof FINISH>): BackdropPreset {
  return Object.freeze({ id, name, spec: Object.freeze({ ...spec, ...FINISH }) });
}

const [emerald, sapphire, ruby, klimt] = CLASSIC_PALETTES;

/** One named preset per reference pattern. The first is the studio default (and Wei_Ling's). */
export const DEFAULT_BACKDROPS: readonly BackdropPreset[] = Object.freeze([
  preset('emerald-sunburst', 'Emerald Ballroom Sunburst', { pattern: DEFAULT_PATTERNS.sunburst, colourOne: emerald.colourOne, colourTwo: emerald.colourTwo, bands: 2 }),
  preset('sapphire-radiance', "Daisy's Sapphire Radiance", { pattern: DEFAULT_PATTERNS.radiance, colourOne: sapphire.colourOne, colourTwo: sapphire.colourTwo, bands: 3 }),
  preset('ruby-chevron', 'Gatsby Ruby Chevron', { pattern: DEFAULT_PATTERNS.chevron, colourOne: ruby.colourOne, colourTwo: ruby.colourTwo, bands: 3 }),
  preset('klimt-swirl', 'Klimt Leaf Swirl', { pattern: DEFAULT_PATTERNS.swirl, colourOne: klimt.colourOne, colourTwo: klimt.colourTwo, bands: 3 }),
]);

const JEWEL_FINISH = { bands: 4, gilt: 0.2, wireWidth: 0.9, leafDensity: 0.2, rampId: 'bright' } as const;

interface JewelLook {
  readonly palette: EnamelPalette & { readonly accents: readonly string[] };
  readonly pattern: BackdropPattern;
  readonly inlay: InlayStyle;
  readonly guilloche: number;
}

function jewel(id: string, name: string, look: JewelLook): BackdropPreset {
  const { palette, ...rest } = look;
  const spec: BackdropSpec = { ...JEWEL_FINISH, ...rest, colourOne: palette.colourOne, colourTwo: palette.colourTwo, accents: palette.accents };
  return Object.freeze({ id, name, spec: Object.freeze(spec) });
}

const [peacock, rubyOnyx, jade, lapis, sunset] = JEWEL_PALETTES;

/** Jewel-box styles in the manner of implementation B: four-tone enamel, gold-leaf bands, guilloché. */
export const JEWEL_BACKDROPS: readonly BackdropPreset[] = Object.freeze([
  jewel('peacock-fan', 'Peacock Deco Fan', { palette: peacock, pattern: DEFAULT_PATTERNS.fan, inlay: 'gilded-bands', guilloche: 0.6 }),
  jewel('sunset-sunburst', 'Riviera Sunset Sunburst', { palette: sunset, pattern: { kind: 'sunburst', rays: 8, twist: 2 }, inlay: 'gilded-bands', guilloche: 0.5 }),
  jewel('jade-medallion', 'Imperial Jade Medallion', { palette: jade, pattern: { kind: 'radiance', shape: 2, ringWidth: 6, lobes: 8, lobeDepth: 1 }, inlay: 'cloisonne', guilloche: 0.7 }),
  jewel('lapis-chevron', 'Midnight Lapis Chevron', { palette: lapis, pattern: { kind: 'chevron', wave: 1, period: 20, amplitude: 5, bandHeight: 7 }, inlay: 'gilded-bands', guilloche: 0.5 }),
  jewel('onyx-swirl', 'Ruby & Onyx Swirl', { palette: rubyOnyx, pattern: { kind: 'swirl', swirl: 2, frequency: 2, ripple: 5, scale: 7 }, inlay: 'cloisonne', guilloche: 0.45 }),
]);

/** Everything the Style row offers: the classic presets first, then the jewel styles. */
export const BACKDROP_PRESETS: readonly BackdropPreset[] = Object.freeze([...DEFAULT_BACKDROPS, ...JEWEL_BACKDROPS]);
