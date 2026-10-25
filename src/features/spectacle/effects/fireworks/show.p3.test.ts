// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planShow } from './show';

describe('planShow defaults and blocked skies', () => {
  it('schedules a default show without an explicit seed or aspect', () => {
    const events = planShow({ durationMs: 4000, intensity: 0.5, finale: true });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(event.tMs).toBeGreaterThanOrEqual(0);
  });

  it('refuses to place shells when the keep-clear area covers the sky', () => {
    const events = planShow({
      durationMs: 4000,
      intensity: 1,
      finale: true,
      keepClear: [{ x: 0, y: 0, w: 1, h: 1 }],
    });
    expect(events).toHaveLength(0);
  });
});
