import type { FrameArchetype } from '../../../types/sequence';
import type { FrameSpec } from '../types';

export const ARCHETYPES: FrameArchetype[] = [
  'monogram_gate',
  'ziggurat_chevron',
  'sunburst_octagon',
  'diamond_gateway',
  'gatsby_hero',
];

/** Render fields only (role is metadata). */
export function renderFields(spec: FrameSpec): string {
  return JSON.stringify({
    points: spec.points.map((point) => [Number(point.x.toFixed(6)), Number(point.y.toFixed(6))]),
    closed: Boolean(spec.closed),
    width: spec.width,
    depth: spec.depth,
    z: spec.z,
    delay: spec.delay,
    partDir: spec.partDir ?? 0,
  });
}

function serializePoints(points: Array<{ x: number; y: number }>, closed: boolean): string {
  const rounded = points.map((point) => [Number(point.x.toFixed(6)) + 0, Number(point.y.toFixed(6)) + 0]);
  if (!closed) return JSON.stringify(rounded);

  // A closed path has no canonical start or direction: take the smallest rotation of either direction.
  const candidates: string[] = [];
  for (const sequence of [rounded, [...rounded].reverse()]) {
    for (let index = 0; index < sequence.length; index += 1) {
      candidates.push(JSON.stringify([...sequence.slice(index), ...sequence.slice(0, index)]));
    }
  }
  return candidates.sort()[0];
}

function shapeKey(spec: FrameSpec, mirrorX: boolean): string {
  const points = spec.points.map((point) => ({ x: mirrorX ? -point.x : point.x, y: point.y }));
  return JSON.stringify({
    points: serializePoints(points, Boolean(spec.closed)),
    closed: Boolean(spec.closed),
    width: spec.width,
    depth: spec.depth,
    z: spec.z,
  });
}

export function mirrorKey(spec: FrameSpec): string {
  return shapeKey(spec, true);
}

export function geometryKey(spec: FrameSpec): string {
  return shapeKey(spec, false);
}

/** Sorted forward and mirrored shape keys of every non-monogram rail. */
export function symmetryKeys(specs: FrameSpec[]): { forward: string[]; mirrored: string[] } {
  const subject = specs.filter((spec) => spec.role !== 'monogram');
  return {
    forward: subject.map(geometryKey).sort(),
    mirrored: subject.map(mirrorKey).sort(),
  };
}
