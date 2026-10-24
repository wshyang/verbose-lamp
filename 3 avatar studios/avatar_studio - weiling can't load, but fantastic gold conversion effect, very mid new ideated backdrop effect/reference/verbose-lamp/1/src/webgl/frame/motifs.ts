import type { FrameRole, FrameSpec } from './types';

/**
 * Declarative Art Deco motif vocabulary (Addendum 0003).
 * A recipe is an ordered list of these; the interpreter turns each motif into
 * rails under a base genome. Field names are the parameters of each family.
 */
export interface StrokeStyle {
  width: number;
  depth: number;
  z: number;
  delay: number;
}

export interface CutOctagonMotif extends StrokeStyle {
  kind: 'cutOctagon';
  halfWidth: number;
  halfHeight: number;
  cut: number;
  role?: FrameRole;
}

export interface ZigguratMotif extends StrokeStyle {
  kind: 'ziggurat';
  halfWidth: number;
  halfHeight: number;
  step: number;
  role?: FrameRole;
}

export interface DiamondMotif extends StrokeStyle {
  kind: 'diamond';
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  partDir?: number;
}

export interface SunburstMotif extends StrokeStyle {
  kind: 'sunburst';
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
  rays: number;
  spread: number;
  direction: 'up' | 'down';
}

export interface SplitRuleMotif extends StrokeStyle {
  kind: 'splitRule';
  y: number;
  innerX: number;
  outerX: number;
}

export interface ChevronWingsMotif extends StrokeStyle {
  kind: 'chevronWings';
  startX: number;
  count: number;
  spacing: number;
  wingWidth: number;
  wingHeight: number;
}

/* ---------------- poster-family motifs (Addendum 0004) ---------------- */

/**
 * Polar grid anchored at a corner: straight ribs crossed by concentric arcs.
 * Specified for the right-hand corner; the emitter mirrors it.
 */
export interface RadialFanMotif extends StrokeStyle {
  kind: 'radialFan';
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
  ribs: number;
  /** sweep bounds in radians, measured from +x counter-clockwise */
  startAngle: number;
  endAngle: number;
  arcs: number;
}

/** Bundle of parallel vertical rails with alternating weight (reeded column). */
export interface FlutedPilasterMotif extends StrokeStyle {
  kind: 'flutedPilaster';
  startX: number;
  pitch: number;
  count: number;
  top: number;
  bottom: number;
  /** vertical shortening applied per flute outward */
  taper: number;
}

/** Graduated vertical teeth forming a stepped skyline silhouette. */
export interface SkylineCombMotif extends StrokeStyle {
  kind: 'skylineComb';
  baseY: number;
  startX: number;
  pitch: number;
  teeth: number;
  minHeight: number;
  maxHeight: number;
  direction: 'up' | 'down';
}

/** True circle, emitted as two half-arcs so draw-on and gate parting stay symmetric. */
export interface RingMotif extends StrokeStyle {
  kind: 'ring';
  centerX: number;
  centerY: number;
  radius: number;
  segments: number;
}

/** Literal geometry (monogram letters, keystone, spears): genome-invariant. */
export interface PathMotif {
  kind: 'path';
  spec: FrameSpec;
}

export type Motif =
  | CutOctagonMotif
  | ZigguratMotif
  | DiamondMotif
  | SunburstMotif
  | SplitRuleMotif
  | ChevronWingsMotif
  | RadialFanMotif
  | FlutedPilasterMotif
  | SkylineCombMotif
  | RingMotif
  | PathMotif;
