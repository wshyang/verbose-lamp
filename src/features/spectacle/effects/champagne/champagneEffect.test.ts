import { describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import { createRecordingContext } from '../../testing/recordingCanvas';
import { champagneEffect } from './champagneEffect';

describe('champagneEffect', () => {
  it('retires beads that rise past the top of the glass', () => {
    const { ctx, log } = createRecordingContext();
    const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
    const context = { quality: qualitySettings('high'), reducedMotion: false, announce: vi.fn() };
    const instance = champagneEffect.create(context, { rate: 20, seed: 1925 });
    const arcs = () => log.filter((entry) => entry.startsWith('arc(')).length;

    instance.update(100, frame); // first bead spawns and draws its two arcs
    expect(arcs()).toBe(2);

    instance.update(30000, frame); // the first bead has left; only the new one draws
    expect(arcs()).toBe(4);
  });
});

describe('champagneEffect defaults', () => {
  it('runs with the default seed and rate when created without params', () => {
    const { ctx, log } = createRecordingContext();
    const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
    const context = { quality: qualitySettings('high'), reducedMotion: false, announce: vi.fn() };
    const instance = champagneEffect.create(context, {});
    instance.update(200, frame); // past the 1000 / 7 ms default-rate interval
    expect(log.filter((entry) => entry.startsWith('arc(')).length).toBe(2);
  });
});
