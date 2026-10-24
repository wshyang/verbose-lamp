import type { FrameArchetype } from '../../types/sequence';
import type { BaseGenome } from './genome';

/** Which architecture a card is built from (Addendum 0004). */
export type FrameFamily = 'sequence' | 'poster';

export interface Point2 {
  x: number;
  y: number;
}

/**
 * Non-rendering classification used by the engines.
 *  - primary:  the canonical silhouette plane, never removed
 *  - monogram: interlocked letters and their pinstripe, never removed
 *  - ornament: base decoration (simplifiable, echoed)
 *  - fractal:  recursive children from the base genome (simplifiable, never echoed)
 *  - echo/band/rosette: intricacy-derived ornament (Addendum 0002)
 */
export type FrameRole = 'primary' | 'monogram' | 'ornament' | 'fractal' | 'echo' | 'band' | 'rosette';

export interface FrameSpec {
  points: Point2[];
  closed?: boolean;
  width: number;
  depth: number;
  z: number;
  /** 0..0.7 draw-on stagger */
  delay: number;
  /** -1 left, +1 right, 0 auto by x sign */
  partDir?: number;
  role?: FrameRole;
}

/** The two orthogonal style axes: architecture (genome) and ornament density (intricacy). */
export interface FrameStyle {
  family: FrameFamily;
  intricacy: number;
  genome: BaseGenome;
}

export interface FrameGeometryRequest {
  archetype: FrameArchetype;
  mainWidth: number;
  /** 0..1, clamped; 0.50 is the frozen signature render */
  intricacy: number;
  /** defaults to the signature genome */
  genome?: BaseGenome;
  /** defaults to 'sequence', the original title-sequence architecture */
  family?: FrameFamily;
}

export interface FrameGeometryStats {
  intricacy: number;
  railCount: number;
  vertexCount: number;
  echoes: number;
  bands: number;
  rosettes: number;
  fractals: number;
  /** max |x| or |y| over all points */
  extent: number;
  extentX: number;
  extentY: number;
  /** vertical reach of the base architecture before ornament layering (camera framing) */
  baseExtentY: number;
}

export interface FrameGeometry {
  specs: FrameSpec[];
  stats: FrameGeometryStats;
}

export const SIGNATURE_INTRICACY = 0.5;

/** Horizontal envelope the camera frames with zero extra pull-back. */
export const SAFE_FRAME_EXTENT = 7.4;

/** Vertical base envelope with zero extra pull-back (signature max measured at 4.68). */
export const SAFE_FRAME_EXTENT_Y = 4.7;

/** Hard horizontal envelope used to cap echo scaling. */
export const MAX_FRAME_EXTENT = 8.2;

/** Supersedes 0002's 480 (Addendum 0003); the vertex cap is the GPU-meaningful limit. */
export const MAX_FRAME_RAILS = 1200;
export const MAX_BASE_RAILS = 720;
export const MAX_FRAME_VERTICES = 60_000;
