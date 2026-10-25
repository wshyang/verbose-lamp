import { vi } from 'vitest';
import { FRAME_SOURCES, INTRICACY_PRESETS, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { DESIGN_GALLERY } from '@/features/frame-studio/data/frameDesigns';
import type { FrameStudioController } from '@/features/frame-studio';

/**
 * A FrameStudioController with the real catalogue data and spy handlers, so
 * component tests render the true studio without a scene target.
 */
export function createFakeFrameStudio(
  overrides: Partial<FrameStudioController> = {},
): FrameStudioController {
  return {
    isOpen: true,
    isLatticeActive: false,
    rerollPattern: vi.fn(),
    selectPattern: vi.fn(),
    selectDesign: vi.fn(),
    setLevel: vi.fn(),
    setDetail: vi.fn(),
    dismiss: vi.fn(),
    reveal: vi.fn(),
    surface: 'title-cards',
    setSurface: vi.fn(),
    patterns: FRAME_SOURCES,
    baseSource: 'authored',
    layers: [
      { source: 'fractal', label: 'Fractal', blurb: '', enabled: false, level: 2 },
      { source: 'rosette', label: 'Rosette', blurb: '', enabled: false, level: 2 },
      { source: 'arcade', label: 'Arcade', blurb: '', enabled: false, level: 2 },
      { source: 'lattice', label: 'Deco Lattice', blurb: '', enabled: false, level: 2 },
    ],
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: 0,
    designLabel: DESIGN_GALLERY[0].label,
    level: 2,
    detailPercent: 50,
    detailPresets: INTRICACY_PRESETS,
    activePreset: INTRICACY_PRESETS.find((preset) => preset.id === 'baseline') ?? null,
    isDesignPattern: true,
    setLayerEnabled: vi.fn(),
    setLayerLevel: vi.fn(),
    proportionsOpen: false,
    setProportionsOpen: vi.fn(),
    genome: { ...SIGNATURE_GENOME },
    setGene: vi.fn(),
    borderEnabled: false,
    setBorderEnabled: vi.fn(),
    borderPattern: 'poster',
    setBorderPattern: vi.fn(),
    borderWeight: 50,
    setBorderWeight: vi.fn(),
    resetAll: vi.fn(),
    ...overrides,
  } as FrameStudioController;
}
