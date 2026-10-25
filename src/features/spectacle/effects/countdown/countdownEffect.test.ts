import { describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import type { CountdownParams } from '../../model/types';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { countdownEffect } from './countdownEffect';

function rig(params: CountdownParams) {
  const announce = vi.fn();
  const context = { quality: qualitySettings('high'), reducedMotion: false, announce };
  const { ctx } = createRecordingContext();
  const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
  return { announce, frame, instance: countdownEffect.create(context, params) };
}

describe('countdownEffect', () => {
  it('defaults to five beats of 900 ms and announces completion once', () => {
    const { announce, frame, instance } = rig({});
    expect(instance.update(0, frame)).toBe('running');
    expect(instance.update(5400, frame)).toBe('running');
    expect(announce).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith('Countdown complete');
    expect(instance.update(5501, frame)).toBe('done');
    expect(announce).toHaveBeenCalledOnce();
  });

  it('honours an explicit count and beat, firing onComplete at the end', () => {
    const onComplete = vi.fn();
    const { frame, instance } = rig({ from: 1, beatMs: 10, onComplete });
    expect(instance.update(0, frame)).toBe('running');
    expect(onComplete).not.toHaveBeenCalled();
    expect(instance.update(25, frame)).toBe('running');
    expect(onComplete).toHaveBeenCalledOnce();
    expect(instance.update(121, frame)).toBe('done');
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
