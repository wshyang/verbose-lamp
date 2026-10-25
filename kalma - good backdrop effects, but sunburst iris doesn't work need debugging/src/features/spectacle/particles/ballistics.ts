/**
 * Closed-form motion with linear drag k and gravity g (ADDENDUM-020 §3.2):
 *   p(t) = p0 + (v0 − g/k)·(1 − e^(−kt))/k + (g/k)·t
 * The CPU evaluates this per spark; nothing is integrated per frame.
 */
export interface Motion1D {
  p0: number;
  v0: number;
  k: number;
  g: number;
}

export function positionAt(m: Motion1D, t: number): number {
  if (m.k < 1e-6) return m.p0 + m.v0 * t + 0.5 * m.g * t * t;
  const terminal = m.g / m.k;
  return m.p0 + ((m.v0 - terminal) * (1 - Math.exp(-m.k * t))) / m.k + terminal * t;
}

export function velocityAt(m: Motion1D, t: number): number {
  if (m.k < 1e-6) return m.v0 + m.g * t;
  const terminal = m.g / m.k;
  return (m.v0 - terminal) * Math.exp(-m.k * t) + terminal;
}

/**
 * Time at which vertical velocity crosses zero (launch apex). Screen y grows
 * downward, so an upward launch has v0 < 0 and g > 0.
 */
export function apexTime(v0: number, k: number, g: number): number {
  if (g <= 0 || v0 >= 0) return Infinity;
  if (k < 1e-6) return -v0 / g;
  return Math.log(1 - (k * v0) / g) / k;
}