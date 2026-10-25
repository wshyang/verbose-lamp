// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planOrbTransition } from './orbPlan';

describe('a track that goes nowhere', () => {
  it('keeps the arc finite when the target sits on the origin', () => {
    const plan = planOrbTransition({
      origin: { x: 0.5, y: 0.5 },
      pattern: [{ x: 0.5, y: 0.5 }],
      direction: 'outward',
    });
    const track = plan.tracks[0];
    // With no distance to bend, the control point collapses onto the endpoints
    // instead of dividing by a zero-length chord.
    expect(Number.isFinite(track.control.x) && Number.isFinite(track.control.y)).toBe(true);
    expect(track.control).toEqual({ x: 0.5, y: 0.5 });
  });
});
