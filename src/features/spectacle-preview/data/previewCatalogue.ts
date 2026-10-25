export const ORB_DEMOS = [
  { key: 'orb-sides-outward', label: '2 orbs · out', pattern: 'sides', direction: 'outward' },
  { key: 'orb-sides-inward', label: '2 orbs · in', pattern: 'sides', direction: 'inward' },
  { key: 'orb-corners-outward', label: '4 orbs · out', pattern: 'corners', direction: 'outward' },
  { key: 'orb-corners-inward', label: '4 orbs · in', pattern: 'corners', direction: 'inward' },
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
