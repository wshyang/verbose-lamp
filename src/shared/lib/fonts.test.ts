import { describe, expect, it } from 'vitest';
import { waitForFonts } from './fonts';

describe('waitForFonts', () => {
  it('resolves when the font set reports ready', async () => {
    const ready = Promise.resolve(['Cinzel']);
    await expect(waitForFonts({ ready })).resolves.toBeUndefined();
  });

  it('swallows a failed font load so the app still starts', async () => {
    await expect(waitForFonts({ ready: Promise.reject(new Error('decode failed')) })).resolves.toBeUndefined();
  });

  it('resolves immediately without the Font Loading API', async () => {
    await expect(waitForFonts()).resolves.toBeUndefined();
    await expect(waitForFonts({} as never)).resolves.toBeUndefined();
  });

  it('tolerates a thenable that is not a real promise', async () => {
    const thenable = { then: (resolve: (value: unknown) => void) => resolve('Cinzel') };
    await expect(waitForFonts({ ready: thenable as never })).resolves.toBeUndefined();
  });
});
