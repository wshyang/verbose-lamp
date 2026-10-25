import type { FrameInfo } from '../../engine/types';
import { flashIntensityAt } from '../../model/motionPolicy';
import type { OrbPlan } from '../orbs/orbPlan';

const MIN_LEVEL = 0.005;
const SHOCKWAVE_MS = 650;

/** The white-out the transition hides its scene swap behind: wash, glow, and an anamorphic streak. */
export function drawTransitionFlash(plan: OrbPlan, tMs: number, frame: FrameInfo): void {
  const level = flashIntensityAt(plan.flash, tMs) * frame.fade;
  if (level < MIN_LEVEL) return;
  const { ctx, w, h } = frame;
  const cx = plan.origin.x * w;
  const cy = plan.origin.y * h;
  ctx.fillStyle = `rgba(255,246,220,${level * 0.9})`;
  ctx.fillRect(0, 0, w, h);
  const radius = Math.max(w, h) * (0.3 + level);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  glow.addColorStop(0, `rgba(255,255,250,${level})`);
  glow.addColorStop(0.5, `rgba(255,220,140,${level * 0.6})`);
  glow.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // Anamorphic horizontal streak: the premiere lens-flare look.
  const streak = ctx.createLinearGradient(0, cy, w, cy);
  streak.addColorStop(0, 'rgba(255,235,180,0)');
  streak.addColorStop(0.5, `rgba(255,245,215,${level * 0.8})`);
  streak.addColorStop(1, 'rgba(255,235,180,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, cy - h * 0.035 * level, w, h * 0.07 * level);
}

/** The ring that leaves the origin when inward sparklers meet. Outward flights never collide. */
export function drawShockwave(plan: OrbPlan, tMs: number, frame: FrameInfo): void {
  if (plan.collisionMs === null || tMs < plan.collisionMs) return;
  const u = (tMs - plan.collisionMs) / SHOCKWAVE_MS;
  if (u > 1) return;
  const { ctx, w, h, fade } = frame;
  ctx.globalAlpha = (1 - u) * fade;
  ctx.strokeStyle = 'rgba(255,220,140,0.9)';
  ctx.lineWidth = 10 * (1 - u) + 2;
  ctx.beginPath();
  ctx.arc(plan.origin.x * w, plan.origin.y * h, u * Math.min(w, h) * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
