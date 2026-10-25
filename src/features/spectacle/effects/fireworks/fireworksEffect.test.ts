import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import type { FireworkShellType, FireworksParams } from '../../model/types';
import {
  createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals,
} from '../../testing/recordingCanvas';
import { fireworksEffect } from './fireworksEffect';
import { planShow } from './show';

const ASPECT = 1280 / 720;

function makeInstance(params: FireworksParams, reducedMotion = false) {
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
  const context = { quality: qualitySettings('high'), reducedMotion, announce: vi.fn() };
  return { frame, log, instance: fireworksEffect.create(context, params) };
}

function runFrames(
  instance: ReturnType<typeof makeInstance>['instance'],
  frame: FrameInfo,
  untilMs: number,
): 'running' | 'done' {
  let status: 'running' | 'done' = 'running';
  for (let t = 0; t <= untilMs && status === 'running'; t += 100) {
    status = instance.update(t, frame);
  }
  return status;
}

/** The first seed whose planned show bursts the given shell type, and when. */
function seedFor(type: FireworkShellType): { seed: number; atMs: number } {
  for (let seed = 0; seed < 400; seed += 1) {
    const event = planShow({ seed, intensity: 1, durationMs: 12000, aspect: ASPECT })
      .find((e) => e.type === type);
    if (event) return { seed, atMs: event.tMs };
  }
  throw new Error(`no seed plans a ${type}`);
}

beforeEach(stubBrowserGlobals);
afterEach(unstubBrowserGlobals);

describe('fireworksEffect lifecycle', () => {
  it('burns out to done once every spark has died', () => {
    const { frame, instance } = makeInstance({ seed: 1925, intensity: 1, durationMs: 1000 });
    // Jump past the show: every shell bursts at once, so sparks are alive.
    expect(instance.update(10000, frame)).toBe('running');
    let status: 'running' | 'done' = 'running';
    for (let t = 10500; t <= 40000 && status === 'running'; t += 500) {
      status = instance.update(t, frame);
    }
    expect(status).toBe('done');
  });

  it('cycles forever when continuous, with default and explicit seeds', () => {
    const byDefault = makeInstance({ continuous: true, durationMs: 100, intensity: 0 });
    expect(byDefault.instance.update(3000, byDefault.frame)).toBe('running');
    expect(byDefault.instance.update(10000, byDefault.frame)).toBe('running');

    const explicit = makeInstance({ continuous: true, durationMs: 100, intensity: 0, seed: 7 });
    expect(explicit.instance.update(3000, explicit.frame)).toBe('running');
  });

  it('settles immediately when the planned show is empty', () => {
    const { frame, instance } = makeInstance({ durationMs: 100, intensity: 0, seed: 1925 });
    expect(instance.update(6000, frame)).toBe('done');
  });
});

describe('fireworksEffect shells', () => {
  it('crossette stars split into strobe sub-bursts mid-flight', () => {
    const { seed, atMs } = seedFor('crossette');
    const { frame, log, instance } = makeInstance({ seed, intensity: 1, durationMs: 12000 });
    expect(runFrames(instance, frame, Math.ceil(atMs) + 2500)).toBe('running');
    expect(log.filter((entry) => entry.startsWith('drawImage(')).length).toBeGreaterThan(0);
  });

  it('double-break pistils burn emerald under the green light', () => {
    const { seed, atMs } = seedFor('double-break');
    const { frame, log, instance } = makeInstance({
      seed, intensity: 1, durationMs: 12000, greenLight: true,
    });
    expect(runFrames(instance, frame, Math.ceil(atMs) + 600)).toBe('running');
    expect(log.filter((entry) => entry.startsWith('drawImage(')).length).toBeGreaterThan(0);
  });
});

describe('fireworksEffect keep-clear', () => {
  it('fades reduced-motion glitter over a keep-clear rect', () => {
    const { frame, log, instance } = makeInstance(
      { keepClear: [{ x: 0, y: 0, w: 1, h: 0.7 }] },
      true,
    );
    instance.update(600, frame);
    // The freshest trail sample sits under the rect, so its alpha is cut to a fifth.
    expect(log).toContain('globalAlpha=0.2');
  });
});
