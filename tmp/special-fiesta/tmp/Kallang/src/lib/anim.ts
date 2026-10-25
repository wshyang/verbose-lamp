/** Named animation-loop math: pure functions of time (CLAUDE §12.4). */
import type { StrokeKeyframe } from "./types";

export const TAU = Math.PI * 2;

export function cyclePhase(timeSec: number, periodSec: number, offset = 0): number {
  const raw = timeSec / periodSec + offset;
  return raw - Math.floor(raw);
}

export function wrap(x: number, min: number, max: number): number {
  const span = max - min;
  return min + (((x - min) % span) + span) % span;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export interface StrokePose {
  angleDeg: number;
  lift: number;
}

/** Interpolate stroke keyframes (phase is cyclic, eased per segment). */
export function strokePoseAt(keyframes: readonly StrokeKeyframe[], phase: number): StrokePose {
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (first === undefined || last === undefined) throw new Error("stroke needs keyframes");
  if (phase <= first.phase || phase >= last.phase) {
    const edge = phase <= first.phase ? first : last;
    return { angleDeg: edge.angleDeg, lift: edge.lift };
  }
  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const from = keyframes[i];
    const to = keyframes[i + 1];
    if (from === undefined || to === undefined) continue;
    if (phase >= from.phase && phase <= to.phase) {
      const t = smoothstep((phase - from.phase) / (to.phase - from.phase));
      return {
        angleDeg: from.angleDeg + (to.angleDeg - from.angleDeg) * t,
        lift: from.lift + (to.lift - from.lift) * t,
      };
    }
  }
  return { angleDeg: last.angleDeg, lift: last.lift };
}

/** Blade tip relative to a paddle pointing down from its pivot. */
export function bladeTip(angleDeg: number, length: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: -Math.sin(rad) * length, y: Math.cos(rad) * length };
}

export function bobAt(timeSec: number, periodSec: number, amplitude: number): number {
  return Math.sin(cyclePhase(timeSec, periodSec) * TAU) * amplitude;
}

/** Y at x along a polyline of [x, y] points (clamped at both ends). */
export function polylineYAt(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) throw new Error("polyline needs points");
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (from === undefined || to === undefined) continue;
    if (x >= from[0] && x <= to[0]) {
      return from[1] + ((to[1] - from[1]) * (x - from[0])) / (to[0] - from[0]);
    }
  }
  return last[1];
}
