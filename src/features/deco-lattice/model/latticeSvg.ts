import type { LatticeSpec } from './lattice';

export interface LayerPath {
  layer: 0 | 1 | 2 | 3;
  width: number;
  d: string;
}

function specPath(spec: LatticeSpec): string {
  const parts = spec.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)} ${p.y.toFixed(4)}`);
  return parts.join('') + (spec.closed ? 'Z' : '');
}

/** Pure specs → SVG path data, grouped by layer and stroke width. */
export function specsToLayerPaths(specs: readonly LatticeSpec[]): readonly LayerPath[] {
  const groups = new Map<string, LayerPath>();
  for (const spec of specs) {
    const key = `${spec.layer}|${spec.width.toFixed(5)}`;
    const existing = groups.get(key);
    const d = specPath(spec);
    if (existing) existing.d += d;
    else groups.set(key, { layer: spec.layer, width: spec.width, d });
  }
  return [...groups.values()].sort((a, b) => b.layer - a.layer);
}