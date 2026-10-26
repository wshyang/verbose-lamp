import { clampGenome } from './genome';
import {
  DEFAULT_FRAME_FORMULA,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  GENESIS_LEVEL_MAX,
  GENESIS_LEVEL_MIN,
  type FramePatternLayer,
  type FrameStyle,
  type ScreenBorderStyle,
} from './types';

/**
 * What a legal frame style is, in one place. The title-card scene, the screen border and the Frame
 * Studio all normalise through here, so they cannot disagree about a level, an intricacy or a
 * border weight, and a field added to a style passes through instead of being dropped.
 */

const MIN_UNIT = 0;
const MAX_UNIT = 1;

/** `Math.min/max` clamp that answers `fallback` for NaN instead of passing it through. */
function clampUnit(value: number, fallback: number): number {
  return Number.isNaN(value) ? fallback : Math.min(MAX_UNIT, Math.max(MIN_UNIT, value));
}

/**
 * A formula level asked for by a caller (a slider, a request): a whole number from
 * `GENESIS_LEVEL_MIN` to `GENESIS_LEVEL_MAX`. An infinity means "as much / as little as possible"
 * and pins to the nearest end; NaN means nothing was asked and gets the minimum.
 */
export function clampFormulaLevel(level: number): number {
  if (Number.isNaN(level)) return GENESIS_LEVEL_MIN;
  return Math.min(GENESIS_LEVEL_MAX, Math.max(GENESIS_LEVEL_MIN, Math.round(level)));
}

/**
 * The level the grammar draws at. A formula that reaches the renderer with a level that is not a
 * finite number is unusable, not a request for an extreme, so it draws at the default level
 * instead of the first or last one.
 */
export function resolveGenesisLevel(level: number): number {
  return Number.isFinite(level) ? clampFormulaLevel(level) : DEFAULT_FRAME_FORMULA.level;
}

export function clampIntricacy(intricacy: number): number {
  return clampUnit(intricacy, DEFAULT_FRAME_STYLE.intricacy);
}

function normalizeLayer(layer: FramePatternLayer): FramePatternLayer {
  return { ...layer, level: clampFormulaLevel(layer.level) };
}

/** A copy of `style` with every number held to its range. Unknown fields pass through. */
export function normalizeFrameStyle(style: FrameStyle): FrameStyle {
  const { formula } = style;
  return {
    ...style,
    intricacy: clampIntricacy(style.intricacy),
    formula: {
      ...formula,
      level: clampFormulaLevel(formula.level),
      genome: clampGenome(formula.genome),
      layers: (formula.layers ?? []).map(normalizeLayer),
    },
  };
}

/** A copy of `style` with the weight and genome held to range; pattern and seed pass through. */
export function normalizeScreenBorderStyle(style: ScreenBorderStyle): ScreenBorderStyle {
  return {
    ...style,
    weight: clampUnit(style.weight, DEFAULT_SCREEN_BORDER_STYLE.weight),
    genome: clampGenome(style.genome),
  };
}
