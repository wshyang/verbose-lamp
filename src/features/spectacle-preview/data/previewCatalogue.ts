/**
 * The four configurations the plans call "orb transitions" are party-sparkler
 * transitions: two or four fiery sparkler heads fly out of, or into, a point
 * behind a gold flash (ADDENDUM-025 §3.3). The keys keep the `orb` name because
 * golden snapshots and the effect id use it; the labels are what people read.
 */
export const ORB_DEMOS = [
  { key: 'orb-sides-outward', label: '2 sparklers · out', pattern: 'sides', direction: 'outward' },
  { key: 'orb-sides-inward', label: '2 sparklers · in', pattern: 'sides', direction: 'inward' },
  { key: 'orb-corners-outward', label: '4 sparklers · out', pattern: 'corners', direction: 'outward' },
  { key: 'orb-corners-inward', label: '4 sparklers · in', pattern: 'corners', direction: 'inward' },
] as const;

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
