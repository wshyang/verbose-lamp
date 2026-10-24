import type { FrameArchetype } from '../../types/sequence';
import type { Motif } from './motifs';
import { monogramLetterPaths } from './recipes';

/**
 * One-sheet poster recipes (Addendum 0004).
 *
 * Five zones, reconstructed from the poster artwork: a fan crown with a ring
 * medallion, fluted pilasters down both edges, a stepped aperture around the
 * title, split rules for the billing band, and a skyline comb along the base.
 */
export interface PosterLayout {
  apertureHalfWidth: number;
  apertureHalfHeight: number;
  crownRingRadius: number;
  fanRadius: number;
  flutes: number;
  teeth: number;
  combHeight: number;
  /** Act I carries the GG signet in a central double ring instead of text */
  centreMedallionRadius: number;
}

const FAN_START_ANGLE = Math.PI;
const FAN_END_ANGLE = Math.PI * 1.5;
const FLUTE_PITCH = 0.15;
const COMB_PITCH = 0.19;

function apertureZone(layout: PosterLayout): Motif[] {
  const { apertureHalfWidth: aw, apertureHalfHeight: ah } = layout;
  return [
    { kind: 'ziggurat', halfWidth: aw, halfHeight: ah, step: 0.26, width: 0.062, depth: 0.12, z: 0.0, delay: 0.0, role: 'primary' },
    { kind: 'ziggurat', halfWidth: aw - 0.15, halfHeight: ah - 0.14, step: 0.22, width: 0.024, depth: 0.07, z: 0.05, delay: 0.08 },
    { kind: 'cutOctagon', halfWidth: aw + 0.18, halfHeight: ah + 0.17, cut: 0.44, width: 0.03, depth: 0.08, z: -0.22, delay: 0.13 },
  ];
}

function pilasterZone(layout: PosterLayout): Motif[] {
  const { apertureHalfWidth: aw, apertureHalfHeight: ah } = layout;
  return [
    {
      kind: 'flutedPilaster',
      startX: aw + 0.34,
      pitch: FLUTE_PITCH,
      count: layout.flutes,
      top: ah + 0.26,
      bottom: -ah - 0.26,
      taper: 0.09,
      width: 0.03,
      depth: 0.08,
      z: -0.1,
      delay: 0.16,
    },
  ];
}

function crownZone(layout: PosterLayout): Motif[] {
  const { apertureHalfWidth: aw, apertureHalfHeight: ah } = layout;
  const pilasterOuter = aw + 0.34 + (layout.flutes - 1) * FLUTE_PITCH;
  const crownY = ah + 0.42;
  const ringY = crownY + layout.crownRingRadius * 0.55;
  return [
    {
      kind: 'radialFan',
      centerX: pilasterOuter,
      centerY: crownY,
      innerRadius: 0.2,
      outerRadius: layout.fanRadius,
      ribs: 9,
      startAngle: FAN_START_ANGLE,
      endAngle: FAN_END_ANGLE,
      arcs: 3,
      width: 0.026,
      depth: 0.07,
      z: -0.16,
      delay: 0.2,
    },
    { kind: 'ring', centerX: 0, centerY: ringY, radius: layout.crownRingRadius, segments: 24, width: 0.032, depth: 0.08, z: 0.02, delay: 0.24 },
    { kind: 'ring', centerX: 0, centerY: ringY, radius: layout.crownRingRadius * 0.68, segments: 20, width: 0.02, depth: 0.06, z: 0.06, delay: 0.28 },
    { kind: 'splitRule', y: crownY, innerX: layout.crownRingRadius + 0.14, outerX: pilasterOuter - 0.1, width: 0.024, depth: 0.06, z: 0.04, delay: 0.22 },
  ];
}

function baseZone(layout: PosterLayout): Motif[] {
  const { apertureHalfHeight: ah } = layout;
  return [
    {
      kind: 'skylineComb',
      baseY: -ah - 0.3,
      startX: COMB_PITCH * 0.5,
      pitch: COMB_PITCH,
      teeth: layout.teeth,
      minHeight: 0.2,
      maxHeight: layout.combHeight,
      direction: 'down',
      width: 0.03,
      depth: 0.07,
      z: -0.08,
      delay: 0.26,
    },
    { kind: 'splitRule', y: -ah - 0.3, innerX: 0.0, outerX: layout.apertureHalfWidth + 0.2, width: 0.026, depth: 0.07, z: 0.0, delay: 0.24 },
  ];
}

function billingRules(layout: PosterLayout): Motif[] {
  const { apertureHalfWidth: aw, apertureHalfHeight: ah } = layout;
  return [
    { kind: 'splitRule', y: ah * 0.46, innerX: 0.0, outerX: aw - 0.3, width: 0.022, depth: 0.05, z: 0.07, delay: 0.17 },
    { kind: 'splitRule', y: -ah * 0.52, innerX: 0.0, outerX: aw - 0.3, width: 0.022, depth: 0.05, z: 0.07, delay: 0.19 },
  ];
}

function centreMedallion(layout: PosterLayout): Motif[] {
  if (layout.centreMedallionRadius <= 0) return [];
  const radius = layout.centreMedallionRadius;
  return [
    { kind: 'ring', centerX: 0, centerY: 0, radius, segments: 28, width: 0.05, depth: 0.1, z: 0.04, delay: 0.1 },
    { kind: 'ring', centerX: 0, centerY: 0, radius: radius * 0.86, segments: 24, width: 0.022, depth: 0.07, z: 0.08, delay: 0.15 },
    ...monogramLetterPaths(),
  ];
}

function layoutFor(archetype: FrameArchetype, mainWidth: number): PosterLayout {
  const wide = Math.max(4.3, mainWidth * 0.56 + 0.78);
  switch (archetype) {
    case 'monogram_gate':
      return { apertureHalfWidth: 2.9, apertureHalfHeight: 2.95, crownRingRadius: 0.4, fanRadius: 1.7, flutes: 5, teeth: 7, combHeight: 1.0, centreMedallionRadius: 1.32 };
    case 'ziggurat_chevron':
      return { apertureHalfWidth: wide, apertureHalfHeight: 1.72, crownRingRadius: 0.42, fanRadius: 1.5, flutes: 4, teeth: 6, combHeight: 0.9, centreMedallionRadius: 0 };
    case 'sunburst_octagon':
      return { apertureHalfWidth: wide, apertureHalfHeight: 1.88, crownRingRadius: 0.46, fanRadius: 1.65, flutes: 5, teeth: 7, combHeight: 0.95, centreMedallionRadius: 0 };
    case 'diamond_gateway':
      return { apertureHalfWidth: wide, apertureHalfHeight: 1.8, crownRingRadius: 0.44, fanRadius: 1.58, flutes: 4, teeth: 6, combHeight: 0.92, centreMedallionRadius: 0 };
    default:
      return { apertureHalfWidth: Math.max(4.45, mainWidth * 0.54 + 0.8), apertureHalfHeight: 2.16, crownRingRadius: 0.58, fanRadius: 1.95, flutes: 6, teeth: 9, combHeight: 1.2, centreMedallionRadius: 0 };
  }
}

export function posterRecipeFor(archetype: FrameArchetype, mainWidth: number): Motif[] {
  const layout = layoutFor(archetype, mainWidth);
  return [
    ...apertureZone(layout),
    ...billingRules(layout),
    ...pilasterZone(layout),
    ...crownZone(layout),
    ...baseZone(layout),
    ...centreMedallion(layout),
  ];
}
