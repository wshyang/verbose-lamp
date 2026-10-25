import type { LayerId, QualitySettings } from '../model/types';

/** Per-frame draw surface, in CSS pixels (the ctx transform handles DPR). */
export interface FrameInfo {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** 1 while running; ramps to 0 over 300 ms after a graceful stop. */
  fade: number;
}

export interface EffectContext {
  quality: QualitySettings;
  reducedMotion: boolean;
  announce(text: string): void;
}

export interface EffectInstance {
  update(elapsedMs: number, frame: FrameInfo): 'running' | 'done';
}

export interface EffectDefinition<P> {
  id: string;
  layer: LayerId;
  create(ctx: EffectContext, params: P): EffectInstance;
}