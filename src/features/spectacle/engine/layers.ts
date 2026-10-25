import type { LayerId, QualitySettings } from '../model/types';

export interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface LayerRegistry {
  ensure(id: LayerId): Layer;
  /** Returns a layer ready for this frame's draws (cleared or afterimage-faded). */
  prepare(id: LayerId): Layer;
  get(id: LayerId): Layer | undefined;
  /** Clears every canvas and schedules their removal once the stage stays idle. */
  clearAll(): void;
  cancelIdleDispose(): void;
  dispose(): void;
}

const LAYER_STYLE: Record<LayerId, { z: string; blend: string }> = {
  'light-backdrop': { z: '1', blend: 'screen' },
  'light-overlay': { z: '40', blend: 'screen' },
  'solid-overlay': { z: '41', blend: 'normal' },
};

const IDLE_DISPOSE_MS = 10000;

interface HostView {
  host: HTMLElement;
  settings: QualitySettings;
}

function devicePixelRatioFor(settings: QualitySettings): number {
  return Math.min(settings.dprCap, window.devicePixelRatio || 1);
}

function sizeLayer(layer: Layer, view: HostView): void {
  const dpr = devicePixelRatioFor(view.settings);
  layer.canvas.width = Math.max(1, Math.round(view.host.clientWidth * dpr));
  layer.canvas.height = Math.max(1, Math.round(view.host.clientHeight * dpr));
  layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createLayer(id: LayerId, view: HostView): Layer {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;` +
    `z-index:${LAYER_STYLE[id].z};mix-blend-mode:${LAYER_STYLE[id].blend};`;
  view.host.appendChild(canvas);
  const layer = { canvas, ctx: canvas.getContext('2d')! };
  sizeLayer(layer, view);
  return layer;
}

function beginFrame(id: LayerId, layer: Layer, view: HostView): void {
  const { ctx } = layer;
  const { clientWidth: w, clientHeight: h } = view.host;
  ctx.globalAlpha = 1;
  if (id === 'solid-overlay') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    return;
  }
  // Afterimage persistence: fade the previous light frame, then add light.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = `rgba(0,0,0,${1 - view.settings.persistence})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
}

function clearLayer(layer: Layer, host: HTMLElement): void {
  layer.ctx.globalCompositeOperation = 'source-over';
  layer.ctx.clearRect(0, 0, host.clientWidth, host.clientHeight);
}

/**
 * Lazily created canvases stacked on the host. Light layers use CSS screen
 * blending; the solid overlay uses normal blending so it can truly hide.
 */
export function createLayerRegistry(host: HTMLElement, settings: QualitySettings): LayerRegistry {
  const view: HostView = { host, settings };
  const layers = new Map<LayerId, Layer>();
  let idleTimer = 0;

  const ensure = (id: LayerId): Layer => {
    const layer = layers.get(id) ?? createLayer(id, view);
    layers.set(id, layer);
    return layer;
  };
  const removeAll = () => {
    for (const layer of layers.values()) layer.canvas.remove();
    layers.clear();
  };
  const observer = new ResizeObserver(() => layers.forEach((layer) => sizeLayer(layer, view)));
  observer.observe(host);

  return {
    ensure,
    prepare(id) {
      const layer = ensure(id);
      beginFrame(id, layer, view);
      return layer;
    },
    get: (id) => layers.get(id),
    clearAll() {
      for (const layer of layers.values()) clearLayer(layer, host);
      idleTimer = window.setTimeout(removeAll, IDLE_DISPOSE_MS);
    },
    cancelIdleDispose: () => window.clearTimeout(idleTimer),
    dispose() {
      window.clearTimeout(idleTimer);
      observer.disconnect();
      removeAll();
    },
  };
}
