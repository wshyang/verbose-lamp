import { positionAt, velocityAt } from '../../particles/ballistics';

/**
 * Foil fall with terminal velocity vt: drag k chosen so g/k = vt, then the
 * shared closed form applies. Flutter is a sinusoid in x (ADDENDUM-020 §3.6).
 */
export interface FoilFall {
  y0: number;
  vy0: number;
  vt: number;
  k: number;
}

export function foilY(f: FoilFall, t: number): number {
  return positionAt({ p0: f.y0, v0: f.vy0, k: f.k, g: f.vt * f.k }, t);
}

export function foilVy(f: FoilFall, t: number): number {
  return velocityAt({ p0: f.y0, v0: f.vy0, k: f.k, g: f.vt * f.k }, t);
}

export interface Flutter {
  x0: number;
  vx0: number;
  k: number;
  amp: number;
  freq: number;
  phase: number;
}

export function flutterX(f: Flutter, t: number): number {
  const drift = (f.vx0 * (1 - Math.exp(-f.k * t))) / f.k;
  const ramp = Math.min(1, t * 1.5);
  return f.x0 + drift + f.amp * Math.sin(f.freq * t + f.phase) * ramp;
}