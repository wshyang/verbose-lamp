import { describe, expect, it } from 'vitest';
import { beatAt, planCountdown } from './countdownPlan';

describe('countdownPlan', () => {
  it('runs from N down to 0 inclusive', () => {
    const plan = planCountdown(5, 900);
    expect(plan.beats.length).toBe(6);
    expect(plan.beats[0].value).toBe(5);
    expect(plan.beats[5].value).toBe(0);
    expect(plan.totalMs).toBe(5400);
  });

  it('beatAt maps time to the right numeral', () => {
    const plan = planCountdown(3, 1000);
    expect(beatAt(plan, 0)?.value).toBe(3);
    expect(beatAt(plan, 2500)?.value).toBe(1);
    expect(beatAt(plan, 3999)?.value).toBe(0);
    expect(beatAt(plan, 4000)).toBeNull();
  });

  it('clamps absurd inputs instead of throwing', () => {
    expect(planCountdown(0, 800).beats.length).toBe(2);
    expect(planCountdown(99, 800).beats.length).toBe(11);
  });
});