// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { installCanvas2d, canvasCalls, type Canvas2d } from './canvas2d';

/**
 * The recording canvas backs the typography tests, so it has to be right in its own terms: a log
 * that rounds, a gradient that names itself, pixel APIs that return real typed arrays.
 */
let recorder: Canvas2d;
let ctx: CanvasRenderingContext2D;

beforeEach(() => {
  recorder = installCanvas2d();
  ctx = document.createElement('canvas').getContext('2d')!;
});

describe('installCanvas2d', () => {
  it('records a draw call with its arguments rounded to three places', () => {
    ctx.moveTo(1.23456, 2);
    ctx.lineTo(3, 4.00049);

    expect(recorder.calls).toEqual(['moveTo(1.235,2)', 'lineTo(3,4)']);
  });

  it('records a property write and reads it back', () => {
    ctx.lineWidth = 7;

    expect(ctx.lineWidth).toBe(7);
    expect(recorder.calls).toEqual(['lineWidth=7']);
  });

  it('numbers gradients in creation order, across linear and radial', () => {
    const first = ctx.createLinearGradient(0, 0, 1, 1);
    const second = ctx.createRadialGradient(0, 0, 1, 2, 2, 3);
    first.addColorStop(0, 'red');
    second.addColorStop(1, 'blue');

    expect(recorder.calls).toEqual([
      'createLinearGradient(0,0,1,1)',
      'createRadialGradient(0,0,1,2,2,3)',
      'gradient#1.addColorStop(0,red)',
      'gradient#2.addColorStop(1,blue)',
    ]);
  });

  it('returns a zeroed, correctly sized pixel buffer, opaque only when asked', () => {
    const empty = ctx.getImageData(0, 0, 3, 2);
    expect(empty.data.length).toBe(24);
    expect(Array.from(empty.data).every((value) => value === 0)).toBe(true);

    const opaque = installCanvas2d({ opaqueReadback: true });
    const solid = document.createElement('canvas').getContext('2d')!.getImageData(0, 0, 3, 2);
    expect(Array.from(solid.data).filter((value) => value === 255)).toHaveLength(6);
    expect(opaque.calls).toContain('getImageData(3x2)');
  });

  it('keeps the images written with putImageData, in order', () => {
    const a = ctx.createImageData(2, 2);
    const b = ctx.createImageData(1, 1);
    ctx.putImageData(a, 0, 0);
    ctx.putImageData(b, 0, 0);

    expect(recorder.images).toEqual([a, b]);
    expect(recorder.calls).toEqual(['createImageData(2x2)', 'createImageData(1x1)', 'putImageData(2x2)', 'putImageData(1x1)']);
  });

  it('measures text as ten pixels a character', () => {
    expect(ctx.measureText('abcd').width).toBe(40);
  });

  // `createPattern` is on the recorded-method list, so it is logged and its return value is the
  // log's new length (what `calls.push` returns), not a pattern object. Nothing here uses the pattern.
  it('logs createPattern as a call', () => {
    ctx.createPattern(document.createElement('canvas'), 'repeat');

    expect(recorder.calls[0]).toMatch(/^createPattern\(/);
  });

  it('gives each getContext call its own context, all feeding one log', () => {
    const other = document.createElement('canvas').getContext('2d')!;
    ctx.fill();
    other.stroke();

    expect(recorder.contexts).toHaveLength(2);
    expect(recorder.calls).toEqual(['fill()', 'stroke()']);
  });

  it('answers null for any context that is not 2d', () => {
    expect(document.createElement('canvas').getContext('webgl')).toBeNull();
  });

  it('exposes the live log to code that does not hold the recorder', () => {
    ctx.save();

    expect(canvasCalls()).toEqual(['save()']);
  });
});
