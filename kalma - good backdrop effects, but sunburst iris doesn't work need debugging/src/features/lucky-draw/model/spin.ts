/**
 * Spin profile (ADDENDUM-020 §3.7): windup −0.3 slot, linear ease-in to vMax,
 * cruise, cubic ease-out decel (distance vMax·td/3), optional damped settle.
 * Whole turns are solved so P_end ≡ winnerIndex (mod N) with cruise ≥ min.
 */
export interface SpinOptions {
  startP: number;
  winnerIndex: number;
  n: number;
  vMax?: number;
  accelMs?: number;
  minCruiseMs?: number;
  decelMs?: number;
  settle?: boolean;
}

export interface SpinProfile {
  durationMs: number;
  endP: number;
  cruiseMs: number;
  positionAt(ms: number): number;
  velocityAt(ms: number): number;
}

interface Phases {
  base: number;
  w: number;
  ta: number;
  tc: number;
  td: number;
  ts: number;
  vMax: number;
  accelDist: number;
  cruiseDist: number;
  endP: number;
}

function solvePhases(o: SpinOptions): Phases {
  const vMax = o.vMax ?? 13;
  const w = 0.26;
  const ta = (o.accelMs ?? 900) / 1000;
  const td = (o.decelMs ?? 2600) / 1000;
  const ts = o.settle === false ? 0 : 0.7;
  const base = o.startP - 0.3;
  const accelDist = (vMax * ta) / 2;
  const decelDist = (vMax * td) / 3;
  const minCruise = (vMax * (o.minCruiseMs ?? 900)) / 1000;
  const delta0 = (((o.winnerIndex - base) % o.n) + o.n) % o.n;
  const needed = accelDist + decelDist + minCruise;
  const turns = Math.max(0, Math.ceil((needed - delta0) / o.n));
  const total = delta0 + turns * o.n;
  const cruiseDist = total - accelDist - decelDist;
  return {
    base, w, ta, tc: cruiseDist / vMax, td, ts, vMax, accelDist, cruiseDist,
    endP: base + total,
  };
}

function positionIn(p: Phases, t: number): number {
  if (t < p.w) {
    const u = t / p.w;
    return p.base + 0.3 - 0.3 * (u * u * (3 - 2 * u));
  }
  if (t < p.w + p.ta) {
    const u = (t - p.w) / p.ta;
    return p.base + (p.vMax * p.ta * u * u) / 2;
  }
  if (t < p.w + p.ta + p.tc) {
    return p.base + p.accelDist + p.vMax * (t - p.w - p.ta);
  }
  if (t < p.w + p.ta + p.tc + p.td) {
    const u = (t - p.w - p.ta - p.tc) / p.td;
    return p.base + p.accelDist + p.cruiseDist + (p.vMax * p.td * (1 - Math.pow(1 - u, 3))) / 3;
  }
  const u = Math.min(1, (t - p.w - p.ta - p.tc - p.td) / Math.max(0.001, p.ts));
  return p.endP + 0.35 * Math.sin(Math.PI * u) * (1 - u);
}

function velocityIn(p: Phases, t: number): number {
  if (t < p.w) return (-0.3 * 6 * (t / p.w) * (1 - t / p.w)) / p.w;
  if (t < p.w + p.ta) return p.vMax * ((t - p.w) / p.ta);
  if (t < p.w + p.ta + p.tc) return p.vMax;
  if (t < p.w + p.ta + p.tc + p.td) {
    const u = (t - p.w - p.ta - p.tc) / p.td;
    return p.vMax * (1 - u) * (1 - u);
  }
  return 0;
}

export function planSpin(o: SpinOptions): SpinProfile {
  const p = solvePhases(o);
  const durationMs = (p.w + p.ta + p.tc + p.td + p.ts) * 1000;
  return {
    durationMs,
    endP: p.endP,
    cruiseMs: p.tc * 1000,
    positionAt(ms) {
      if (ms <= 0) return o.startP;
      if (ms >= durationMs) return p.endP;
      return positionIn(p, ms / 1000);
    },
    velocityAt(ms) {
      if (ms <= 0 || ms >= durationMs) return 0;
      return velocityIn(p, ms / 1000);
    },
  };
}