import { describe, expect, it } from 'vitest';
import { createRecordingContext, hashText } from './recordingCanvas';

describe('createRecordingContext', () => {
  it('logs draw calls and remembers assigned state', () => {
    const { ctx, log } = createRecordingContext();
    ctx.fillStyle = '#f8dd8a';
    ctx.fillRect(0, 0, 10, 10);
    expect(log).toContain('fillStyle=#f8dd8a');
    expect(log.join('\n')).toContain('fillRect(0,0,10,10)');
    expect(ctx.fillStyle).toBe('#f8dd8a');
  });

  it('measures text before any font has been set', () => {
    const { ctx } = createRecordingContext();
    expect(ctx.measureText('ABC').width).toBeGreaterThan(0);
  });

  it('measures text with the current font size', () => {
    const { ctx } = createRecordingContext();
    ctx.font = '700 40px Georgia';
    expect(ctx.measureText('ABC').width).toBeGreaterThan(0);
    ctx.font = 'inherit';
    expect(ctx.measureText('ABC').width).toBeGreaterThan(0);
  });

  it('returns gradients that record their stops', () => {
    const { ctx, log } = createRecordingContext();
    const linear = ctx.createLinearGradient(0, 0, 1, 0);
    linear.addColorStop(0.5, '#fff');
    const radial = ctx.createRadialGradient(0, 0, 1, 0, 0, 2);
    radial.addColorStop(1, '#000');
    expect(log.join('\n')).toContain('addColorStop(0.5,#fff)');
    expect(log.join('\n')).toContain('addColorStop(1,#000)');
  });
});

describe('hashText', () => {
  it('is stable and separates different strings', () => {
    expect(hashText('THE GREAT GATSBY')).toBe(hashText('THE GREAT GATSBY'));
    expect(hashText('a')).not.toBe(hashText('b'));
  });
});
