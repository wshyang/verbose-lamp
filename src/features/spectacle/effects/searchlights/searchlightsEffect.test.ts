import { describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { searchlightsEffect } from './searchlightsEffect';

const context = { quality: qualitySettings('high'), reducedMotion: false, announce: vi.fn() };

function runOnce(params: Parameters<typeof searchlightsEffect.create>[1]): string[] {
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
  const instance = searchlightsEffect.create(context, params);
  expect(instance.update(0, frame)).toBe('running');
  return log;
}

describe('searchlightsEffect', () => {
  it('defaults to three beams and leaves the frame untouched without keep-clear', () => {
    const log = runOnce({});
    expect(log.some((entry) => entry.startsWith('createLinearGradient('))).toBe(true);
    expect(log).not.toContain('globalCompositeOperation=destination-out');
  });

  it('dims the beams back out of a keep-clear rect', () => {
    const log = runOnce({ beams: 1, seed: 7, keepClear: [{ x: 0.4, y: 0.2, w: 0.2, h: 0.3 }] });
    expect(log).toContain('globalCompositeOperation=destination-out');
    expect(log).toContain('fillRect(512,144,256,216)');
    expect(log).toContain('globalCompositeOperation=lighter');
  });
});
