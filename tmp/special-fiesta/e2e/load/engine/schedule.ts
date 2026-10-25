/**
 * ADR-350 — the admission schedules (the plan's §4, `schedule.ts`): pure arithmetic over when
 * synthetic users appear. Fixed-N spreads everyone inside a window (the "300 within a
 * configurable window" of claim A); ramp climbs by steps until a ceiling, and the RUNNER —
 * not the schedule — decides to stop at the knee (claim B). Nothing here knows why.
 */

export interface AdmissionStep {
  /** Relative to the run's start. */
  readonly atMs: number;
  readonly admit: number;
}

export interface FixedScheduleOptions {
  users: number;
  windowMs: number;
  /** How many admission steps to spread the users across. */
  batches?: number;
}

/** All `users` admitted within `windowMs`, in even batches — the first at t=0, the last inside the window. */
export function fixedSchedule(options: FixedScheduleOptions): readonly AdmissionStep[] {
  const { users, windowMs } = options;
  const batches = Math.max(1, Math.min(options.batches ?? 10, Math.max(1, users)));
  if (users < 1 || windowMs < 0) {
    throw new Error(`fixedSchedule: users must be >= 1 and windowMs >= 0 — got ${users}/${windowMs}`);
  }
  const base = Math.floor(users / batches);
  const remainder = users % batches;
  const steps: AdmissionStep[] = [];
  let admitted = 0;
  for (let i = 0; i < batches && admitted < users; i += 1) {
    const admit = i < remainder ? base + 1 : base;
    if (admit < 1) continue;
    steps.push({ atMs: Math.floor((windowMs * i) / batches), admit });
    admitted += admit;
  }
  return steps;
}

/** How many users the admission schedule has let in by wall-clock `tMs` (from run start). */
export function expectedAt(steps: readonly AdmissionStep[], tMs: number): number {
  let total = 0;
  for (const step of steps) {
    if (step.atMs > tMs) break;
    total += step.admit;
  }
  return total;
}

export interface RampScheduleOptions {
  /** Users added per step. */
  stepUsers: number;
  /** Time between steps. */
  stepMs: number;
  /** The ramp's hard ceiling — the runner stops earlier at the knee, or here. */
  ceiling: number;
}

/** Steps of `stepUsers` every `stepMs` from zero, the last clipped to `ceiling`. */
export function rampSchedule(options: RampScheduleOptions): readonly AdmissionStep[] {
  const { stepUsers, stepMs, ceiling } = options;
  if (stepUsers < 1 || stepMs < 1 || ceiling < 0) {
    throw new Error(`rampSchedule: stepUsers >= 1, stepMs >= 1, ceiling >= 0 — got ${stepUsers}/${stepMs}/${ceiling}`);
  }
  const steps: AdmissionStep[] = [];
  let admitted = 0;
  for (let i = 0; admitted < ceiling; i += 1) {
    const admit = Math.min(stepUsers, ceiling - admitted);
    steps.push({ atMs: i * stepMs, admit });
    admitted += admit;
  }
  return steps;
}
