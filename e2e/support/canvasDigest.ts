import { expect, type Page } from '@playwright/test';

export interface CanvasDigest {
  readonly width: number;
  readonly height: number;
  /** Pixels with alpha above 250: subject, frame and backdrop, not the cut edge. */
  readonly opaque: number;
  /** Pixels where red leads blue by 20 or more: gold, by construction. */
  readonly gold: number;
  /** Distinct 15-bit colours seen, capped so the number is stable and cheap. */
  readonly distinct: number;
  /** FNV-1a over every channel, as hex. Equal hashes mean identical pixels. */
  readonly hash: string;
}

const EMPTY: CanvasDigest = { width: 0, height: 0, opaque: 0, gold: 0, distinct: 0, hash: '' };
const PREVIEW = '[data-testid="avatar-studio__preview-canvas"]';

/**
 * Reads the avatar preview canvas. The computation happens inside the page, so only the small
 * digest crosses the wire. The preview is written with `putImageData` from the CPU pipeline, so
 * its pixels are the same on any machine, with no baseline image to record.
 */
export function digest(page: Page): Promise<CanvasDigest> {
  return page.evaluate(
    ({ selector, empty }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(selector);
      const context = canvas?.getContext('2d', { willReadFrequently: true });
      if (!canvas || !context || canvas.width === 0) return empty;

      const { width, height } = canvas;
      const { data } = context.getImageData(0, 0, width, height);
      const colours = new Set<number>();
      let opaque = 0;
      let gold = 0;
      let hash = 2166136261;

      for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];
        if (a > 250) opaque += 1;
        if (r > b + 20 && r > 60) gold += 1;
        if (colours.size < 4096) colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
        hash ^= r | (g << 8) | (b << 16) | (a << 24);
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return { width, height, opaque, gold, distinct: colours.size, hash: hash.toString(16) };
    },
    { selector: PREVIEW, empty: EMPTY },
  );
}

/**
 * Waits until two consecutive reads agree. Gilding 262k pixels in JavaScript takes seconds on a
 * software-rendered box, so a fixed sleep would sample a half-painted canvas.
 */
export async function settled(page: Page): Promise<CanvasDigest> {
  let previous = await digest(page);
  await expect
    .poll(
      async () => {
        const current = await digest(page);
        const stable = current.hash === previous.hash && current.opaque > 0;
        previous = current;
        return stable;
      },
      { timeout: 90_000, intervals: [400, 400, 800, 1200] },
    )
    .toBe(true);
  return digest(page);
}

/**
 * Waits for the preview to leave `before`, then settle. The redraw runs on the main thread behind
 * the controls, so a settled read straight after a click can still show the previous frame.
 */
export async function redrawn(page: Page, before: string): Promise<CanvasDigest> {
  await expect
    .poll(async () => (await digest(page)).hash, { timeout: 90_000, intervals: [300, 300, 600] })
    .not.toBe(before);
  return settled(page);
}
