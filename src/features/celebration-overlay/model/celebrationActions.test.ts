import { describe, expect, it, vi } from 'vitest';
import type { SpectacleStage } from '@/features/spectacle';
import {
  buildEffectCall,
  CELEBRATION_ACTIONS,
  CELEBRATION_GROUPS,
  CELEBRATION_ORIGIN,
  findCelebrationAction,
  groupCelebrationActions,
  nextSeed,
  playEffectCall,
} from './celebrationActions';

const CONTEXT = { origin: { x: 0.25, y: 0.75 }, seed: 42 } as const;

describe('celebration catalogue', () => {
  it('offers the four sparkler configurations flying party sparklers', () => {
    const sparklers = CELEBRATION_ACTIONS.filter((a) => a.group === 'sparklers');
    expect(sparklers.map((a) => a.id)).toEqual([
      'sparkler-sides-outward',
      'sparkler-sides-inward',
      'sparkler-corners-outward',
      'sparkler-corners-inward',
    ]);
    expect(buildEffectCall('sparkler-corners-inward', CONTEXT)).toEqual({
      effectId: 'sparkler-transition',
      params: { origin: CONTEXT.origin, pattern: 'corners', direction: 'inward' },
    });
  });

  it('builds a typed call for every action, honouring origin and seed', () => {
    for (const action of CELEBRATION_ACTIONS) {
      const call = buildEffectCall(action.id, CONTEXT);
      expect(call?.effectId).toBeTruthy();
      const params = call?.params as { origin?: unknown; seed?: unknown };
      if ('origin' in params && params.origin !== undefined) expect(params.origin).toEqual(CONTEXT.origin);
      if ('seed' in params && params.seed !== undefined) expect(params.seed).toBe(42);
    }
  });

  it('returns null for an unknown action instead of throwing', () => {
    expect(findCelebrationAction('jazz-hands')).toBeNull();
    expect(buildEffectCall('jazz-hands', CONTEXT)).toBeNull();
  });

  it('plays a built call through the stage exactly once', () => {
    const handle = { finished: Promise.resolve(), stop: vi.fn() };
    const play = vi.fn(() => handle) as unknown as SpectacleStage['play'];
    const call = buildEffectCall('confetti-burst', CONTEXT);
    expect(call).not.toBeNull();
    expect(playEffectCall(play, call!)).toBe(handle);
    expect(play).toHaveBeenCalledWith('confetti', { mode: 'burst', origin: CONTEXT.origin, seed: 42 });
  });

  it('groups actions under their headings with live toggles flagged', () => {
    const groups = groupCelebrationActions(new Set(['champagne']));
    expect(groups.map((g) => g.heading)).toEqual(CELEBRATION_GROUPS.map((g) => g.heading));
    const backdrop = groups.find((g) => g.id === 'backdrop');
    expect(backdrop?.actions.every((a) => a.isToggle)).toBe(true);
    expect(backdrop?.actions.find((a) => a.id === 'champagne')?.isActive).toBe(true);
    expect(backdrop?.actions.find((a) => a.id === 'searchlights')?.isActive).toBe(false);
    const sparklers = groups.find((g) => g.id === 'sparklers');
    expect(sparklers?.actions.every((a) => !a.isToggle && !a.isActive)).toBe(true);
  });

  it('walks seeds deterministically inside a bounded range', () => {
    expect(nextSeed(1925)).toBe((1925 * 9301 + 49297) % 233280);
    let seed = 1925;
    for (let i = 0; i < 50; i++) {
      seed = nextSeed(seed);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(233280);
    }
  });

  it('celebrates from the centre of the stage by default', () => {
    expect(CELEBRATION_ORIGIN).toEqual({ x: 0.5, y: 0.5 });
  });
});
