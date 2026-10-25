import { detectQualityEnv, qualitySettings, resolveQuality } from '../model/quality';
import type {
  EffectHandle, EffectId, EffectParamsMap, LayerId, QualityPreference, SpectacleStage,
} from '../model/types';
import { effectRegistry } from './effectRegistry';
import type { EffectDefinition, EffectInstance } from './types';

export interface StageOptions {
  host: HTMLElement;
  quality?: QualityPreference;
  reducedMotion?: boolean;
  onAnnounce?: (text: string) => void;
}

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface ActiveEffect {
  layer: LayerId;
  instance: EffectInstance;
  startMs: number;
  stopMs: number | null;
  resolve: () => void;
}

const LAYER_STYLE: Record<LayerId, { z: string; blend: string }> = {
  'light-backdrop': { z: '1', blend: 'screen' },
  'light-overlay': { z: '40', blend: 'screen' },
  'solid-overlay': { z: '41', blend: 'normal' },
};

const IDLE_DISPOSE_MS = 10000;
const STOP_FADE_MS = 300;

export function createSpectacleStage(opts: StageOptions): SpectacleStage {
  const settings = qualitySettings(resolveQuality(opts.quality ?? 'auto', detectQualityEnv()));
  const layers = new Map<LayerId, Layer>();
  const active: ActiveEffect[] = [];
  let reducedMotion = opts.reducedMotion ?? false;
  let raf = 0;
  let idleTimer = 0;
  let disposed = false;

  const dpr = () => Math.min(settings.dprCap, window.devicePixelRatio || 1);

  function sizeLayer(layer: Layer): void {
    const { clientWidth: w, clientHeight: h } = opts.host;
    layer.canvas.width = Math.max(1, Math.round(w * dpr()));
    layer.canvas.height = Math.max(1, Math.round(h * dpr()));
    layer.ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  }

  function ensureLayer(id: LayerId): Layer {
    const existing = layers.get(id);
    if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;` +
      `z-index:${LAYER_STYLE[id].z};mix-blend-mode:${LAYER_STYLE[id].blend};`;
    opts.host.appendChild(canvas);
    const layer = { canvas, ctx: canvas.getContext('2d')! };
    sizeLayer(layer);
    layers.set(id, layer);
    return layer;
  }

  function prepareLayer(id: LayerId): Layer {
    const layer = ensureLayer(id);
    const { ctx } = layer;
    const w = opts.host.clientWidth;
    const h = opts.host.clientHeight;
    ctx.globalAlpha = 1;
    if (id === 'solid-overlay') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
    } else {
      // Afterimage persistence: fade the previous light frame, then add light.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1 - settings.persistence})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
    }
    return layer;
  }

  function frame(now: number): void {
    const touched = new Set<LayerId>();
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const e = active[i];
      const fade = e.stopMs === null ? 1 : Math.max(0, 1 - (now - e.stopMs) / STOP_FADE_MS);
      const layer = touched.has(e.layer) ? layers.get(e.layer)! : prepareLayer(e.layer);
      touched.add(e.layer);
      const w = opts.host.clientWidth;
      const h = opts.host.clientHeight;
      const status = e.instance.update(now - e.startMs, { ctx: layer.ctx, w, h, fade });
      layer.ctx.globalAlpha = 1;
      if (status === 'done' || fade <= 0) {
        active.splice(i, 1);
        e.resolve();
      }
    }
    if (active.length > 0) raf = requestAnimationFrame(frame);
    else goIdle();
  }

  function goIdle(): void {
    raf = 0;
    for (const [id, layer] of layers) {
      layer.ctx.globalCompositeOperation = 'source-over';
      layer.ctx.clearRect(0, 0, opts.host.clientWidth, opts.host.clientHeight);
      void id;
    }
    idleTimer = window.setTimeout(() => {
      for (const [, layer] of layers) layer.canvas.remove();
      layers.clear();
    }, IDLE_DISPOSE_MS);
  }

  const observer = new ResizeObserver(() => layers.forEach(sizeLayer));
  observer.observe(opts.host);

  function play<K extends EffectId>(id: K, params: EffectParamsMap[K]): EffectHandle {
    const def = effectRegistry[id] as EffectDefinition<EffectParamsMap[K]>;
    window.clearTimeout(idleTimer);
    ensureLayer(def.layer);
    const ctx = {
      quality: settings,
      reducedMotion,
      announce: (text: string) => opts.onAnnounce?.(text),
    };
    const instance = def.create(ctx, params);
    let resolve = () => {};
    const finished = new Promise<void>((r) => {
      resolve = r;
    });
    const entry: ActiveEffect = {
      layer: def.layer, instance, startMs: performance.now(), stopMs: null, resolve,
    };
    active.push(entry);
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
    return {
      finished,
      stop() {
        if (entry.stopMs === null) entry.stopMs = performance.now();
      },
    };
  }

  return {
    play,
    qualityTier: settings.tier,
    stopAll() {
      const now = performance.now();
      for (const e of active) if (e.stopMs === null) e.stopMs = now;
    },
    setReducedMotion(value) {
      reducedMotion = value;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      observer.disconnect();
      for (const e of active.splice(0)) e.resolve();
      for (const [, layer] of layers) layer.canvas.remove();
      layers.clear();
    },
  };
}