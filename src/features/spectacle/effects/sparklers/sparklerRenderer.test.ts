import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { drawSparklerHead, drawSparklerSmoke, toPixelSpawn } from './sparklerRenderer';

const HEAD = { x: 640, y: 360, radius: 14, heat: 1, fade: 1, seed: 1925, tMs: 500 } as const;

describe('drawSparklerHead', () => {
  it('draws crackle rays and the white-hot core', () => {
    const { ctx, log } = createRecordingContext();
    drawSparklerHead({ ...HEAD, ctx, rayCount: 8 });
    expect(log.some((line) => line.startsWith('createLinearGradient'))).toBe(true);
    expect(log.some((line) => line.startsWith('createRadialGradient'))).toBe(true);
    expect(log.filter((line) => line.startsWith('arc(')).length).toBeGreaterThanOrEqual(4);
  });

  it('draws nothing when cold or fully faded', () => {
    const cold = createRecordingContext();
    drawSparklerHead({ ...HEAD, ctx: cold.ctx, heat: 0 });
    expect(cold.log).toHaveLength(0);

    const faded = createRecordingContext();
    drawSparklerHead({ ...HEAD, ctx: faded.ctx, fade: 0 });
    expect(faded.log).toHaveLength(0);
  });

  it('is deterministic for the same frame time', () => {
    const a = createRecordingContext();
    const b = createRecordingContext();
    drawSparklerHead({ ...HEAD, ctx: a.ctx });
    drawSparklerHead({ ...HEAD, ctx: b.ctx });
    expect(a.log.join('\n')).toBe(b.log.join('\n'));
  });

  it('sparkles between frames as the crackle gate changes', () => {
    const a = createRecordingContext();
    const b = createRecordingContext();
    drawSparklerHead({ ...HEAD, ctx: a.ctx, tMs: 100 });
    drawSparklerHead({ ...HEAD, ctx: b.ctx, tMs: 400 });
    expect(a.log.join('\n')).not.toBe(b.log.join('\n'));
  });

  it('keeps rays and halos proportional to the radius', () => {
    const small = createRecordingContext();
    const large = createRecordingContext();
    drawSparklerHead({ ...HEAD, ctx: small.ctx, radius: 6 });
    drawSparklerHead({ ...HEAD, ctx: large.ctx, radius: 30 });
    expect(small.log.length).toBeGreaterThan(0);
    expect(large.log.length).toBe(small.log.length);
  });
});

describe('drawSparklerSmoke', () => {
  it('paints a haze above the head', () => {
    const { ctx, log } = createRecordingContext();
    drawSparklerSmoke(ctx, 640, 360, 12, 0.3);
    expect(log.some((line) => line.startsWith('createRadialGradient'))).toBe(true);
    expect(log.some((line) => line.startsWith('fill'))).toBe(true);
  });

  it('skips an invisible haze', () => {
    const { ctx, log } = createRecordingContext();
    drawSparklerSmoke(ctx, 640, 360, 12, 0.001);
    expect(log).toHaveLength(0);
  });
});

describe('toPixelSpawn', () => {
  const spawn = {
    x: 0.5, y: 0.25, vx: 0.2, vy: -0.1, k: 1.35, g: 0.42,
    lifeMs: 400, size: 0.003, band: 0.05, glitterRate: 12, seed: 3,
  } as const;

  it('scales positions by width and height', () => {
    const pixel = toPixelSpawn(spawn, { w: 1280, h: 720 });
    expect(pixel.x).toBe(640);
    expect(pixel.y).toBe(180);
  });

  it('scales velocities by the smaller dimension', () => {
    const pixel = toPixelSpawn(spawn, { w: 1280, h: 720 });
    expect(pixel.vx).toBeCloseTo(144, 6);
    expect(pixel.vy).toBeCloseTo(-72, 6);
    expect(pixel.g).toBeCloseTo(302.4, 6);
  });

  it('never produces an invisible sprite', () => {
    const pixel = toPixelSpawn({ ...spawn, size: 0 }, { w: 100, h: 100 });
    expect(pixel.size).toBeGreaterThan(0);
  });
});
