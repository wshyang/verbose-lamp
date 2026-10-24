/**
 * Enamel backdrop feature barrel: the "coloured but shimmering gold" cloisonné panel.
 * No React and no knowledge of the host app.
 *
 *   patterns         continuous pattern fields; the only switch over pattern kind
 *   goldLeaf         deterministic leaf-fleck noise
 *   palettes / spec  frozen enamels, presets, slider ranges, immutable edits
 *   renderBackdrop   the panel renderer (image + wire + metal maps)
 */
export type {
  BackdropKind,
  BackdropPattern,
  BackdropPreset,
  BackdropSpec,
  ChevronPattern,
  EnamelPalette,
  FanPattern,
  FieldFrame,
  InlayStyle,
  KnobRange,
  PixelPoint,
  RadiancePattern,
  SpecKnob,
  SunburstPattern,
  SwirlPattern,
} from './types';
export { RADIANCE_SHAPES, REFERENCE_GRID, SUNBURST_TWIST_STEP, WAVE_FORMS, bandOf, edgeDistance, fieldAt } from './patterns';
export { LEAF_SEED, fleckAt, leafAt } from './goldLeaf';
export {
  BACKDROP_PRESETS,
  DEFAULT_BACKDROPS,
  DEFAULT_PATTERNS,
  ENAMEL_PALETTES,
  INLAY_LABELS,
  JEWEL_BACKDROPS,
  PATTERN_KNOBS,
  PATTERN_LABELS,
  SPEC_KNOBS,
} from './palettes';
export {
  describeKnob,
  isPaletteActive,
  paletteStops,
  patternKnobValue,
  specKnobValue,
  withColours,
  withInlay,
  withPalette,
  withPatternKind,
  withPatternKnob,
  withSpecKnob,
} from './spec';
export { renderEnamelBackdrop, renderEnamelPanel, type EnamelPanel } from './renderBackdrop';
export { lumaOf, mixRgb, parseHexColour, rampColour, scaleRgb, type Rgb } from './colour';
