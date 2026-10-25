import { describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { nameRevealEffect } from './nameRevealEffect';

describe('nameRevealEffect font fitting', () => {
  it('shrinks a long name to fit and falls back to Cinzel for unsupported glyphs', () => {
    const { ctx, log } = createRecordingContext();
    const frame: FrameInfo = { ctx, w: 200, h: 200, fade: 1 };
    const announce = vi.fn();
    const context = { quality: qualitySettings('high'), reducedMotion: false, announce };
    const name = '李 Bartholomew Featherstonehaugh';
    const instance = nameRevealEffect.create(context, { name, durationMs: 1000 });

    expect(instance.update(400, frame)).toBe('running');
    expect(announce).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith(name);

    const fonts = log.filter((entry) => entry.startsWith('font='));
    const sizes = new Set(fonts.map((entry) => /(\d+(?:\.\d+)?)px/.exec(entry)?.[1]));
    expect(sizes.size).toBeGreaterThan(1); // the fit loop stepped the size down
    expect(fonts.every((entry) => !entry.includes('Decorative'))).toBe(true);

    expect(instance.update(1100, frame)).toBe('done');
  });
});
