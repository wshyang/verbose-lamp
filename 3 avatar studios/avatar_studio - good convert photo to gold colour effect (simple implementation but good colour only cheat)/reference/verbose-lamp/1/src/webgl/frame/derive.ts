import { clampGenome, SIGNATURE_GENOME } from './genome';
import { buildBaseOrnaments } from './interpret';
import { emitDiamond } from './primitives';
import {
  FrameGeometry,
  FrameGeometryRequest,
  FrameGeometryStats,
  FrameRole,
  FrameSpec,
  MAX_FRAME_EXTENT,
  MAX_FRAME_RAILS,
  MAX_FRAME_VERTICES,
  SIGNATURE_INTRICACY,
} from './types';

const PROFILE_VERTICES = 6;
const MAX_DELAY = 0.7;
const MIN_MONOGRAM_HEIGHT = 1.4;
const MONOGRAM_MAX_ABS_X = 1.2;
const SIMPLIFY_BASE_RADIUS = 1.15;
const SIMPLIFY_BASE_MIN_LENGTH = 0.9;
const ECHOES_AT_FULL = 4;
const BAND_MIN_LENGTH = 1.4;
const BAND_OFFSET_FACTOR = 2.2;
const BAND_WIDTH_FACTOR = 0.45;
const ROSETTE_TWO_RINGS = 0.8;
const ROSETTE_THREE_RINGS = 0.93;
const ROSETTE_MAX_RADIUS = 0.5;

export function clampIntricacy(value: number): number {
  if (!Number.isFinite(value)) return SIGNATURE_INTRICACY;
  return Math.min(1, Math.max(0, value));
}

export function isSignatureIntricacy(value: number): boolean {
  return Math.abs(clampIntricacy(value) - SIGNATURE_INTRICACY) < 1e-9;
}

/* ------------------------------- measurements ------------------------------- */

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(spec: FrameSpec): number {
  const { points } = spec;
  if (points.length < 2) return 0;
  const segments = spec.closed ? points.length : points.length - 1;
  let total = 0;
  for (let index = 0; index < segments; index += 1) {
    total += distance(points[index], points[(index + 1) % points.length]);
  }
  return total;
}

export function centroidAbsX(spec: FrameSpec): number {
  const sum = spec.points.reduce((accumulator, point) => accumulator + point.x, 0);
  return Math.abs(sum / Math.max(1, spec.points.length));
}

function verticalSpan(spec: FrameSpec): number {
  const ys = spec.points.map((point) => point.y);
  return Math.max(...ys) - Math.min(...ys);
}

function maxAbsX(spec: FrameSpec): number {
  return Math.max(...spec.points.map((point) => Math.abs(point.x)));
}

function maxAbsY(spec: FrameSpec): number {
  return Math.max(...spec.points.map((point) => Math.abs(point.y)));
}

export function estimateVertexCount(specs: FrameSpec[]): number {
  return specs.reduce(
    (total, spec) => total + (spec.points.length + (spec.closed ? 1 : 0)) * PROFILE_VERTICES,
    0
  );
}

function measureExtents(specs: FrameSpec[]): { extentX: number; extentY: number } {
  return specs.reduce(
    (extents, spec) => ({
      extentX: Math.max(extents.extentX, maxAbsX(spec)),
      extentY: Math.max(extents.extentY, maxAbsY(spec)),
    }),
    { extentX: 0, extentY: 0 }
  );
}

/* ------------------------------ classification ------------------------------ */

function isMonogramRail(spec: FrameSpec): boolean {
  const isForwardPlane = spec.z >= 0.05 && spec.z <= 0.2;
  return isForwardPlane && verticalSpan(spec) >= MIN_MONOGRAM_HEIGHT && maxAbsX(spec) < MONOGRAM_MAX_ABS_X;
}

function inferRole(spec: FrameSpec): FrameRole {
  if (isMonogramRail(spec)) return 'monogram';
  if (Math.abs(spec.z) < 1e-6) return 'primary';
  return 'ornament';
}

/** Keeps roles declared by recipes; infers geometrically only for untagged specs. */
export function classifyRoles(specs: FrameSpec[]): FrameSpec[] {
  return specs.map((spec) => ({ ...spec, role: spec.role ?? inferRole(spec) }));
}

function isEssential(spec: FrameSpec): boolean {
  return spec.role === 'primary' || spec.role === 'monogram';
}

/* --------------------- simplification below the signature --------------------- */

function maxCentroidAbsX(specs: FrameSpec[]): number {
  return specs.reduce((largest, spec) => Math.max(largest, centroidAbsX(spec)), 0);
}

/** Monotone radius + length gate; the essential skeleton is never removed. */
export function simplifySignature(specs: FrameSpec[], intricacy: number): FrameSpec[] {
  if (intricacy >= SIGNATURE_INTRICACY) return specs;

  const progress = intricacy / SIGNATURE_INTRICACY;
  const radiusLimit =
    SIMPLIFY_BASE_RADIUS + progress * (maxCentroidAbsX(specs) + 1 - SIMPLIFY_BASE_RADIUS);
  const lengthLimit = SIMPLIFY_BASE_MIN_LENGTH * (1 - progress);

  return specs
    .filter(
      (spec) =>
        isEssential(spec) ||
        (centroidAbsX(spec) <= radiusLimit && polylineLength(spec) >= lengthLimit)
    )
    .map((spec) => ({ ...spec }));
}

/* ----------------------- derivation above the signature ----------------------- */

export interface DerivationPlan {
  echoLayers: number;
  bandPairs: number;
  rosetteRings: number;
}

export function planDerivation(intricacy: number): DerivationPlan {
  if (intricacy <= SIGNATURE_INTRICACY) return { echoLayers: 0, bandPairs: 0, rosetteRings: 0 };
  return {
    echoLayers: Math.min(ECHOES_AT_FULL, Math.floor((intricacy - SIGNATURE_INTRICACY) * 8 + 1e-9)),
    bandPairs: intricacy > 0.86 ? 2 : intricacy > 0.64 ? 1 : 0,
    rosetteRings: intricacy > ROSETTE_THREE_RINGS ? 3 : intricacy > ROSETTE_TWO_RINGS ? 2 : 0,
  };
}

function scaleSpec(spec: FrameSpec, scale: number, layer: number): FrameSpec {
  return {
    ...spec,
    points: spec.points.map((point) => ({ x: point.x * scale, y: point.y * scale })),
    width: spec.width * 0.55,
    depth: spec.depth * 0.7,
    z: spec.z + -0.16 * layer,
    delay: spec.delay + 0.03 * layer,
    role: 'echo',
  };
}

/** Scaled, receding copies of base ornament (fractal children are excluded). */
export function buildEchoLayers(specs: FrameSpec[], layers: number): FrameSpec[] {
  if (layers <= 0) return [];
  const sources = specs.filter((spec) => spec.role === 'ornament');
  if (sources.length === 0) return [];

  const baseExtent = Math.max(1, ...sources.map(maxAbsX));
  const scaleCap = Math.max(1.02, Math.min(1.35, MAX_FRAME_EXTENT / baseExtent));
  const echoes: FrameSpec[] = [];
  for (let layer = 1; layer <= layers; layer += 1) {
    const scale = 1 + ((scaleCap - 1) * layer) / layers;
    for (const source of sources) {
      echoes.push(scaleSpec(source, scale, layer));
    }
  }
  return echoes;
}

function isAxisAlignedStraight(spec: FrameSpec): boolean {
  if (spec.points.length !== 2) return false;
  const [start, end] = spec.points;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dy <= dx * 0.25 || dx <= dy * 0.25;
}

function straightCompanion(spec: FrameSpec, normal: { x: number; y: number }, offset: number, order: number): FrameSpec {
  return {
    ...spec,
    points: spec.points.map((point) => ({ x: point.x + normal.x * offset, y: point.y + normal.y * offset })),
    width: spec.width * BAND_WIDTH_FACTOR,
    depth: spec.depth * 0.8,
    z: spec.z - 0.02,
    delay: spec.delay + 0.02 * order,
    role: 'band',
  };
}

function isBandEligible(spec: FrameSpec): boolean {
  return spec.role === 'ornament' && isAxisAlignedStraight(spec) && polylineLength(spec) >= BAND_MIN_LENGTH;
}

/** Engraved parallel companions on long axis-aligned ornament rules only. */
export function buildBandCompanions(specs: FrameSpec[], pairs: number): FrameSpec[] {
  if (pairs <= 0) return [];
  return specs.filter(isBandEligible).flatMap((spec) => {
    const [start, end] = spec.points;
    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const normal = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
    return Array.from({ length: pairs }, (_, index) => index + 1).flatMap((order) => {
      const offset = order * BAND_OFFSET_FACTOR * spec.width;
      return [straightCompanion(spec, normal, offset, order), straightCompanion(spec, normal, -offset, order)];
    });
  });
}

/** Symmetric nested-diamond corner rosettes sized from the base envelope. */
export function buildRosettes(specs: FrameSpec[], rings: number): FrameSpec[] {
  if (rings <= 0) return [];
  const extentX = Math.max(1, ...specs.map(maxAbsX));
  const extentY = Math.max(1, ...specs.flatMap((spec) => spec.points.map((point) => Math.abs(point.y))));
  const radius = Math.min(ROSETTE_MAX_RADIUS, extentX * 0.16);
  const ringFactors = [1, 0.62, 0.38].slice(0, rings);
  const rosettes: FrameSpec[] = [];
  for (const signX of [-1, 1]) {
    for (const signY of [-1, 1]) {
      for (const factor of ringFactors) {
        rosettes.push({
          ...emitDiamond({
            centerX: signX * extentX * 0.82,
            centerY: signY * extentY * 0.5,
            radiusX: radius * factor,
            radiusY: radius * factor * 1.35,
            width: 0.026 * factor + 0.008,
            depth: 0.06,
            z: 0.05,
            delay: 0.3,
          }),
          role: 'rosette',
        });
      }
    }
  }
  return rosettes;
}

function deriveOrnament(base: FrameSpec[], plan: DerivationPlan): FrameSpec[] {
  return [
    ...buildEchoLayers(base, plan.echoLayers),
    ...buildBandCompanions(base, plan.bandPairs),
    ...buildRosettes(base, plan.rosetteRings),
  ];
}

/** Drops whole symmetric families, outermost echo layer first, never the base. */
export function reducePlan(plan: DerivationPlan): DerivationPlan | null {
  if (plan.echoLayers > 0) return { ...plan, echoLayers: plan.echoLayers - 1 };
  if (plan.rosetteRings > 0) return { ...plan, rosetteRings: plan.rosetteRings === 3 ? 2 : 0 };
  if (plan.bandPairs > 0) return { ...plan, bandPairs: plan.bandPairs - 1 };
  return null;
}

function fitsBudget(base: FrameSpec[], derived: FrameSpec[]): boolean {
  return (
    base.length + derived.length <= MAX_FRAME_RAILS &&
    estimateVertexCount(base) + estimateVertexCount(derived) <= MAX_FRAME_VERTICES
  );
}

export function fitDerivedToBudget(base: FrameSpec[], plan: DerivationPlan): FrameSpec[] {
  const derived = deriveOrnament(base, plan);
  if (fitsBudget(base, derived)) return derived;
  const reduced = reducePlan(plan);
  return reduced ? fitDerivedToBudget(base, reduced) : [];
}

/* ---------------------------------- entry ---------------------------------- */

function withClampedDelays(specs: FrameSpec[]): FrameSpec[] {
  return specs.map((spec) => ({ ...spec, delay: Math.min(MAX_DELAY, Math.max(0, spec.delay)) }));
}

function countByRole(specs: FrameSpec[], role: FrameRole): number {
  return specs.filter((spec) => spec.role === role).length;
}

function summarize(specs: FrameSpec[], base: FrameSpec[], intricacy: number): FrameGeometryStats {
  const { extentX, extentY } = measureExtents(specs);
  return {
    intricacy,
    railCount: specs.length,
    vertexCount: estimateVertexCount(specs),
    echoes: countByRole(specs, 'echo'),
    bands: countByRole(specs, 'band'),
    rosettes: countByRole(specs, 'rosette'),
    fractals: countByRole(specs, 'fractal'),
    extent: Math.max(extentX, extentY),
    extentX,
    extentY,
    baseExtentY: measureExtents(base).extentY,
  };
}

/**
 * Frame(act, width, G, I) = Ornament_I(Base_G(Recipe_act(width))).
 * (G0, I = 0.50) is the original frame. Deterministic; no side effects.
 */
export function buildFrameGeometry(request: FrameGeometryRequest): FrameGeometry {
  const intricacy = clampIntricacy(request.intricacy);
  const genome = clampGenome(request.genome ?? SIGNATURE_GENOME);
  const base = classifyRoles(
    buildBaseOrnaments({
      archetype: request.archetype,
      mainWidth: request.mainWidth,
      genome,
      family: request.family,
    })
  );
  const kept = intricacy < SIGNATURE_INTRICACY ? simplifySignature(base, intricacy) : base;
  const derived = intricacy > SIGNATURE_INTRICACY ? fitDerivedToBudget(base, planDerivation(intricacy)) : [];
  const specs = withClampedDelays([...kept, ...derived]);
  return { specs, stats: summarize(specs, base, intricacy) };
}
