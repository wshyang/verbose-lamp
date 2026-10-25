import type { FireworkShellType } from '../../model/types';

/**
 * Real shell recipes (ADDENDUM-020 §3.3). Units are fractions of the smaller
 * viewport dimension; the runtime scales to pixels. Pure and seeded.
 */
export interface ShellRecipe {
  count: number;
  speed: number;
  lifeS: number;
  drag: number;
  gravity: number;
  glitterRate: number;
  trail: number;
  size: number;
}

export interface ShellSpark {
  dx: number;
  dy: number;
  speed: number;
  lifeS: number;
  size: number;
  band: number;
  glitterRate: number;
  /** Emerald pistil spark (the green light). */
  green?: boolean;
  /** Crossette star that splits mid-flight. */
  splits?: boolean;
}

const RECIPES: Record<FireworkShellType, ShellRecipe> = {
  peony: { count: 150, speed: 0.34, lifeS: 1.9, drag: 1.6, gravity: 0.16, glitterRate: 0, trail: 1, size: 2.4 },
  chrysanthemum: { count: 160, speed: 0.32, lifeS: 2.4, drag: 1.4, gravity: 0.17, glitterRate: 0, trail: 1.7, size: 2.2 },
  willow: { count: 110, speed: 0.24, lifeS: 3.8, drag: 0.7, gravity: 0.2, glitterRate: 0, trail: 2.1, size: 2.1 },
  kamuro: { count: 130, speed: 0.26, lifeS: 4.2, drag: 0.6, gravity: 0.19, glitterRate: 4, trail: 2.3, size: 2.2 },
  palm: { count: 12, speed: 0.36, lifeS: 2.2, drag: 1.1, gravity: 0.22, glitterRate: 0, trail: 2.4, size: 4.4 },
  ring: { count: 90, speed: 0.3, lifeS: 2, drag: 1.5, gravity: 0.15, glitterRate: 0, trail: 1, size: 2.3 },
  crossette: { count: 10, speed: 0.3, lifeS: 1.1, drag: 1.2, gravity: 0.14, glitterRate: 0, trail: 1.6, size: 3.4 },
  strobe: { count: 140, speed: 0.28, lifeS: 2.8, drag: 1.5, gravity: 0.13, glitterRate: 14, trail: 0.7, size: 2.2 },
  'double-break': { count: 120, speed: 0.34, lifeS: 2, drag: 1.6, gravity: 0.16, glitterRate: 0, trail: 1, size: 2.3 },
};

export function shellRecipe(type: FireworkShellType): ShellRecipe {
  return RECIPES[type];
}

/** Random point on a sphere, projected with mild perspective (3D read). */
function sphereDir(rng: () => number): { dx: number; dy: number; f: number } {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  const f = 1 / (1 + z * 0.35);
  return { dx: Math.cos(a) * r * f, dy: Math.sin(a) * r * f, f };
}

function baseSpark(r: ShellRecipe, rng: () => number, dx: number, dy: number, f: number): ShellSpark {
  return {
    dx, dy,
    speed: r.speed * f * (0.82 + rng() * 0.3),
    lifeS: r.lifeS * (0.85 + rng() * 0.3),
    size: r.size * f,
    band: rng() * 0.12,
    glitterRate: r.glitterRate,
  };
}

export function shellSparks(
  type: FireworkShellType,
  rng: () => number,
  scale: number,
  greenLight: boolean,
): readonly ShellSpark[] {
  const r = RECIPES[type];
  const n = Math.max(6, Math.round(r.count * scale));
  const out: ShellSpark[] = [];
  for (let i = 0; i < n; i += 1) {
    if (type === 'ring') {
      const a = (i / n) * Math.PI * 2;
      const tilt = 0.55 + rng() * 0.02;
      out.push(baseSpark(r, rng, Math.cos(a), Math.sin(a) * tilt, 1));
    } else {
      const d = sphereDir(rng);
      const s = baseSpark(r, rng, d.dx, d.dy, d.f);
      if (type === 'crossette') out.push({ ...s, splits: true });
      else out.push(s);
    }
  }
  if (type === 'double-break') addPistil(out, r, rng, n, greenLight);
  return out;
}

function addPistil(
  out: ShellSpark[],
  r: ShellRecipe,
  rng: () => number,
  n: number,
  greenLight: boolean,
): void {
  for (let i = 0; i < Math.round(n * 0.4); i += 1) {
    const d = sphereDir(rng);
    const s = baseSpark(r, rng, d.dx, d.dy, d.f);
    out.push({ ...s, speed: r.speed * 0.42, band: greenLight ? 2 : 0.02, green: greenLight });
  }
}