import { describe as d2, expect as e2, it as i2 } from 'vitest';
import { createRecordingContext, hashText } from './recordingCanvas';

d2('createRecordingContext', () => {
  i2('records property writes and reads them back', () => {
    const { ctx, log } = createRecordingContext();
    ctx.globalAlpha = 0.5;
    e2(ctx.globalAlpha).toBe(0.5);
    e2(log).toContain('globalAlpha=0.5');
    ctx.lineWidth = 2;
    e2(log).toContain('lineWidth=2');
  });

  i2('measures text by the current font size and hashes deterministically', () => {
    const { ctx, log } = createRecordingContext();
    ctx.font = '700 20px "Poiret One"';
    const small = ctx.measureText('GATSBY').width;
    ctx.font = '700 40px "Poiret One"';
    const large = ctx.measureText('GATSBY').width;
    e2(large).toBeGreaterThan(small);
    e2(hashText('a')).toBe(hashText('a'));
    e2(hashText('a')).not.toBe(hashText('b'));
    e2(log.some((line) => line.startsWith('fillStyle='))).toBe(false);
  });

  i2('falls back to the default size when no font is set', () => {
    const { ctx } = createRecordingContext();
    e2(ctx.measureText('AB').width).toBeGreaterThan(0);
  });
});
