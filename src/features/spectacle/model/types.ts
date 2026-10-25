/** Normalized viewport space: origin top-left, x/y in 0..1 (matches the DOM). */
export interface NormPoint {
  x: number;
  y: number;
}

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type QualityTier = 'high' | 'low';
export type QualityPreference = QualityTier | 'auto';

export interface QualitySettings {
  tier: QualityTier;
  sparkCap: number;
  trailSamples: number;
  /** Fraction of the previous light frame kept per frame (afterimage). */
  persistence: number;
  dprCap: number;
  shellScale: number;
}

export type FireworkShellType =
  | 'peony'
  | 'chrysanthemum'
  | 'willow'
  | 'kamuro'
  | 'palm'
  | 'ring'
  | 'crossette'
  | 'strobe'
  | 'double-break';

export interface FireworksParams {
  durationMs?: number;
  intensity?: number;
  seed?: number;
  finale?: boolean;
  continuous?: boolean;
  keepClear?: readonly NormRect[];
  /** Emerald pistil — the green light across the bay. */
  greenLight?: boolean;
  wind?: number;
}

export interface OrbTransitionParams {
  origin: NormPoint;
  pattern: 'sides' | 'corners' | readonly NormPoint[];
  direction: 'outward' | 'inward';
  durationMs?: number;
  onCovered?: () => void;
}

export interface SunburstWipeParams {
  origin: NormPoint;
  rays?: number;
  variant?: 'iris' | 'fan';
  durationMs?: number;
  onCovered?: () => void;
}

export interface ConfettiParams {
  mode: 'burst' | 'rain';
  origin?: NormPoint;
  count?: number;
  seed?: number;
  durationMs?: number;
}

export interface ChampagneParams {
  rate?: number;
  seed?: number;
}

export interface SearchlightParams {
  beams?: number;
  seed?: number;
  keepClear?: readonly NormRect[];
}

export interface CountdownParams {
  from?: number;
  beatMs?: number;
  onComplete?: () => void;
}

export interface NameRevealParams {
  name: string;
  subtitle?: string;
  durationMs?: number;
}

export interface SparklerParams {
  origin: NormPoint;
  /** 1 = one handheld sparkler, up to 5 for a fan. */
  count?: number;
  seed?: number;
  /** 0..1 — density, head size and smoke. */
  intensity?: number;
  durationMs?: number;
}

export interface FlashParams {
  origin?: NormPoint;
  durationMs?: number;
}

export interface EffectParamsMap {
  fireworks: FireworksParams;
  'orb-transition': OrbTransitionParams;
  'sunburst-wipe': SunburstWipeParams;
  confetti: ConfettiParams;
  champagne: ChampagneParams;
  searchlights: SearchlightParams;
  countdown: CountdownParams;
  'name-reveal': NameRevealParams;
  sparkler: SparklerParams;
  flash: FlashParams;
}

export type EffectId = keyof EffectParamsMap;

export type LayerId = 'light-backdrop' | 'light-overlay' | 'solid-overlay';

export interface EffectHandle {
  /** Resolves on natural end or after a graceful stop. */
  readonly finished: Promise<void>;
  stop(): void;
}

export interface SpectacleStage {
  play<K extends EffectId>(id: K, params: EffectParamsMap[K]): EffectHandle;
  stopAll(): void;
  setReducedMotion(value: boolean): void;
  readonly qualityTier: QualityTier;
  dispose(): void;
}