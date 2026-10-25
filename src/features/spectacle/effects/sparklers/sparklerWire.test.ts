import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { drawSparklerWire } from './sparklerWire';

const GEOMETRY = {
  tip: { x: 400, y: 300 },
  burnFront: { x: 360, y: 306 },
  handle: { x: 280, y: 312 },
} as const;

const strokes = (log: readonly string[]) => log.filter((line) => line.startsWith('stroke()')).length;

describe('drawSparklerWire', () => {
  it('strokes the dark wire, its highlight and the glowing coating', () => {
    const { ctx, log } = createRecordingContext();

    drawSparklerWire({ ctx, geometry: GEOMETRY, scale: 1, fade: 1 });

    expect(strokes(log)).toBe(3);
    expect(log.some((line) => line.startsWith('strokeStyle=rgba(42,38,34'))).toBe(true);
    expect(log.filter((line) => line.startsWith('createLinearGradient')).length).toBe(1);
  });

  it('draws the wire from the handle to the burn front and the coating from there to the tip', () => {
    const { ctx, log } = createRecordingContext();

    drawSparklerWire({ ctx, geometry: GEOMETRY, scale: 1, fade: 1 });

    expect(log).toContain('moveTo(280,312)');
    expect(log).toContain('lineTo(360,306)');
    expect(log).toContain('moveTo(360,306)');
    expect(log).toContain('lineTo(400,300)');
  });

  it('scales its stroke widths with the viewport, with a visible floor', () => {
    const small = createRecordingContext();
    const large = createRecordingContext();
    const widths = (log: readonly string[]) => log.filter((line) => line.startsWith('lineWidth=')).map((line) => Number(line.slice(10)));

    drawSparklerWire({ ctx: small.ctx, geometry: GEOMETRY, scale: 0.1, fade: 1 });
    drawSparklerWire({ ctx: large.ctx, geometry: GEOMETRY, scale: 2, fade: 1 });

    expect(Math.min(...widths(small.log))).toBeGreaterThanOrEqual(1);
    expect(Math.max(...widths(large.log))).toBeGreaterThan(Math.max(...widths(small.log)));
  });

  it('fades with the effect and draws nothing once fully faded', () => {
    const half = createRecordingContext();
    const gone = createRecordingContext();

    drawSparklerWire({ ctx: half.ctx, geometry: GEOMETRY, scale: 1, fade: 0.5 });
    drawSparklerWire({ ctx: gone.ctx, geometry: GEOMETRY, scale: 1, fade: 0 });

    expect(half.log.some((line) => line.includes('rgba(42,38,34,0.47)'))).toBe(true);
    expect(gone.log).toHaveLength(0);
  });
});
