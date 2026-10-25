export interface CountdownBeat {
  value: number;
  startMs: number;
  revealMs: number;
  exitMs: number;
}

export interface CountdownPlan {
  beats: readonly CountdownBeat[];
  beatMs: number;
  totalMs: number;
}

export function planCountdown(from: number, beatMs: number): CountdownPlan {
  const n = Math.max(1, Math.min(10, Math.round(from)));
  const beats = Array.from({ length: n + 1 }, (_, i) => ({
    value: n - i,
    startMs: i * beatMs,
    revealMs: Math.min(220, beatMs * 0.25),
    exitMs: Math.min(200, beatMs * 0.22),
  }));
  return { beats, beatMs, totalMs: (n + 1) * beatMs };
}

export function beatAt(plan: CountdownPlan, tMs: number): CountdownBeat | null {
  if (tMs < 0 || tMs >= plan.totalMs) return null;
  return plan.beats[Math.floor(tMs / plan.beatMs)];
}