import { SIGNATURE_INTRICACY, clampIntricacy } from '../webgl/frame';

export interface FramePreset {
  id: 'restrained' | 'signature' | 'ornate' | 'extravagant' | 'maximal';
  label: string;
  value: number;
  description: string;
}

export const FRAME_PRESETS: FramePreset[] = [
  {
    id: 'restrained',
    label: 'Restrained',
    value: 0.1,
    description: 'Essential plate and monogram, with the outer ornament pared back.',
  },
  {
    id: 'signature',
    label: 'Signature',
    value: SIGNATURE_INTRICACY,
    description: 'The original frame, unchanged — this is the reference render.',
  },
  {
    id: 'ornate',
    label: 'Ornate',
    value: 0.7,
    description: 'Adds a first ring of scaled echo rails and engraved rule companions.',
  },
  {
    id: 'extravagant',
    label: 'Extravagant',
    value: 0.85,
    description: 'Three receding echo frames, double rules and corner rosettes.',
  },
  {
    id: 'maximal',
    label: 'Maximal',
    value: 1,
    description: 'The full derivation: four echoes, double bands and triple rosettes.',
  },
];

const signaturePreset = FRAME_PRESETS.find((preset) => preset.id === 'signature');
export const SIGNATURE_PRESET: FramePreset = signaturePreset ?? FRAME_PRESETS[1];

export function formatIntricacyPercent(value: number): string {
  return `${Math.round(clampIntricacy(value) * 100)}%`;
}

export function isSignatureSetting(value: number): boolean {
  return Math.abs(clampIntricacy(value) - SIGNATURE_INTRICACY) < 1e-9;
}

export function getIntricacyTier(value: number): string {
  const clamped = clampIntricacy(value);
  if (isSignatureSetting(clamped)) return 'Signature';
  if (clamped < 0.3) return 'Restrained';
  if (clamped < 0.6) return 'Signature variant';
  if (clamped < 0.8) return 'Ornate';
  if (clamped < 0.95) return 'Extravagant';
  return 'Maximal';
}

export function findActivePreset(value: number): FramePreset | undefined {
  return FRAME_PRESETS.find(
    (preset) => Math.abs(preset.value - clampIntricacy(value)) < 1e-9
  );
}
