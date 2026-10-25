/** Blackbody cooling ramp: white-hot → champagne → gold → amber → ember. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const STOPS: readonly { t: number; c: Rgb }[] = [
  { t: 0, c: { r: 1, g: 1, b: 0.97 } },
  { t: 0.18, c: { r: 1, g: 0.93, b: 0.72 } },
  { t: 0.42, c: { r: 1, g: 0.78, b: 0.36 } },
  { t: 0.68, c: { r: 1, g: 0.55, b: 0.16 } },
  { t: 1, c: { r: 0.74, g: 0.18, b: 0.05 } },
] as const;

export const GREEN_LIGHT: Rgb = { r: 0.35, g: 1, b: 0.55 };

export function blackbodyColor(t: number): Rgb {
  const x = Math.min(1, Math.max(0, t));
  // The ramp is clamped to [0, 1] and its last stop sits at 1, so a segment is
  // always found: there is no "past the end" colour to fall back to.
  const upper = STOPS.findIndex((stop, index) => index > 0 && x <= stop.t);
  const a = STOPS[upper - 1];
  const b = STOPS[upper];
  const u = (x - a.t) / (b.t - a.t);
  return {
    r: a.c.r + (b.c.r - a.c.r) * u,
    g: a.c.g + (b.c.g - a.c.g) * u,
    b: a.c.b + (b.c.b - a.c.b) * u,
  };
}

export function rgbCss(c: Rgb, alpha: number): string {
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}