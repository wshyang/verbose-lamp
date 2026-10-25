import type { DecoLatticeRequest } from './composition';

/** Reproduces the tutorial's measured proportions (half-extent 1, ±0.03). */
export const SPOONER_MEDALLION: DecoLatticeRequest = {
  mode: 'medallion', hw: 1, hh: 1, seed: 1925, density: 0.7, level: 4,
} as const;

export const PREMIERE_FRAME: DecoLatticeRequest = {
  mode: 'frame', hw: 1.78, hh: 1, seed: 1925, density: 0.6, level: 4,
} as const;

export const INVITATION_PANEL: DecoLatticeRequest = {
  mode: 'frame', hw: 1, hh: 1.4, seed: 1925, density: 0.5, level: 3,
} as const;

export const SCREEN_PROSCENIUM: DecoLatticeRequest = {
  mode: 'frame', hw: 2.4, hh: 1, seed: 1925, density: 0.5, level: 2,
} as const;

export const LATTICE_PRESETS = [
  { id: 'spooner-medallion', label: 'Spooner Medallion', request: SPOONER_MEDALLION },
  { id: 'premiere-frame', label: 'Premiere Frame', request: PREMIERE_FRAME },
  { id: 'invitation-panel', label: 'Invitation Panel', request: INVITATION_PANEL },
  { id: 'screen-proscenium', label: 'Screen Proscenium', request: SCREEN_PROSCENIUM },
] as const;