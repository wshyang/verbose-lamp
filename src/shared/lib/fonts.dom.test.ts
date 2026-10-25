// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForFonts } from './fonts';

/**
 * The browser arm of `waitForFonts` (ADDENDUM-030 §2): under a DOM the default
 * font set comes from `document.fonts`, and the node suite can never see that.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
});

describe('waitForFonts in a DOM', () => {
  it('resolves immediately when the browser exposes no font set', async () => {
    expect('fonts' in document).toBe(false);
    await expect(waitForFonts()).resolves.toBeUndefined();
  });

  it('waits on document.fonts when it exists', async () => {
    let release: (faces: unknown) => void = () => undefined;
    const ready = new Promise((resolve) => {
      release = resolve;
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
    let settled = false;
    const waiting = waitForFonts().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release([]);
    await waiting;
    expect(settled).toBe(true);
  });
});
