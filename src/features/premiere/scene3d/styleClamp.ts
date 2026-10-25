import { clampGenome, type FrameStyle, type ScreenBorderStyle } from '@/features/art-deco-frame';

/** Clamps a value into a closed range without importing `three`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The scene only ever sees legal frame styles, whatever the studio sends
 * (moved verbatim out of `GatsbySceneManager.setSequenceFrameStyle`,
 * ADDENDUM-022 §2.1). Pure, so it can be tested without a renderer.
 */
export function clampFrameStyle(style: FrameStyle): FrameStyle {
  return {
    intricacy: clamp(style.intricacy, 0, 1),
    formula: {
      source: style.formula.source,
      level: clamp(Math.round(style.formula.level), 1, 4),
      genome: clampGenome(style.formula.genome),
      layers:
        style.formula.layers?.map((layer) => ({
          source: layer.source,
          enabled: layer.enabled,
          level: clamp(Math.round(layer.level), 1, 4),
        })) ?? [],
    },
  };
}

/** Same contract for the camera-parented screen border. */
export function clampBorderStyle(style: ScreenBorderStyle): ScreenBorderStyle {
  return {
    weight: clamp(style.weight, 0, 1),
    genome: clampGenome(style.genome),
  };
}
