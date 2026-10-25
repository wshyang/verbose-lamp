import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, HAWKER_CROP, SECOND_HEAD, buildHawkerFrame, buildHawkerMatte } from '@/features/background-removal';
import { DEFAULT_BACKDROPS, renderEnamelPanel } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { AVATAR_SIZE, composeAvatar, composeLayers, cutOutSubject, emptySubject, outlineRing } from './compose';
import { boxToPhoto, clampBox, moveBox, photoToBox, resizeBox, startingBox } from './cropBox';
import { STAGE_HINTS, nextStage } from './stage';
import type { AvatarComposition, StageFacts } from './types';

const photo = buildHawkerFrame();
const matte = buildHawkerMatte();
const backdropSpec = DEFAULT_BACKDROPS[0].spec;

function composition(overrides: Partial<AvatarComposition> = {}): AvatarComposition {
  return {
    photo, crop: HAWKER_CROP, matte, tuning: DEFAULT_TUNING, finish: 'natural',
    gilding: GILDING_PRESETS[0].params, backdrop: backdropSpec, frame: 'medallion', size: 64, ...overrides,
  };
}

const rgbAt = (data: ArrayLike<number>, pixel: number) => [data[pixel * 4], data[pixel * 4 + 1], data[pixel * 4 + 2]];
const cropPixel = (x: number, y: number, size: number) =>
  Math.round(((y - HAWKER_CROP.y) / HAWKER_CROP.size) * size) * size + Math.round(((x - HAWKER_CROP.x) / HAWKER_CROP.size) * size);

describe('composeAvatar', () => {
  it('renders a square at the requested size (512 by default)', () => {
    expect(AVATAR_SIZE).toBe(512);
    const avatar = composeAvatar(composition());
    expect([avatar.width, avatar.height, avatar.data.length]).toEqual([64, 64, 64 * 64 * 4]);
  });

  it('never mutates its input', () => {
    const photoBefore = Array.from(photo.data);
    const matteBefore = Array.from(matte.data);
    composeAvatar(composition({ finish: 'gilded' }));
    expect(Array.from(photo.data)).toEqual(photoBefore);
    expect(Array.from(matte.data)).toEqual(matteBefore);
  });

  it('is transparent outside the medallion and opaque on a plaque', () => {
    expect(composeAvatar(composition()).data[3]).toBe(0);
    expect(composeAvatar(composition({ frame: 'plaque' })).data.filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
  });

  it('shows the backdrop, not the photo, where the stranger was pruned', () => {
    const avatar = composeAvatar(composition({ frame: 'plaque' }));
    const backdrop = renderEnamelPanel(backdropSpec, 64).image;
    const at = cropPixel(SECOND_HEAD.x, SECOND_HEAD.y, 64);
    expect(rgbAt(avatar.data, at)).toEqual(rgbAt(backdrop.data, at));
  });

  it('differs between natural and the gold finishes only inside the subject', () => {
    const natural = composeAvatar(composition({ frame: 'plaque' }));
    const alpha = cutOutSubject({ ...composition(), size: 64 }).alpha;
    for (const finish of ['gilded', 'tinted'] as const) {
      const golden = composeAvatar(composition({ frame: 'plaque', finish }));
      let insideDifferences = 0;
      for (let pixel = 0; pixel < 64 * 64; pixel += 1) {
        const same = rgbAt(natural.data, pixel).join() === rgbAt(golden.data, pixel).join();
        if (alpha.data[pixel] === 0) expect(same).toBe(true);
        else if (!same) insideDifferences += 1;
      }
      expect(insideDifferences).toBeGreaterThan(100);
    }
  });

  it('paints the outline ring in warm gold', () => {
    const subject = cutOutSubject({ ...composition(), size: 128 });
    const ring = outlineRing(subject.alpha);
    const avatar = composeLayers({ subject, backdrop: renderEnamelPanel(backdropSpec, 128), frame: 'plaque', rampId: 'bright' });
    let checked = 0;
    for (let pixel = 0; pixel < ring.data.length; pixel += 1) {
      if (ring.data[pixel] < 255) continue;
      expect(subject.alpha.data[pixel]).toBeLessThan(24);
      const [r, g, b] = rgbAt(avatar.image.data, pixel);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('keeps the whole crop, with no outline, when there is no matte', () => {
    const subject = cutOutSubject({ ...composition(), matte: null, size: 32 });
    expect(subject.alpha.data.every((value) => value === 255)).toBe(true);
    expect(outlineRing(subject.alpha).data.every((value) => value === 0)).toBe(true);
  });

  it('offers a transparent subject so the backdrop can be previewed first', () => {
    const subject = emptySubject(8);

    expect(subject.pixels.data.every((value) => value === 0)).toBe(true);
    expect(subject.alpha.data.every((value) => value === 0)).toBe(true);
    expect(subject.shine).toBe(0);
    expect(outlineRing(subject.alpha).data.every((value) => value === 0)).toBe(true);
  });

  it('refuses layers that do not share one square size', () => {
    const backdrop = renderEnamelPanel(DEFAULT_BACKDROPS[0].spec, 16);

    expect(() =>
      composeLayers({
        backdrop,
        subject: emptySubject(8),
        rampId: 'bright',
        frame: 'plaque',
      })
    ).toThrow(RangeError);
    expect(() =>
      composeLayers({ backdrop, subject: emptySubject(8), rampId: 'bright', frame: 'plaque' })
    ).toThrow('Backdrop and subject layers must share one square size.');
  });

  it('matches the 16×16 composition data snapshot', () => {
    const avatar = composeAvatar(composition({ size: 16 }));
    const rows = Array.from({ length: 16 }, (_, y) => Array.from(avatar.data.slice(y * 64, y * 64 + 64), (v) => v.toString(16).padStart(2, '0')).join(''));
    expect(rows).toMatchSnapshot();
  });
});

describe('nextStage', () => {
  const base: StageFacts = { hasImage: true, error: null, crop: { x: 0, y: 0, size: 10 }, matte, isLocating: false, isSegmenting: false };

  it('walks the session machine', () => {
    expect(nextStage({ ...base, hasImage: false })).toBe('idle');
    expect(nextStage({ ...base, isLocating: true })).toBe('working');
    expect(nextStage({ ...base, crop: null })).toBe('cropping');
    expect(nextStage({ ...base, isSegmenting: true })).toBe('refining');
    expect(nextStage(base)).toBe('ready');
    expect(nextStage({ ...base, matte: null })).toBe('plain');
    expect(nextStage({ ...base, error: 'nope' })).toBe('failed');
  });

  it('never exposes internals in its copy', () => {
    for (const hint of Object.values(STAGE_HINTS)) expect(hint).not.toMatch(/mediapipe|modnet|wasm|cdn|transformers|onnx|\.ts|uniform/i);
    expect(STAGE_HINTS.ready).toBe('Background removed. Move the square if the framing is off.');
  });
});

describe('cropBox (ported)', () => {
  const frame = { width: 400, height: 300 };

  it('starts centred at 80 % of the short edge and clamps inside the photo', () => {
    expect(startingBox(frame)).toEqual({ x: 80, y: 30, size: 240 });
    expect(clampBox({ x: 390, y: -20, size: 10 }, frame)).toEqual({ x: 340, y: 0, size: 60 });
    expect(clampBox({ x: 0, y: 0, size: 900 }, frame).size).toBe(300);
  });

  it('moves and resizes without leaving the photo', () => {
    expect(moveBox({ x: 10, y: 10, size: 100 }, { x: 500, y: 5 }, frame)).toEqual({ x: 300, y: 15, size: 100 });
    expect(resizeBox({ x: 250, y: 100, size: 100 }, { x: 400, y: 0 }, frame).size).toBe(150);
    expect(resizeBox({ x: 0, y: 0, size: 100 }, { x: -90, y: -90 }, frame).size).toBe(60);
  });

  it('round-trips between screen and photo pixels', () => {
    const shown = { width: 200, height: 150 };
    const onPhoto = boxToPhoto({ x: 20, y: 10, size: 50 }, shown, frame);
    expect(onPhoto).toEqual({ x: 40, y: 20, size: 100 });
    expect(photoToBox(onPhoto, shown, frame)).toEqual({ x: 20, y: 10, size: 50 });
  });
});
