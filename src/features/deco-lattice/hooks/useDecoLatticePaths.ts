import { useId, useMemo } from 'react';
import { hash01 } from '@/shared/lib/random';
import { buildDecoLattice, type DecoLatticeRequest } from '../model/composition';
import { specsToLayerPaths, type LayerPath } from '../model/latticeSvg';

const FULL_CIRCLE_DEG = 360;
const VIEWBOX_MARGIN = 0.06;
const LAYER_SEED_STRIDE = 17;
const LAYER_SEED_OFFSET = 3;
/** Back to front: the deepest layer (3) first, the heavy frame (0) last. */
const DRAW_ORDER = [3, 2, 1, 0] as const;

export interface LayerGroup {
  layer: number;
  paths: readonly LayerPath[];
  brassAngle: number;
}

function resolveRequest(request: Partial<DecoLatticeRequest> | undefined): Required<DecoLatticeRequest> {
  return {
    mode: request?.mode ?? 'medallion',
    hw: request?.hw ?? 1,
    hh: request?.hh ?? 1,
    seed: request?.seed ?? 1925,
    density: request?.density ?? 0.7,
    level: request?.level ?? 4,
  };
}

function brassAngle(seed: number, layer: number): number {
  return Math.round(hash01(seed, layer * LAYER_SEED_STRIDE + LAYER_SEED_OFFSET) * FULL_CIRCLE_DEG);
}

function groupByLayer(paths: readonly LayerPath[], seed: number): readonly LayerGroup[] {
  return DRAW_ORDER.map((layer) => ({
    layer,
    paths: paths.filter((p) => p.layer === layer),
    brassAngle: brassAngle(seed, layer),
  }));
}

/** Decides everything the frame renders: geometry, layer grouping, viewBox. */
export function useDecoLatticePaths(request: Partial<DecoLatticeRequest> | undefined) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { mode, hw, hh, seed, density, level } = resolveRequest(request);

  const groups = useMemo(() => {
    const geometry = buildDecoLattice({ mode, hw, hh, seed, density, level });
    return groupByLayer(specsToLayerPaths(geometry.specs), seed);
  }, [mode, hw, hh, seed, density, level]);

  const viewBox = `${-hw - VIEWBOX_MARGIN} ${-hh - VIEWBOX_MARGIN} ${2 * (hw + VIEWBOX_MARGIN)} ${2 * (hh + VIEWBOX_MARGIN)}`;
  const aspectMode = mode === 'frame' ? 'none' : 'xMidYMid meet';
  return { uid, groups, viewBox, aspectMode };
}
