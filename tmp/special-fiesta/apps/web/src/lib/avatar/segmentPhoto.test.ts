import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAvatarSprite } from '@psd/contracts';
import {
  forgetSegmenter,
  loadTransformers,
  segmentSubject,
  type TransformersModule,
} from './segmentPhoto.js';
import { refineWithModel } from './readPhoto.js';
import type { Bitmap } from './photoSprite.js';

/**
 * ADR-033 — the model path. The model itself is never fetched here: what matters is that
 * a mask is turned into a cut-out, and that every way the model can fail ends with a null
 * rather than a lost photo.
 */

const COLOURS = { backdrop: '#1d5b8c', ink: '#12243a' };

function selfie(): Bitmap {
  // A face in front of something busy — stripes, which no colour rule can cut out.
  const size = 120;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const face = ((x - 60) / 30) ** 2 + ((y - 54) / 36) ** 2 <= 1;
      const stripe = Math.floor(x / 7) % 2 === 0;
      const at = (y * size + x) * 4;
      pixels[at] = face ? 226 : stripe ? 200 : 40;
      pixels[at + 1] = face ? 172 : stripe ? 90 : 160;
      pixels[at + 2] = face ? 128 : stripe ? 60 : 210;
      pixels[at + 3] = 255;
    }
  }
  return { width: size, height: size, pixels };
}

/** A stand-in for Transformers.js: the same shape, an oval mask, no network. */
function fakeTransformers(options?: { emptyResult?: boolean; wrongSize?: boolean }) {
  const pipeline = vi.fn(async () => async (image: unknown) => {
    void image;
    if (options?.emptyResult === true) return [];
    const size = options?.wrongSize === true ? 10 : 120;
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const inside = ((x - size / 2) / (size * 0.3)) ** 2 + ((y - size * 0.45) / (size * 0.36)) ** 2 <= 1;
        data[y * size + x] = inside ? 255 : 0;
      }
    }
    return [{ mask: { data, width: 120, height: 120 } }];
  });
  const RawImage = vi.fn();
  return { module: { pipeline, RawImage: RawImage as unknown as TransformersModule['RawImage'] }, pipeline };
}

afterEach(() => {
  forgetSegmenter();
  vi.unstubAllGlobals();
});

describe('segmentSubject', () => {
  it('turns the model mask into a subject alpha', async () => {
    const { module, pipeline } = fakeTransformers();

    const mask = await segmentSubject(selfie(), async () => module);

    expect(mask?.width).toBe(120);
    expect(mask?.alpha.length).toBe(120 * 120);
    // Middle of the face is subject, the corner is not.
    expect(mask?.alpha[54 * 120 + 60]).toBe(255);
    expect(mask?.alpha[0]).toBe(0);
    expect(pipeline).toHaveBeenCalledWith('background-removal', 'Xenova/modnet', { device: 'wasm' });
  });

  it('runs on WASM even when the browser hands over a working WebGPU adapter (ADR-221)', async () => {
    // Measured on a real webcam frame in Chromium: the same crop, the same code, the same
    // fp32 weights gave a mean face alpha of 232/255 on WASM and 157/255 on WebGPU, and the
    // WebGPU matte punched holes through the forehead, cheek and nose. A correct cut-out beats a
    // fast wrong one, so WebGPU is not asked for at all.
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });
    const { module, pipeline } = fakeTransformers();

    await segmentSubject(selfie(), async () => module);

    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline).toHaveBeenCalledWith('background-removal', 'Xenova/modnet', { device: 'wasm' });
  });

  it('never even asks the browser for a GPU adapter', async () => {
    const requestAdapter = vi.fn(async () => ({}));
    vi.stubGlobal('navigator', { gpu: { requestAdapter } });
    const { module } = fakeTransformers();

    await segmentSubject(selfie(), async () => module);

    expect(requestAdapter).not.toHaveBeenCalled();
  });

  it('runs on WASM when navigator.gpu exists but has no adapter', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => null } });
    const { module, pipeline } = fakeTransformers();

    const subject = await segmentSubject(selfie(), async () => module);

    expect(subject).not.toBeNull();
    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline).toHaveBeenCalledWith('background-removal', 'Xenova/modnet', { device: 'wasm' });
  });

  it('gives up with null, rather than retrying another device, when WASM itself is refused', async () => {
    const module: TransformersModule = {
      RawImage: fakeTransformers().module.RawImage,
      pipeline: async () => {
        throw new Error('WASM refused');
      },
    };

    expect(await segmentSubject(selfie(), async () => module)).toBeNull();
  });

  it('reads the shape the real background-removal pipeline returns (ADR-045)', async () => {
    // Measured against @huggingface/transformers 4.3.0: `background-removal` hands back ONE
    // RawImage — `{ data, width, height, channels: 4 }` — with the matte in the alpha channel,
    // not a list of `{ mask }`. Reading only the older shape meant the model always "failed".
    const size = 8;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let at = 0; at < size * size; at += 1) {
      data[at * 4 + 3] = at < size ? 255 : 0; // the top row is subject, the rest is not
    }
    const module: TransformersModule = {
      RawImage: vi.fn() as unknown as TransformersModule['RawImage'],
      pipeline: async () => async () => ({ data, width: size, height: size, channels: 4 }),
    };

    const mask = await segmentSubject(selfie(), async () => module);

    expect(mask?.width).toBe(size);
    expect(mask?.alpha.length).toBe(size * size);
    expect(mask?.alpha[0]).toBe(255);
    expect(mask?.alpha[size * size - 1]).toBe(0);
  });

  it('refuses a result with no alpha to read, rather than inventing a matte', async () => {
    const size = 8;
    const module: TransformersModule = {
      RawImage: vi.fn() as unknown as TransformersModule['RawImage'],
      pipeline: async () => async () => ({
        data: new Uint8ClampedArray(size * size * 3).fill(120),
        width: size,
        height: size,
        channels: 3,
      }),
    };

    expect(await segmentSubject(selfie(), async () => module)).toBeNull();
  });

  it('loads the model once and keeps it for the session', async () => {
    const { module, pipeline } = fakeTransformers();

    await segmentSubject(selfie(), async () => module);
    await segmentSubject(selfie(), async () => module);

    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('returns null — never throws — when the model cannot be had', async () => {
    const boom = await segmentSubject(selfie(), async () => {
      throw new Error('offline');
    });
    expect(boom).toBeNull();

    const { module: empty } = fakeTransformers({ emptyResult: true });
    expect(await segmentSubject(selfie(), async () => empty)).toBeNull();

    // The loaded model is kept, so a different one needs the session forgotten first.
    forgetSegmenter();
    const { module: ragged } = fakeTransformers({ wrongSize: true });
    expect(await segmentSubject(selfie(), async () => ragged)).toBeNull();
  });

  it('really does try to fetch Transformers.js, and fails safely without a network', async () => {
    // The default loader is a bare dynamic import of a URL: outside a browser it refuses
    // outright, which is exactly the path a blocked CDN takes.
    await expect(loadTransformers()).rejects.toThrow();
  });
});

/** The colour in each corner cell — where a cut-out either worked or plainly did not. */
function cornerColours(sprite: { palette: Record<string, string>; rows: string[] }): string[] {
  const corners = [
    [0, 0],
    [127, 0],
    [0, 127],
    [127, 127],
  ];
  return corners.map(([x, y]) => sprite.palette[sprite.rows[y ?? 0]?.charAt(x ?? 0) ?? ''] ?? '');
}

describe('refineWithModel', () => {
  it('cuts a busy background out where the colour rules cannot', async () => {
    const { module } = fakeTransformers();
    const refined = await refineWithModel({ bitmap: selfie(), crop: null }, COLOURS, {
      transformers: async () => module,
    });
    const sprite = parseAvatarSprite(refined?.sprite ?? '');
    expect(sprite).not.toBeNull();
    const palette = sprite?.palette ?? {};
    const rows = sprite?.rows ?? [];

    // Everything the model called background is the participant's backdrop — no stripes.
    for (const colour of cornerColours({ palette, rows })) {
      expect(colour).toBe(COLOURS.backdrop);
    }
    const middle = rows[64]?.slice(52, 76) ?? '';
    expect([...middle].every((key) => palette[key] !== COLOURS.backdrop)).toBe(true);
  });

  /*
   * ADR-054 — two tests used to sit here, asserting that `headBoxFromMask` framed a head from
   * the silhouette "shoulders or no shoulders". They passed on the idealised ellipse-on-a-
   * rectangle masks they built for themselves, and the function they defended put a plate of
   * chicken rice and somebody's hand on the seeded crowd (ADR-053). They are deleted with it.
   *
   * The lesson is kept on purpose: a synthetic silhouette is not evidence about real masks,
   * which contain arms, held food and phones. Framing is now measured where it can be checked
   * against real photographs — `locateFace.test.ts` for the arithmetic, and
   * `scripts/avatar-align-check.ts` for the recorded crowd, by eye.
   */

  it('gives back nothing when the model is unavailable, so the caller keeps what it has', async () => {
    // ADR-054 — "unavailable" now has to mean BOTH models, since either one alone is still an
    // improvement worth keeping: a cut-out with no face box, or a face box with no cut-out.
    const refined = await refineWithModel({ bitmap: selfie(), crop: null }, COLOURS, {
      transformers: async () => {
        throw new Error('no cdn');
      },
      vision: async () => {
        throw new Error('no cdn');
      },
    });

    expect(refined).toBeNull();
  });
});
