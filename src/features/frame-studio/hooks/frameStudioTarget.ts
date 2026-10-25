import type { FrameStyle, ScreenBorderStyle } from '@/features/art-deco-frame';

/** What the studio drives. The premiere scene API satisfies it; null until the scene exists. */
export interface FrameStudioTarget {
  setSequenceFrameStyle: (style: FrameStyle) => void;
  setScreenBorderStyle: (style: ScreenBorderStyle) => void;
  setScreenBorderEnabled: (enabled: boolean) => void;
}
