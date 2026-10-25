import { clampGenome, type FrameStyle, type ScreenBorderStyle } from '@/features/art-deco-frame';

/**
 * The clamping the scene has always applied to anything arriving from Frame Studio
 * (ADDENDUM-022 §6.2). Pure on purpose: the store, the old manager and the tests all
 * agree on these numbers without touching three.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const level = (value: number) => clamp(Math.round(value), 1, 4);

/** Frame style as the card rigs will build it: finite, in range, no aliased arrays. */
export function clampFrameStyle(style: FrameStyle): FrameStyle {
  return {
    intricacy: clamp(style.intricacy, 0, 1),
    formula: {
      source: style.formula.source,
      level: level(style.formula.level),
      genome: clampGenome(style.formula.genome),
      layers:
        style.formula.layers?.map((layer) => ({
          source: layer.source,
          enabled: layer.enabled,
          level: level(layer.level),
        })) ?? [],
    },
  };
}

/** Screen-border style as the proscenium will build it. */
export function clampScreenBorderStyle(style: ScreenBorderStyle): ScreenBorderStyle {
  return {
    weight: clamp(style.weight, 0, 1),
    genome: clampGenome(style.genome),
  };
}

/** A playhead that always sits inside the sequence (the last frame is 0.001 s short). */
export function clampSequenceTime(seconds: number, duration: number): number {
  return clamp(seconds, 0, duration - 0.001);
}

/**
 * Where `jumpToChapter` lands: 0.15 s inside the act, so the card is already drawing on
 * rather than sitting on its fade-in boundary.
 */
export function chapterEntryTime(startTime: number): number {
  return startTime + 0.15;
}
