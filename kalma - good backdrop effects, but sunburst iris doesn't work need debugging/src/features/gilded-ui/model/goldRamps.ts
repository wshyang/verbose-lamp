/** One ramp source for gilded photos and gilded UI (ADDENDUM-020 §3.8). */
export const GOLD_RAMPS = {
  classic: ['#241503', '#6e4d1c', '#b98a3a', '#f4c95d', '#fff3c4'],
  champagne: ['#2a2010', '#7a6335', '#c2a568', '#efd9a0', '#fffbe8'],
  brass: ['#1d1406', '#775320', '#a98a58', '#ba9c72', '#e9d6a6'],
  ember: ['#2a0f03', '#7a3a10', '#c2762a', '#f2b04a', '#ffe8b0'],
} as const;

export type GoldRampId = keyof typeof GOLD_RAMPS;