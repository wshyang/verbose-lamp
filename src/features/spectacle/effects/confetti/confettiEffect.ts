import { mulberry32 } from '@/shared/lib/random';
import type { EffectDefinition, FrameInfo } from '../../engine/types';
import type { ConfettiParams } from '../../model/types';
import { flutterX, foilY, type Flutter, type FoilFall } from './confettiPhysics';
import { DEFAULT_SEED } from '@/shared/lib/random';

interface Piece {
  fall: FoilFall;
  flutter: Flutter;
  bornMs: number;
  rot0: number;
  tumbleSpeed: number;
  wobbleSpeed: number;
  size: number;
  variant: 0 | 1 | 2;
  tone: number;
}

const LIGHT_FACES = ['#f8dd8a', '#f2cd68', '#e7bb52'] as const;
const DARK_FACES = ['#9a7433', '#83622c', '#6e5223'] as const;

function makePieces(params: ConfettiParams, seed: number, scale: number): readonly Piece[] {
  const rng = mulberry32(seed);
  const count = Math.round((params.count ?? (params.mode === 'burst' ? 170 : 230)) * scale);
  const origin = params.origin ?? { x: 0.5, y: 0.42 };
  return Array.from({ length: count }, () => {
    const burst = params.mode === 'burst';
    const a = rng() * Math.PI * 2;
    const v = burst ? 0.25 + rng() * 0.55 : 0;
    return {
      fall: {
        y0: burst ? origin.y : -0.06 - rng() * 0.3,
        vy0: burst ? Math.sin(a) * v - 0.35 : 0.05,
        vt: 0.16 + rng() * 0.12,
        k: 2.2 + rng() * 1.4,
      },
      flutter: {
        x0: burst ? origin.x : rng(),
        vx0: burst ? Math.cos(a) * v : (rng() - 0.5) * 0.04,
        k: 1.6, amp: 0.008 + rng() * 0.02, freq: 3 + rng() * 5, phase: rng() * Math.PI * 2,
      },
      bornMs: burst ? rng() * 120 : rng() * 2600,
      rot0: rng() * Math.PI * 2,
      tumbleSpeed: 3 + rng() * 7,
      wobbleSpeed: 1 + rng() * 3,
      size: 5 + rng() * 7,
      variant: Math.floor(rng() * 3) as 0 | 1 | 2,
      tone: Math.floor(rng() * 3),
    };
  });
}

function drawPiece(p: Piece, tSec: number, frame: FrameInfo): void {
  const { ctx, w, h, fade } = frame;
  const x = flutterX(p.flutter, tSec) * w;
  const y = foilY(p.fall, tSec) * h;
  if (y > h + 30) return;
  const tumble = Math.cos(p.rot0 + p.tumbleSpeed * tSec);
  const face = tumble >= 0 ? LIGHT_FACES[p.tone] : DARK_FACES[p.tone];
  const s = p.size * (h / 800);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(p.rot0 + p.wobbleSpeed * tSec) * 0.7);
  ctx.scale(Math.max(0.08, Math.abs(tumble)), 1);
  ctx.globalAlpha = fade;
  ctx.fillStyle = face;
  if (p.variant === 0) ctx.fillRect(-s / 2, -s / 2, s, s);
  else if (p.variant === 1) ctx.fillRect(-s / 5, -s, s / 2.5, s * 2);
  else {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s / 2, -s / 2, s, s);
  }
  if (tumble > 0.86) {
    ctx.globalAlpha = fade * (tumble - 0.86) * 7;
    ctx.fillStyle = '#fff7dd';
    ctx.fillRect(-s / 2, -s / 2, s, s / 4);
  }
  ctx.restore();
}

/** Tumbling two-sided gold foil: it flashes as the lit face turns. */
export const confettiEffect: EffectDefinition<ConfettiParams> = {
  id: 'confetti',
  layer: 'solid-overlay',
  create(ctx, params) {
    const pieces = makePieces(params, params.seed ?? DEFAULT_SEED, Math.max(0.5, ctx.quality.shellScale));
    const duration = params.durationMs ?? 4600;
    return {
      update(t, frame) {
        const fade = frame.fade * Math.min(1, Math.max(0, (duration + 1400 - t) / 700));
        const faded: FrameInfo = { ...frame, fade };
        for (const p of pieces) {
          const local = t - p.bornMs;
          if (local < 0) continue;
          drawPiece(p, local / 1000, faded);
        }
        return t > duration + 1500 ? 'done' : 'running';
      },
    };
  },
};