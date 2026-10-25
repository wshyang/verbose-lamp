import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import {
  createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals,
} from '../../testing/recordingCanvas';
import { sparklersEffect } from './sparklersEffect';

function makeEffect(direction: 'outward' | 'inward') {
  return sparklersEffect.create(
    { quality: qualitySettings('high'), reducedMotion: false, announce: () => undefined },
    { origin: { x: 0.5, y: 0.5 }, pattern: 'sides', direction }
  );
}

describe('sparklersEffect', () => {
  beforeEach(stubBrowserGlobals);
  afterEach(unstubBrowserGlobals);

  it('draws visible wire sticks, burning tips, and crackle sprites in flight', () => {
    const { ctx, log } = createRecordingContext();
    const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
    const effect = makeEffect('outward');
    effect.update(700, frame);
    effect.update(740, frame);
    expect(log.some((entry) => entry.startsWith('strokeStyle=rgba(42,38,34'))).toBe(true);
    expect(log.filter((entry) => entry.startsWith('arc(')).length).toBeGreaterThan(4);
    expect(log.filter((entry) => entry.startsWith('drawImage(')).length).toBeGreaterThan(4);
  });

  it('fires the radial spray and full flash at an inward collision', () => {
    const { ctx, log } = createRecordingContext();
    const frame: FrameInfo = { ctx, w: 1280, h: 720, fade: 1 };
    const effect = makeEffect('inward');
    effect.update(1000, frame);
    effect.update(1040, frame);
    expect(log.some((entry) => entry.startsWith('fillStyle=rgba(255,246,220'))).toBe(true);
    expect(log.filter((entry) => entry.startsWith('drawImage(')).length).toBeGreaterThan(50);
  });
});
