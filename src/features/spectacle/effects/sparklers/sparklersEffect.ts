import type { EffectDefinition, FrameInfo } from '../../engine/types';
import type { SparklerParams } from '../../model/types';
import {
  isSparklerShowDone,
  planSparklerStill,
  planSparklers,
  sparkleField,
  sparklerIntensity,
  sparklerTip,
  type SparklerPlan,
  type SparklerStick,
} from './sparklerPlan';

function scaleOf(frame: FrameInfo): number {
  return Math.min(frame.w, frame.h) / 700;
}

/** The bare wire, so an unlit stick still reads as a sparkler waiting to be lit. */
function drawWire(stick: SparklerStick, tipX: number, tipY: number, frame: FrameInfo): void {
  const { ctx, h, fade } = frame;
  const scale = scaleOf(frame);
  ctx.strokeStyle = `rgba(186,148,88,${0.5 * fade})`;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(stick.anchor.x * frame.w, stick.anchor.y * h);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
}

/** Hot core plus the warm halo around it. */
function drawTipGlow(intensity: number, tipX: number, tipY: number, frame: FrameInfo): void {
  const { ctx, fade } = frame;
  const scale = scaleOf(frame);
  const radius = (22 + 26 * intensity) * scale;
  const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, radius);
  glow.addColorStop(0, `rgba(255,252,236,${0.95 * intensity * fade})`);
  glow.addColorStop(0.28, `rgba(255,224,148,${0.7 * intensity * fade})`);
  glow.addColorStop(0.62, `rgba(246,170,64,${0.28 * intensity * fade})`);
  glow.addColorStop(1, 'rgba(220,120,20,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(tipX, tipY, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Sparkles fly outward from the tip, each with a short bright streak behind it. */
function drawSparkles(plan: SparklerPlan, tMs: number, frame: FrameInfo): void {
  const { ctx, w, h, fade } = frame;
  const scale = scaleOf(frame);
  for (const sparkle of sparkleField(plan, tMs)) {
    const x = sparkle.x * w;
    const y = sparkle.y * h;
    const length = sparkle.trail * sparkle.size * 3 * scale;
    const warmth = sparkle.warmth;
    const red = Math.round(255);
    const green = Math.round(215 + 30 * warmth);
    const blue = Math.round(120 + 90 * warmth);
    ctx.strokeStyle = `rgba(${red},${green},${blue},${0.75 * sparkle.life * fade})`;
    ctx.lineWidth = Math.max(1, sparkle.size * scale * 0.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(sparkle.angle) * length, y - Math.sin(sparkle.angle) * length);
    ctx.stroke();
  }
}

function drawStick(stick: SparklerStick, tMs: number, frame: FrameInfo): void {
  const tip = sparklerTip(stick, tMs);
  const tipX = tip.x * frame.w;
  const tipY = tip.y * frame.h;
  drawWire(stick, tipX, tipY, frame);
  const intensity = sparklerIntensity(stick, tMs);
  if (intensity > 0) drawTipGlow(intensity, tipX, tipY, frame);
}

/**
 * Party sparklers (ADDENDUM-027). They are light, so they live on the additive
 * overlay layer and never paint over the HUD.
 */
export const sparklersEffect: EffectDefinition<SparklerParams> = {
  id: 'sparklers',
  layer: 'light-overlay',
  create(ctx, params) {
    const plan = ctx.reducedMotion ? planSparklerStill(params) : planSparklers(params);
    ctx.announce('Sparklers lit');
    return {
      update(t, frame) {
        for (const stick of plan.sticks) drawStick(stick, t, frame);
        drawSparkles(plan, t, frame);
        return isSparklerShowDone(plan, t) ? 'done' : 'running';
      },
    };
  },
};
