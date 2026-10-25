import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameInfo } from '../../engine/types';
import { qualitySettings } from '../../model/quality';
import type { SparklerTransitionParams } from '../../model/types';
import {
  createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals,
} from '../../testing/recordingCanvas';
import { planOrbCrossfade, planOrbTransition } from '../orbs/orbPlan';
import { sparklerTransitionEffect } from './sparklerTransitionEffect';

const ORIGIN = { x: 0.5, y: 0.5 } as const;
const VIEWPORT = { w: 1280, h: 720 } as const;

function transition(overrides: Partial<SparklerTransitionParams> = {}, reducedMotion = false) {
  const onCovered = vi.fn();
  const params: SparklerTransitionParams = {
    origin: ORIGIN, pattern: 'sides', direction: 'outward', onCovered, ...overrides,
  };
  const instance = sparklerTransitionEffect.create(
    { quality: qualitySettings('high'), reducedMotion, announce: () => undefined },
    params,
  );
  const { ctx, log } = createRecordingContext();
  const frame: FrameInfo = { ctx, ...VIEWPORT, fade: 1 };
  return { instance, frame, log, onCovered, params };
}

const radial = (log: readonly string[]) => log.filter((line) => line.startsWith('createRadialGradient')).length;

// The sparkler head replaced the old three-glow orb and the transition was renamed; the
// choreography must not have moved.
// These pin the parts a host depends on: the cover point, the crossfade and the end.
describe('sparklerTransitionEffect choreography', () => {
  beforeEach(stubBrowserGlobals);
  afterEach(unstubBrowserGlobals);

  it('is the sparkler-transition effect on the light overlay', () => {
    expect(sparklerTransitionEffect.id).toBe('sparkler-transition');
    expect(sparklerTransitionEffect.layer).toBe('light-overlay');
  });

  for (const direction of ['outward', 'inward'] as const) {
    it(`fires onCovered exactly once, at the planned cover point (${direction})`, () => {
      const { instance, frame, onCovered, params } = transition({ direction });
      const coverAt = planOrbTransition(params).onCoveredMs;

      instance.update(coverAt - 1, frame);
      expect(onCovered).not.toHaveBeenCalled();
      instance.update(coverAt, frame);
      instance.update(coverAt + 100, frame);
      instance.update(coverAt + 200, frame);

      expect(onCovered).toHaveBeenCalledTimes(1);
    });
  }

  it('fires onCovered at the crossfade point under reduced motion, and flies nothing', () => {
    const { instance, frame, log, onCovered, params } = transition({}, true);
    const coverAt = planOrbCrossfade(params).onCoveredMs;

    instance.update(coverAt, frame);

    expect(onCovered).toHaveBeenCalledTimes(1);
    expect(log.filter((line) => line.startsWith('stroke')).length).toBe(0);
  });

  it('works without an onCovered callback', () => {
    const { instance, frame, params } = transition({ onCovered: undefined });

    expect(() => instance.update(planOrbTransition(params).onCoveredMs + 10, frame)).not.toThrow();
  });

  it('keeps running until half a second after the planned duration, then reports done', () => {
    const { instance, frame, params } = transition();
    const { durationMs } = planOrbTransition(params);

    expect(instance.update(durationMs + 499, frame)).toBe('running');
    expect(instance.update(durationMs + 501, frame)).toBe('done');
  });

  // PR #2's hand-held look: a wire trails each sparkler so it reads as a sparkler, not a ball.
  it('trails a wire behind each flying sparkler and draws none before launch', () => {
    const early = transition();
    const flying = transition();
    const plan = planOrbTransition(flying.params);

    early.instance.update(0, early.frame);
    flying.instance.update((plan.travelStartMs + plan.travelEndMs) / 2, flying.frame);

    const wires = (log: readonly string[]) => log.filter((line) => line.startsWith('strokeStyle=rgba(42,38,34')).length;
    expect(wires(early.log)).toBe(0);
    expect(wires(flying.log)).toBe(plan.tracks.length);
  });

  it('draws no wire in the reduced-motion crossfade', () => {
    const { instance, frame, log, params } = transition({}, true);

    instance.update(planOrbCrossfade(params).onCoveredMs, frame);

    expect(log.filter((line) => line.startsWith('strokeStyle=rgba(42,38,34')).length).toBe(0);
  });

  it('draws a glowing head on each flying sparkler mid-flight and none before launch', () => {
    const early = transition();
    const flying = transition();
    const plan = planOrbTransition(flying.params);
    const midFlight = (plan.travelStartMs + plan.travelEndMs) / 2;

    early.instance.update(0, early.frame);
    flying.instance.update(midFlight, flying.frame);

    expect(radial(early.log)).toBe(0);
    expect(radial(flying.log)).toBeGreaterThan(0);
  });

  it('fires a shockwave and a spray only when inward orbs meet', () => {
    const inward = transition({ direction: 'inward' });
    const outward = transition({ direction: 'outward' });
    const plan = planOrbTransition(inward.params);
    const meet = plan.collisionMs as number;

    inward.instance.update(meet + 80, inward.frame);
    outward.instance.update(meet + 80, outward.frame);

    expect(plan.collisionMs).not.toBeNull();
    expect(planOrbTransition(outward.params).collisionMs).toBeNull();
    expect(inward.log.filter((line) => line.startsWith('drawImage(')).length).toBeGreaterThan(
      outward.log.filter((line) => line.startsWith('drawImage(')).length,
    );
  });

  it('fires the collision spray once, not on every frame after the meeting', () => {
    const { instance, frame, log, params } = transition({ direction: 'inward' });
    const meet = planOrbTransition(params).collisionMs as number;
    const sprites = () => log.filter((line) => line.startsWith('drawImage(')).length;

    instance.update(meet, frame);
    const first = sprites();
    instance.update(meet + 1, frame);
    const second = sprites() - first;
    instance.update(meet + 2, frame);
    const third = sprites() - first - second;

    // Each later frame only draws the burst already in flight (plus new crackle), so it adds
    // roughly the same again; a re-fired burst would pile 110 new sparks onto every frame.
    expect(third).toBeLessThan(second + 60);
  });

  it('draws an expanding ring after inward sparklers meet', () => {
    const { instance, frame, log, params } = transition({ direction: 'inward' });
    const meet = planOrbTransition(params).collisionMs as number;

    instance.update(meet + 100, frame);

    expect(log.some((line) => line === 'strokeStyle=rgba(255,220,140,0.9)')).toBe(true);
  });

  it('draws no ring for outward flights', () => {
    const { instance, frame, log, params } = transition({ direction: 'outward' });

    instance.update(planOrbTransition(params).durationMs - 200, frame);

    expect(log.some((line) => line === 'strokeStyle=rgba(255,220,140,0.9)')).toBe(false);
  });

  it('uses the crossfade timeline under reduced motion, not the flight one', () => {
    const { instance, frame, onCovered, params } = transition({}, true);
    const crossfadeCover = planOrbCrossfade(params).onCoveredMs;
    const flightCover = planOrbTransition(params).onCoveredMs;

    expect(crossfadeCover).not.toBe(flightCover);
    instance.update(Math.min(crossfadeCover, flightCover), frame);

    expect(onCovered).toHaveBeenCalledTimes(crossfadeCover < flightCover ? 1 : 0);
    expect(instance.update(planOrbCrossfade(params).durationMs + 501, frame)).toBe('done');
  });

  // The gate hides a spark when its seeded hash falls below 0.3. Pinning `hash01` high makes every
  // spark visible, and pinning it low hides them all, so the effect's draw count must follow it.
  describe('glitter gate', () => {
    afterEach(() => vi.doUnmock('@/shared/lib/random'));

    async function spritesWithGate(gate: number) {
      vi.resetModules();
      vi.doMock('@/shared/lib/random', async (importOriginal) => ({
        ...(await importOriginal<typeof import('@/shared/lib/random')>()),
        hash01: () => gate,
      }));
      const { sparklerTransitionEffect: effect } = await import('./sparklerTransitionEffect');
      const { createRecordingContext: record } = await import('../../testing/recordingCanvas');
      const { ctx, log } = record();
      const instance = effect.create(
        { quality: qualitySettings('high'), reducedMotion: false, announce: () => undefined },
        { origin: ORIGIN, pattern: 'sides', direction: 'inward' },
      );
      const plan = planOrbTransition({ origin: ORIGIN, pattern: 'sides', direction: 'inward' });
      for (let t = 0; t <= plan.durationMs; t += 40) instance.update(t, { ctx, ...VIEWPORT, fade: 1 });
      return log.filter((line) => line.startsWith('drawImage(')).length;
    }

    it('draws every spark when the gate passes and none when it blocks', async () => {
      expect(await spritesWithGate(0.9)).toBeGreaterThan(0);
      expect(await spritesWithGate(0.1)).toBe(0);
    });
  });
});
