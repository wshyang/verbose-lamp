export { buildDecoLattice, type DecoLatticeGeometry, type DecoLatticeRequest } from './model/composition';
export { DecoLatticeFrame } from './components/DecoLatticeFrame';
export { specsToLayerPaths, type LayerPath } from './model/latticeSvg';
export { isOctilinear, type LatticeSpec, type Pt } from './model/lattice';
export { LATTICE_PRESETS, SPOONER_MEDALLION, PREMIERE_FRAME } from './model/presets';
export {
  clipPolylineOutsideRect,
  clipSegmentToConvex,
  clipSegmentToRect,
  clipSpecOutsideRect,
  rectFromHalfExtents,
  type ClippingRect,
} from './model/clip';
export {
  apertureForLayout,
  bandCentres,
  nineSliceLayout,
  type BandLayout,
  type CornerCell,
  type HalfExtents,
  type NineSliceLayout,
  type NineSliceRequest,
} from './model/nineSlice';
