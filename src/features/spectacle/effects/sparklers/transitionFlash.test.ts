import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '../../testing/recordingCanvas';
import type { FrameInfo } from '../../engine/types';
import { planOrbTransition } from '../orbs/orbPlan';
import { drawShockwave, drawTransitionFlash } from './transitionFlash';

const ORIGIN = { x: 0.5, y: 0.5 } as const;
const outward = planOrbTransition({ origin: ORIGIN, pattern: 'sides', direction: 'outward' });
const inward = planOrbTransition({ origin: ORIGIN, pattern: 'sides', direction: 'inward' });

function frame(fade = 1) {
  const { ctx, log } = createRecordingContext();
  const info: FrameInfo = { ctx, w: 1280, h: 720, fade };
  return { info, log };
}

describe('drawTransitionFlash', () => {
  it('draws nothing while the flash plan is quiet', () => {
    const { info, log } = frame();

    drawTransitionFlash(outward, 0, info);

    expect(log).toHaveLength(0);
  });

  it('whites the frame out at the plateau with a glow and an anamorphic streak', () => {
    const { info, log } = frame();
    const plateau = outward.flash[0].startMs + outward.flash[0].attackMs + 10;

    drawTransitionFlash(outward, plateau, info);

    expect(log.filter((line) => line.startsWith('fillRect(')).length).toBe(3);
    expect(log.filter((line) => line.startsWith('createRadialGradient')).length).toBe(1);
    expect(log.filter((line) => line.startsWith('createLinearGradient')).length).toBe(1);
  });

  it('centres the glow and streak on the origin', () => {
    const { info, log } = frame();

    drawTransitionFlash(outward, outward.flash[0].attackMs + 10, info);

    expect(log.some((line) => line.startsWith('createRadialGradient(640,360,'))).toBe(true);
    expect(log.some((line) => line.startsWith('createLinearGradient(0,360,1280,360)'))).toBe(true);
  });

  it('dims with the effect fade and stops drawing once the level is below the visible cutoff', () => {
    const at = outward.flash[0].attackMs + 10;
    const full = frame(1);
    const faint = frame(0.2);
    const invisible = frame(0.001);

    drawTransitionFlash(outward, at, full.info);
    drawTransitionFlash(outward, at, faint.info);
    drawTransitionFlash(outward, at, invisible.info);

    const washAlpha = (log: readonly string[]) => Number(/fillStyle=rgba\(255,246,220,([\d.]+)\)/.exec(log[0])![1]);
    expect(washAlpha(faint.log)).toBeLessThan(washAlpha(full.log));
    expect(invisible.log).toHaveLength(0);
  });
});

describe('drawShockwave', () => {
  const meet = inward.collisionMs as number;

  it('does not exist for outward flights, which never collide', () => {
    const { info, log } = frame();

    drawShockwave(outward, 5000, info);

    expect(log).toHaveLength(0);
  });

  it('waits for the collision', () => {
    const { info, log } = frame();

    drawShockwave(inward, meet - 1, info);

    expect(log).toHaveLength(0);
  });

  it('expands a ring from the origin after the collision and thins as it grows', () => {
    const early = frame();
    const late = frame();

    drawShockwave(inward, meet + 65, early.info);
    drawShockwave(inward, meet + 520, late.info);

    const radius = (log: readonly string[]) => Number(/arc\(640,360,([\d.]+)/.exec(log.find((line) => line.startsWith('arc('))!)![1]);
    const width = (log: readonly string[]) => Number(log.find((line) => line.startsWith('lineWidth='))!.slice(10));
    expect(radius(late.log)).toBeGreaterThan(radius(early.log));
    expect(width(late.log)).toBeLessThan(width(early.log));
  });

  it('is gone 650 ms after the collision and restores the alpha it changed', () => {
    const during = frame();
    const after = frame();

    drawShockwave(inward, meet + 300, during.info);
    drawShockwave(inward, meet + 651, after.info);

    expect(during.log[during.log.length - 1]).toBe('globalAlpha=1');
    expect(after.log).toHaveLength(0);
  });
});
