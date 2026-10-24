import { describe, expect, it } from 'vitest';
import { applySubjectMask, estimateSubjectMask, sampleMask } from './subjectMask';
import type { RgbaImage, SubjectMask } from './types';

const image: RgbaImage = {
  width: 3,
  height: 3,
  data: new Uint8ClampedArray([
    10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255,
    10, 10, 10, 255, 220, 80, 40, 255, 10, 10, 10, 255,
    10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255,
  ]),
};

describe('subject masks', () => {
  it('finds a subject against a plain border colour', () => {
    const mask = estimateSubjectMask(image);
    expect(mask.alpha[0]).toBe(0);
    expect(mask.alpha[4]).toBe(255);
  });

  it('scales and applies a model mask without mutating the image', () => {
    const mask: SubjectMask = { width: 1, height: 1, alpha: Uint8Array.of(128) };
    const result = applySubjectMask(image, mask);
    expect(sampleMask(mask, 2, 2, 3, 3)).toBe(128);
    expect(result.data[3]).toBe(128);
    expect(image.data[3]).toBe(255);
  });
});