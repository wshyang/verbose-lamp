import { describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import type { ConfettiParams } from '../../model/types';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { confettiEffect } from './confettiEffect';

function rig(params: ConfettiParams) {
  const context = { quality: qualitySettings('high'), reducedMotion: false, announce: vi.fn() };
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
  return { frame, log, instance: confettiEffect.create(context, params) };
}

describe('confettiEffect', () => {
  it('ends once its explicit duration and settle time have passed', () => {
    const { frame, log, instance } = rig({
      mode: 'burst', origin: { x: 0.5, y: 0.5 }, count: 3, seed: 1925, durationMs: 100,
    });
    expect(instance.update(300, frame)).toBe('running');
    expect(log.some((entry) => entry.startsWith('fillRect('))).toBe(true);
    expect(instance.update(1700, frame)).toBe('done');
  });

  it('defaults its seed and duration for a gentle rain', () => {
    const { frame, instance } = rig({ mode: 'rain', count: 1 });
    expect(instance.update(0, frame)).toBe('running');
  });
});
