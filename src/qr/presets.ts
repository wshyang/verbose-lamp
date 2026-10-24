import type { QrPreset } from './types';

/**
 * Deterministic, domain-realistic starting points. Kept module-local rather than in
 * `src/data/` so the QR feature can be lifted out wholesale; see ADDENDUM-013.
 */
export const QR_PRESETS: readonly QrPreset[] = Object.freeze([
  {
    id: 'west-egg-gala',
    name: 'West Egg Gala Invitation',
    text: 'https://github.com/wshyang/verbose-lamp',
    caption: 'ADMIT ONE · WEST EGG',
    errorCorrection: 'Q',
  },
  {
    id: 'green-light',
    name: 'The Green Light (Chapter IX)',
    text: 'So we beat on, boats against the current, borne back ceaselessly into the past.',
    caption: 'F. SCOTT FITZGERALD · MCMXXV',
    errorCorrection: 'M',
  },
  {
    id: 'speakeasy-wifi',
    name: 'Speakeasy Wi-Fi Card',
    text: 'WIFI:T:WPA;S:Speakeasy;P:OldSport1922;;',
    caption: 'PASSWORD WITHIN · SPEAK EASY',
    errorCorrection: 'H',
  },
  {
    id: 'east-egg-exchange',
    name: 'East Egg Telephone Exchange',
    text: 'tel:+15550101922',
    caption: 'EAST EGG EXCHANGE · 1922',
    errorCorrection: 'M',
  },
] as const);

export const QR_ERROR_CORRECTION_OPTIONS = Object.freeze([
  { level: 'L', label: 'Light', recovery: '7%' },
  { level: 'M', label: 'Medium', recovery: '15%' },
  { level: 'Q', label: 'Quartile', recovery: '25%' },
  { level: 'H', label: 'High', recovery: '30%' },
] as const);

export const QR_SHAPE_OPTIONS = Object.freeze([
  { shape: 'plaque', label: 'Plaque' },
  { shape: 'diamond', label: 'Diamond' },
  { shape: 'dot', label: 'Pearl' },
] as const);

export const MAX_QR_CAPTION_LENGTH = 40;
