import type { EffectHandle, LayerId } from '../model/types';
import type { LayerRegistry } from './layers';
import type { EffectInstance } from './types';

export interface EffectScheduler {
  add(layer: LayerId, instance: EffectInstance): EffectHandle;
  stopAll(): void;
  dispose(): void;
}

interface ActiveEffect {
  layer: LayerId;
  instance: EffectInstance;
  startMs: number;
  stopMs: number | null;
  resolve: () => void;
}

const STOP_FADE_MS = 300;

function fadeOf(effect: ActiveEffect, now: number): number {
  if (effect.stopMs === null) return 1;
  return Math.max(0, 1 - (now - effect.stopMs) / STOP_FADE_MS);
}

function createEntry(layer: LayerId, instance: EffectInstance): { entry: ActiveEffect; finished: Promise<void> } {
  let resolve!: () => void;
  const finished = new Promise<void>((r) => {
    resolve = r;
  });
  return { entry: { layer, instance, startMs: performance.now(), stopMs: null, resolve }, finished };
}

function handleFor(entry: ActiveEffect, finished: Promise<void>): EffectHandle {
  return {
    finished,
    stop() {
      if (entry.stopMs === null) entry.stopMs = performance.now();
    },
  };
}

/**
 * Owns the active effects and the requestAnimationFrame loop. The loop runs
 * only while something is live; when the last effect ends, canvases are
 * cleared and the registry schedules their disposal.
 */
export function createEffectScheduler(layers: LayerRegistry, host: HTMLElement): EffectScheduler {
  const active: ActiveEffect[] = [];
  let raf = 0;
  let isDisposed = false;

  function step(effect: ActiveEffect, now: number, touched: Set<LayerId>): boolean {
    const fade = fadeOf(effect, now);
    const layer = touched.has(effect.layer) ? layers.get(effect.layer)! : layers.prepare(effect.layer);
    touched.add(effect.layer);
    const info = { ctx: layer.ctx, w: host.clientWidth, h: host.clientHeight, fade };
    const status = effect.instance.update(now - effect.startMs, info);
    layer.ctx.globalAlpha = 1;
    return status === 'done' || fade <= 0;
  }

  function frame(now: number): void {
    const touched = new Set<LayerId>();
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (!step(active[i], now, touched)) continue;
      active.splice(i, 1)[0].resolve();
    }
    if (active.length > 0) {
      raf = requestAnimationFrame(frame);
      return;
    }
    raf = 0;
    layers.clearAll();
  }

  return {
    add(layer, instance) {
      layers.cancelIdleDispose();
      layers.ensure(layer);
      const { entry, finished } = createEntry(layer, instance);
      active.push(entry);
      if (!raf && !isDisposed) raf = requestAnimationFrame(frame);
      return handleFor(entry, finished);
    },
    stopAll() {
      const now = performance.now();
      for (const effect of active) if (effect.stopMs === null) effect.stopMs = now;
    },
    dispose() {
      isDisposed = true;
      cancelAnimationFrame(raf);
      for (const effect of active.splice(0)) effect.resolve();
    },
  };
}
