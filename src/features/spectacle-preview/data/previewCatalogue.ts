export const SPARKLER_DEMOS = [
  { key: 'sparkler-sides-outward', label: '2 sparklers · out', pattern: 'sides', direction: 'outward' },
  { key: 'sparkler-sides-inward', label: '2 sparklers · in', pattern: 'sides', direction: 'inward' },
  { key: 'sparkler-corners-outward', label: '4 sparklers · out', pattern: 'corners', direction: 'outward' },
  { key: 'sparkler-corners-inward', label: '4 sparklers · in', pattern: 'corners', direction: 'inward' },
] as const;

/** Legacy spelling (ADDENDUM-025): the "orbs" were party sparklers all along. */
export const ORB_DEMOS = SPARKLER_DEMOS;

export const SUNBURST_DEMOS = [
  { key: 'sunburst-iris', label: 'Sunburst iris', variant: 'iris' },
  { key: 'sunburst-fan', label: 'Deco fan', variant: 'fan' },
] as const;

export const DEFAULT_NAV_LINES = [
  '🏛️,Foyer',
  '🎷,Program',
  '🎰,Lucky Draw',
  '🥂,Toast',
  '📸,Gallery',
].join('\n');
