// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).

import { describe, expect, it } from 'vitest';
import { cardPhase, rigAnchors, searchlightSway } from './choreography';

describe('cardPhase', () => {
  it('is fully zero outside [-0.18, 1.18]', () => {
    const zero = { drawProgress: 0, textProgress: 0, partOpen: 0, opacity: 0 };
    expect(cardPhase({ localT: -0.2, role: 'standard' })).toEqual(zero);
    expect(cardPhase({ localT: 1.2, role: 'standard' })).toEqual(zero);
    expect(cardPhase({ localT: -0.19, role: 'finale' })).toEqual(zero);
    expect(cardPhase({ localT: 1.19, role: 'finale' })).toEqual(zero);
  });

  it('draws, reveals text, parts and fades a standard card', () => {
    const hold = cardPhase({ localT: 0.56, role: 'standard' });
    expect(hold.drawProgress).toBe(1);
    expect(hold.textProgress).toBe(1);
    expect(hold.partOpen).toBe(0);
    expect(hold.opacity).toBe(1);
    const parting = cardPhase({ localT: 0.95, role: 'standard' });
    expect(parting.partOpen).toBeGreaterThan(0);
    expect(parting.opacity).toBeLessThan(1);
    const entering = cardPhase({ localT: -0.1, role: 'standard' });
    expect(entering.opacity).toBeGreaterThan(0);
    expect(entering.opacity).toBeLessThan(1);
    expect(entering.drawProgress).toBe(0);
  });
});
describe('searchlightSway and lightRig', () => {
  it('sways around ±0.36', () => {
    const sway = searchlightSway(0);
    expect(sway.left).toBeCloseTo(-0.36, 10);
    expect(sway.right).toBeCloseTo(0.5, 10);
    for (let e = 0; e < 20; e += 0.5) {
      const s = searchlightSway(e);
      expect(Math.abs(s.left + 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
      expect(Math.abs(s.right - 0.36)).toBeLessThanOrEqual(0.14 + 1e-9);
    }
  });
});
describe('rigAnchors', () => {
  it('anchors to the camera in cinema mode, to the chapter in orbit mode', () => {
    expect(rigAnchors({ cameraMode: 'cinema', cameraZ: 10, chapterZ: -26 }))
      .toEqual({ backdropZ: -2, lightZ: 3.5 });
    expect(rigAnchors({ cameraMode: 'orbit', cameraZ: 10, chapterZ: -26 }))
      .toEqual({ backdropZ: -29.5, lightZ: -22.5 });
  });
});
