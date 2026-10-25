import { vi } from 'vitest';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';

/**
 * A typed stand-in for the console's state, so sections can be rendered without
 * a WebGL stage. Every callback is a spy, so a test can assert *what* a section
 * asks for without owning the effect engine.
 */
export function stubPreview(overrides: Partial<SpectaclePreview> = {}): SpectaclePreview {
  const base: SpectaclePreview = {
    open: true,
    setOpen: vi.fn(),
    marqueeOn: true,
    setMarqueeOn: vi.fn(),
    playing: new Set<string>(),
    stopAll: vi.fn(),
    qualityTier: 'high',
    simulatedReducedMotion: false,
    setSimulatedReducedMotion: vi.fn(),

    origin: { x: 0.5, y: 0.42 },
    picking: false,
    setPicking: vi.fn(),
    intensity: 0.6,
    setIntensity: vi.fn(),
    seed: 1925,
    setSeed: vi.fn(),
    rerollSeed: vi.fn(),
    keepClearOn: false,
    setKeepClearOn: vi.fn(),
    keepClear: [],
    speaker: { x: 0.42, y: 0.28, w: 0.16, h: 0.24 },
    moveSpeaker: vi.fn(),
    onStageClick: vi.fn(() => false),

    toggleFireworks: vi.fn(),
    playFinale: vi.fn(),
    toggleSearchlights: vi.fn(),
    toggleChampagne: vi.fn(),

    demoScreen: 'A',
    playOrb: vi.fn(),
    playSunburst: vi.fn(),

    playConfetti: vi.fn(),
    playCountdown: vi.fn(),
    playNameReveal: vi.fn(),
    playSparklers: vi.fn(),


  };
  return { ...base, ...overrides };
}
