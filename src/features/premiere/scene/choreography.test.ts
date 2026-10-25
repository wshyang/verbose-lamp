import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEQUENCE_CHAPTERS, TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { activeChapterIndex, clamp, lerp, smoothstep } from './choreography';

describe('choreography primitives', () => {
  it('matches three’s smoothstep across the curve', () => {
    for (let i = 0; i <= 50; i += 1) {
      const x = -0.5 + i * 0.05;
      expect(smoothstep(x, 0.35, 2.55)).toBeCloseTo(THREE.MathUtils.smoothstep(x, 0.35, 2.55), 12);
      expect(smoothstep(x, -0.04, 0.42)).toBeCloseTo(THREE.MathUtils.smoothstep(x, -0.04, 0.42), 12);
    }
  });

  it('saturates smoothstep at and beyond its edges', () => {
    expect(smoothstep(0.3, 0.35, 2.55)).toBe(0);
    expect(smoothstep(2.6, 0.35, 2.55)).toBe(1);
    expect(smoothstep(0.35, 0.35, 2.55)).toBe(0);
    expect(smoothstep(2.55, 0.35, 2.55)).toBe(1);
  });

  it('clamps into the closed range', () => {
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(7, 0, 1)).toBe(1);
    expect(clamp(0.25, 0, 1)).toBe(0.25);
  });

  it('interpolates linearly between its ends', () => {
    expect(lerp(4, 8, 0)).toBe(4);
    expect(lerp(4, 8, 1)).toBe(8);
    expect(lerp(4, 8, 0.5)).toBe(6);
  });

  // `a + (b - a) * t` differs from three's `(1 - t) * a + t * b` in the last bit on about
  // a quarter of random inputs. The camera Z is lerped every frame, so the form is pinned
  // to the one the shipped manager used.
  it('is bit-identical to three’s lerp, which the shipped manager used', () => {
    for (let i = 0; i < 2000; i += 1) {
      const from = -52 + ((i * 37) % 60) + (i % 7) * 0.137;
      const to = from + ((i % 13) - 6.5) * 1.1;
      const t = (i % 101) / 100;
      expect(lerp(from, to, t)).toBe(THREE.MathUtils.lerp(from, to, t));
    }
  });
});

describe('activeChapterIndex', () => {
  it('finds the chapter that owns the time', () => {
    expect(activeChapterIndex(0, SEQUENCE_CHAPTERS)).toBe(0);
    expect(activeChapterIndex(4.32, SEQUENCE_CHAPTERS)).toBe(0);
    expect(activeChapterIndex(11.28, SEQUENCE_CHAPTERS)).toBe(1);
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION - 0.001, SEQUENCE_CHAPTERS)).toBe(4);
  });

  it('hands a chapter boundary to the later chapter (end is exclusive)', () => {
    for (let index = 1; index < SEQUENCE_CHAPTERS.length; index += 1) {
      expect(activeChapterIndex(SEQUENCE_CHAPTERS[index].startTime, SEQUENCE_CHAPTERS)).toBe(index);
    }
  });

  it('reads anything off the sequence as the finale', () => {
    expect(activeChapterIndex(-3, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(TOTAL_SEQUENCE_DURATION, SEQUENCE_CHAPTERS)).toBe(4);
    expect(activeChapterIndex(Number.NaN, SEQUENCE_CHAPTERS)).toBe(4);
  });

  it('returns -1 for an empty chapter list', () => {
    expect(activeChapterIndex(1, [])).toBe(-1);
  });
});
