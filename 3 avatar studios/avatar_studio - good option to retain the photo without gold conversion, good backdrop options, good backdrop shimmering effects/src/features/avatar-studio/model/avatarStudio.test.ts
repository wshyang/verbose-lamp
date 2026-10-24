import { describe, expect, it } from 'vitest';
import { WEI_LING_AVATAR } from '../data/weiLing';
import { preparePhotoSubject, STUDIO_SIDE, subjectFromSprite } from '../engine/prepareSubject';
import { composeAvatar, haloOf } from './compose';
import { centreSquare, cropFromFace, cropImage, largestFace } from './cropBox';
import { renderGoldBackdrop } from './goldBackdrop';
import { alphaOf, keepSeedPiece, planeOf, refineMatte, shiftEdge } from './matte';
import { parseIndexedSprite, spriteToMatte } from './sprite';
import type { AlphaMask, FaceDetection, RgbaImage } from './types';

const solid = (side: number, rgb: readonly number[]): RgbaImage => {
  const data = new Uint8ClampedArray(side * side * 4);
  for (let at = 0; at < data.length; at += 4) data.set([...rgb, 255], at);
  return { width: side, height: side, data };
};

const DAISY_FACE: FaceDetection = { rightEye: { x: 0.45, y: 0.4 }, leftEye: { x: 0.55, y: 0.4 }, boxHeight: 60, boxWidth: 60 };

describe('indexed sprite (Wei_Ling)', () => {
  it('decodes the reference sprite at 128 cells with backdrop and ink last', () => {
    const sprite = parseIndexedSprite(WEI_LING_AVATAR.sprite);
    expect(sprite?.size).toBe(128);
    expect(sprite?.palette.length).toBe(16);
    expect(sprite?.cells.length).toBe(128 * 128);
  });

  it('reads a matte with both subject and backdrop present', () => {
    const matte = spriteToMatte(parseIndexedSprite(WEI_LING_AVATAR.sprite)!);
    const subjectShare = matte.data.reduce((sum, value) => sum + (value === 255 ? 1 : 0), 0) / matte.data.length;
    expect(subjectShare).toBeGreaterThan(0.2);
    expect(subjectShare).toBeLessThan(0.9);
  });

  it('rejects malformed codes', () => {
    expect(parseIndexedSprite('128:zzzzzz:0001')).toBeNull();
    expect(parseIndexedSprite('8:000000:0010')).toBeNull();
  });

  it('becomes a studio subject at studio size', () => {
    const subject = subjectFromSprite(WEI_LING_AVATAR.sprite, 'Wei_Ling');
    expect(subject?.image.width).toBe(STUDIO_SIDE);
    expect(subject?.matte?.width).toBe(STUDIO_SIDE);
  });
});

describe('face crop', () => {
  it('frames the head from the eye line and stays inside the photo', () => {
    const box = cropFromFace(DAISY_FACE, { width: 640, height: 480 })!;
    expect(box.size).toBeCloseTo(64 * (3.65 / 0.72), 3);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.size).toBeLessThanOrEqual(480);
  });

  it('never exceeds the shortest edge', () => {
    const huge = { ...DAISY_FACE, rightEye: { x: 0.1, y: 0.5 }, leftEye: { x: 0.9, y: 0.5 } };
    expect(cropFromFace(huge, { width: 640, height: 480 })!.size).toBe(480);
  });

  it('picks the largest face and falls back to a centred square', () => {
    expect(largestFace([{ ...DAISY_FACE, boxWidth: 10 }, DAISY_FACE])).toBe(DAISY_FACE);
    expect(centreSquare({ width: 300, height: 200 })).toEqual({ x: 50, y: 0, size: 200 });
  });

  it('resamples the crop to the requested side', () => {
    expect(cropImage(solid(40, [9, 9, 9]), { x: 0, y: 0, size: 40 }, 16).data.length).toBe(16 * 16 * 4);
  });
});

describe('background matte', () => {
  it('reads RGBA and single-channel planes in both result shapes', () => {
    const rgba = { data: [0, 0, 0, 200], width: 1, height: 1, channels: 4 };
    expect(alphaOf(planeOf(rgba)!)!.data[0]).toBe(200);
    expect(alphaOf(planeOf([{ mask: { data: [77], width: 1, height: 1 } }])!)!.data[0]).toBe(77);
    expect(planeOf(null)).toBeNull();
  });

  it('keeps only the piece under the face seed, dropping the stranger behind', () => {
    const bits = Uint8Array.from([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(Array.from(keepSeedPiece(bits, 4, { x: 0.1, y: 0.1 }))).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('grows and shrinks the edge', () => {
    const dot = new Uint8Array(25); dot[12] = 1;
    expect(shiftEdge(dot, 5, 1).reduce((a, b) => a + b, 0)).toBe(5);
    expect(shiftEdge(dot, 5, -1).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('keeps everything when removal is off', () => {
    const matte: AlphaMask = { width: 2, height: 2, data: new Uint8ClampedArray(4) };
    const off = refineMatte(matte, { isBackgroundRemoved: false, threshold: 128, edge: 0, feather: 0 }, null);
    expect(Array.from(off.data)).toEqual([255, 255, 255, 255]);
  });
});

describe('gold backdrop and composition', () => {
  it('is deterministic per phase and shimmers across phases', () => {
    const style = { pattern: 'sunburst', palette: 'peacock', bands: 12, twist: 2 } as const;
    const a = renderGoldBackdrop({ size: 32, style, phase: 0 });
    expect(renderGoldBackdrop({ size: 32, style, phase: 0 }).data).toEqual(a.data);
    expect(renderGoldBackdrop({ size: 32, style, phase: 0.5 }).data).not.toEqual(a.data);
  });

  it('carries coloured enamel, not just gold', () => {
    const image = renderGoldBackdrop({ size: 48, style: { pattern: 'concentric', palette: 'peacock', bands: 6, twist: 0 }, phase: 0 });
    let hasBlueGreen = false;
    for (let at = 0; at < image.data.length; at += 4) if (image.data[at + 2] > image.data[at]) hasBlueGreen = true;
    expect(hasBlueGreen).toBe(true);
  });

  it('shows subject where the matte is full and backdrop where it is empty', () => {
    const matte: AlphaMask = { width: 2, height: 1, data: Uint8ClampedArray.from([255, 0]) };
    const backdrop = { width: 2, height: 1, data: Uint8ClampedArray.from([10, 10, 10, 255, 10, 10, 10, 255]) };
    const subject = { width: 2, height: 1, data: Uint8ClampedArray.from([200, 0, 0, 255, 200, 0, 0, 255]) };
    const out = composeAvatar({ backdrop, subject, matte, halo: null });
    expect(Array.from(out.data)).toEqual([200, 0, 0, 255, 10, 10, 10, 255]);
  });

  it('inlays a halo only outside the subject', () => {
    const data = new Uint8ClampedArray(81); data[40] = 255;
    const halo = haloOf({ width: 9, height: 9, data }, 1);
    expect(halo.data[40]).toBe(0);
    expect(halo.data[41]).toBeGreaterThan(0);
  });
});

describe('photo preparation', () => {
  it('detects, crops and segments with injected engines, degrading to a centred crop', async () => {
    const stages: string[] = [];
    const prepared = await preparePhotoSubject(solid(300, [120, 90, 60]), {
      label: 'gatsby.jpg',
      engines: { locate: async () => null, segment: async () => null },
      onStage: (stage) => stages.push(stage),
    });
    expect(stages).toEqual(['detecting-face', 'removing-background']);
    expect(prepared.isFaceFound).toBe(false);
    expect(prepared.matte).toBeNull();
    expect(prepared.image.width).toBe(STUDIO_SIDE);
  });
});
