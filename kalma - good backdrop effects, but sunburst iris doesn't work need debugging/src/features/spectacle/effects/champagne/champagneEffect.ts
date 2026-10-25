import { mulberry32 } from '@/shared/lib/random';
import type { EffectDefinition } from '../../engine/types';
import type { ChampagneParams } from '../../model/types';

interface Bead {
  x: number;
  bornMs: number;
  rise: number;
  size: number;
  phase: number;
}

/** Ambient rising champagne beads on the backdrop light layer. Stops gracefully. */
export const champagneEffect: EffectDefinition<ChampagneParams> = {
  id: 'champagne',
  layer: 'light-backdrop',
  create(ctx, params) {
    const rng = mulberry32(params.seed ?? 1925);
    const rate = ctx.reducedMotion ? 1.5 : (params.rate ?? 7);
    const beads: Bead[] = [];
    let lastSpawn = 0;
    return {
      update(t, { ctx: c, w, h, fade }) {
        if (t - lastSpawn > 1000 / rate && beads.length < 90) {
          lastSpawn = t;
          beads.push({
            x: rng(), bornMs: t, rise: 0.05 + rng() * 0.06,
            size: 1.4 + rng() * 2.4, phase: rng() * Math.PI * 2,
          });
        }
        for (let i = beads.length - 1; i >= 0; i -= 1) {
          const b = beads[i];
          const age = (t - b.bornMs) / 1000;
          const y = 1.04 - b.rise * age;
          if (y < -0.04) {
            beads.splice(i, 1);
            continue;
          }
          const x = (b.x + Math.sin(age * 2.2 + b.phase) * 0.006) * w;
          const r = b.size * (1 + age * 0.06) * (h / 800);
          c.globalAlpha = 0.4 * fade;
          c.strokeStyle = 'rgba(255,226,160,0.8)';
          c.lineWidth = 1;
          c.beginPath();
          c.arc(x, y * h, r, 0, Math.PI * 2);
          c.stroke();
          c.globalAlpha = 0.7 * fade;
          c.fillStyle = 'rgba(255,248,225,0.9)';
          c.beginPath();
          c.arc(x - r * 0.35, y * h - r * 0.35, r * 0.25, 0, Math.PI * 2);
          c.fill();
        }
        return 'running';
      },
    };
  },
};