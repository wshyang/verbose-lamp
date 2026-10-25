import { describe, expect, it } from 'vitest';
import { planOrbTransition } from '../orbs/orbPlan';
import { sparklerPose } from './transitionPose';

const ORIGIN = { x: 0.5, y: 0.5 } as const;
const plan = (direction: 'outward' | 'inward') => planOrbTransition({ origin: ORIGIN, pattern: 'sides', direction });
const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9);

describe('sparklerPose', () => {
  it('is absent before the sparkler launches and after it has landed', () => {
    const outward = plan('outward');

    expect(sparklerPose(outward, 0, outward.travelStartMs - 1)).toBeNull();
    expect(sparklerPose(outward, 0, outward.travelEndMs + 31)).toBeNull();
  });

  it('lingers for 30 ms after the end so the last frame is not cut short', () => {
    const outward = plan('outward');

    expect(sparklerPose(outward, 0, outward.travelEndMs + 30)).not.toBeNull();
  });

  it('flies outward from the origin to the track target', () => {
    const outward = plan('outward');

    near(sparklerPose(outward, 0, outward.travelStartMs)!.point, ORIGIN);
    near(sparklerPose(outward, 0, outward.travelEndMs)!.point, outward.tracks[0].target);
  });

  it('flies inward from the track target to the origin', () => {
    const inward = plan('inward');

    near(sparklerPose(inward, 1, inward.travelStartMs)!.point, inward.tracks[1].target);
    near(sparklerPose(inward, 1, inward.travelEndMs)!.point, ORIGIN);
  });

  it('reports progress 0 at launch, 1 at landing, and clamps in the grace window', () => {
    const outward = plan('outward');

    expect(sparklerPose(outward, 0, outward.travelStartMs)!.progress).toBe(0);
    expect(sparklerPose(outward, 0, outward.travelEndMs)!.progress).toBe(1);
    expect(sparklerPose(outward, 0, outward.travelEndMs + 20)!.progress).toBe(1);
  });

  it('points its heading the way it is travelling', () => {
    const outward = plan('outward');
    const mid = (outward.travelStartMs + outward.travelEndMs) / 2;
    const pose = sparklerPose(outward, 0, mid)!;
    const target = outward.tracks[0].target;

    // Heading is the local tangent, so it must head away from the origin toward the target.
    const toTarget = { x: target.x - ORIGIN.x, y: target.y - ORIGIN.y };
    expect(pose.dx * toTarget.x + pose.dy * toTarget.y).toBeGreaterThan(0);
  });

  it('heads the opposite way when the same track is flown inward', () => {
    const outward = plan('outward');
    const inward = plan('inward');
    const out = sparklerPose(outward, 0, (outward.travelStartMs + outward.travelEndMs) / 2)!;
    const back = sparklerPose(inward, 0, (inward.travelStartMs + inward.travelEndMs) / 2)!;

    expect(out.dx * back.dx + out.dy * back.dy).toBeLessThan(0);
  });

  it('eases outward flight in (slow start) and inward flight out (fast start)', () => {
    const outward = plan('outward');
    const inward = plan('inward');
    const earlyOut = sparklerPose(outward, 0, outward.travelStartMs + (outward.travelEndMs - outward.travelStartMs) * 0.25)!;
    const earlyIn = sparklerPose(inward, 0, inward.travelStartMs + (inward.travelEndMs - inward.travelStartMs) * 0.25)!;
    const travelled = (pose: { point: { x: number; y: number } }, from: { x: number; y: number }) =>
      Math.hypot(pose.point.x - from.x, pose.point.y - from.y);
    const outLength = Math.hypot(outward.tracks[0].target.x - ORIGIN.x, outward.tracks[0].target.y - ORIGIN.y);
    const inLength = Math.hypot(inward.tracks[0].target.x - ORIGIN.x, inward.tracks[0].target.y - ORIGIN.y);

    expect(travelled(earlyOut, ORIGIN) / outLength).toBeLessThan(0.25);
    expect(travelled(earlyIn, inward.tracks[0].target) / inLength).toBeGreaterThan(0.25);
  });
});
