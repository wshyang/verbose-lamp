import { describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import type { FlashParams } from '../../model/types';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { flashEffect } from './flashEffect';

function rig(params: FlashParams) {
  const context = { quality: qualitySettings('high'), reducedMotion: false, announce: vi.fn() };
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
  return { frame, log, instance: flashEffect.create(context, params) };
}

describe('flashEffect', () => {
  it('defaults to a centred 700 ms flash', () => {
    const { frame, log, instance } = rig({});
    expect(instance.update(100, frame)).toBe('running');
    expect(log.some((entry) => entry.startsWith('createRadialGradient(640,324,0,640,324,'))).toBe(true);
    expect(instance.update(700, frame)).toBe('running');
    expect(instance.update(701, frame)).toBe('done');
  });

  it('honours an explicit origin and duration', () => {
    const { frame, log, instance } = rig({ origin: { x: 0.25, y: 0.25 }, durationMs: 10 });
    expect(instance.update(10, frame)).toBe('running');
    expect(log.some((entry) => entry.startsWith('createRadialGradient(320,180,0,320,180,'))).toBe(true);
    expect(instance.update(11, frame)).toBe('done');
  });
});
