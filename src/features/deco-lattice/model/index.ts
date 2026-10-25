/**
 * The Deco Lattice's pure entry: the generator, its geometry types, tone and presets, with no
 * React and no DOM. A pure consumer (the frame grammar) imports this, not the feature barrel,
 * which also exports a React component (modularity review 2026-10-26, Issue 2).
 */
export { buildDecoLattice, type DecoLatticeGeometry, type DecoLatticeRequest } from './composition';
export { specsToLayerPaths, type LayerPath } from './latticeSvg';
export { isOctilinear, type LatticeSpec, type Pt } from './lattice';
export {
  buildNineSlice,
  planBand,
  type NineSliceCounts,
  type NineSliceGeometry,
  type NineSliceRequest,
} from './nineSlice';
export { LAYER_TONES, brassAngleFor, toneForLayer } from './tone';
export { LATTICE_PRESETS, SPOONER_MEDALLION, PREMIERE_FRAME } from './presets';
