import { vi } from 'vitest';
import { BACKDROP_PRESETS } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';
import { DEFAULT_TUNING } from '@/features/background-removal';
import type { RgbaImage } from '@/shared/lib/raster';
import type { AvatarLook } from '../hooks/useAvatarLook';
import type { AvatarStudioState } from '../hooks/useAvatarStudio';

/** Shared studio fixtures so DOM tests in this feature describe behaviour, not setup. */

function image(fill = 120, size = 4): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4).fill(fill);
  return { width: size, height: size, data };
}

export function makeLook(overrides: Partial<AvatarLook> = {}): AvatarLook {
  return {
    backdrop: BACKDROP_PRESETS[0].spec,
    tuning: DEFAULT_TUNING,
    finish: 'natural',
    frame: 'medallion',
    gilding: GILDING_PRESETS[0].params,
    gildingPresetId: GILDING_PRESETS[0].id,
    isShimmering: true,
    isFineTuning: false,
    applyBackdropPreset: vi.fn(),
    choosePattern: vi.fn(),
    setPatternKnob: vi.fn(),
    setSpecKnob: vi.fn(),
    choosePalette: vi.fn(),
    setColour: vi.fn(),
    setInlay: vi.fn(),
    setTuningKnob: vi.fn(),
    setBackgroundRemoved: vi.fn(),
    resetTuning: vi.fn(),
    setFinish: vi.fn(),
    applyGildingPreset: vi.fn(),
    setGildingRamp: vi.fn(),
    setGildingTone: vi.fn(),
    setFrame: vi.fn(),
    toggleShimmer: vi.fn(),
    toggleFineTuning: vi.fn(),
    applySampleDefaults: vi.fn(),
    ...overrides,
  };
}

export function makeStudio(overrides: Partial<AvatarStudioState> = {}): AvatarStudioState {
  return {
    session: {
      photo: null,
      photoName: '',
      crop: null,
      foundCrop: null,
      matte: null,
      isLocating: false,
      isSegmenting: false,
      error: null,
      stage: 'idle',
      hint: 'Choose a portrait, or try Wei_Ling.',
      isCropping: false,
      cropperStart: null,
      cutOut: 'available',
      loadFile: vi.fn(async () => {}),
      loadSample: vi.fn(async () => {}),
      confirmCrop: vi.fn(),
      startAdjusting: vi.fn(),
      cancelCrop: vi.fn(),
      cancel: vi.fn(),
    },
    look: makeLook(),
    avatar: { image: image(), metal: { width: 4, height: 4, data: new Uint8ClampedArray(16) } },
    previewFrames: [image()],
    canDownload: false,
    isExporting: false,
    exportError: null,
    downloadPng: vi.fn(async () => {}),
    showWeiLing: vi.fn(),
    ...overrides,
  };
}
