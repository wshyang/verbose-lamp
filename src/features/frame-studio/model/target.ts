import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';

/**
 * The port the studio drives. A host supplies these three operations instead of
 * handing over its renderer, so the panel can bind to any scene implementation
 * (ADDENDUM-037).
 */
export interface FrameStudioTarget {
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
}
