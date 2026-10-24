import type { BackdropPatternId, BackdropStyle, EnamelPalette, EnamelPaletteId } from '../model/types';

/** Jewel-tone enamels — colour lives inside the gold, never instead of it. */
export const ENAMEL_PALETTES: Readonly<Record<EnamelPaletteId, EnamelPalette>> = Object.freeze({
  peacock: { id: 'peacock', name: 'Peacock', enamels: ['#0f6b7a', '#1d3f8c', '#127a5a', '#3a2a7a'] },
  ruby: { id: 'ruby', name: 'Ruby & Onyx', enamels: ['#8c1027', '#2a0f18', '#b3263c', '#4a0d1e'] },
  jade: { id: 'jade', name: 'Imperial Jade', enamels: ['#1f7a4d', '#0e4a3a', '#5aa36b', '#164f45'] },
  midnight: { id: 'midnight', name: 'Midnight Lapis', enamels: ['#16245c', '#0a1233', '#2e4aa3', '#1b1a4a'] },
  sunset: { id: 'sunset', name: 'Riviera Sunset', enamels: ['#c2452d', '#7a1f5c', '#e08a2e', '#4a1a6b'] },
});

export const PATTERN_OPTIONS: readonly { readonly id: BackdropPatternId; readonly label: string }[] = [
  { id: 'sunburst', label: 'Sunburst' },
  { id: 'fan', label: 'Deco Fan' },
  { id: 'concentric', label: 'Medallion' },
  { id: 'waves', label: 'Riviera Waves' },
  { id: 'chevron', label: 'Chevron' },
];

/** Sensible band counts per pattern so switching pattern never looks broken. */
export const PATTERN_DEFAULT_BANDS: Readonly<Record<BackdropPatternId, number>> = Object.freeze({
  sunburst: 16,
  fan: 12,
  concentric: 8,
  waves: 9,
  chevron: 10,
});

export const DEFAULT_BACKDROP_STYLE: BackdropStyle = Object.freeze({
  pattern: 'sunburst',
  palette: 'peacock',
  bands: 16,
  twist: 2.4,
});
