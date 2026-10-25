// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type FrameStudioController } from '@/features/frame-studio';
import { FrameStudioDock } from './FrameStudioDock';
import { DEFAULT_FRAME_LAYERS, DEFAULT_FRAME_STYLE, FRAME_SOURCES, INTRICACY_PRESETS, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { DESIGN_GALLERY, describeDesign } from '@/features/frame-studio/data/frameDesigns';

function createStudio(overrides: Partial<FrameStudioController> = {}): FrameStudioController {
  const handlers = {
    setSurface: vi.fn(),
    selectPattern: vi.fn(),
    setLayerEnabled: vi.fn(),
    setLayerLevel: vi.fn(),
    selectDesign: vi.fn(),
    setLevel: vi.fn(),
    setDetail: vi.fn(),
    setProportionsOpen: vi.fn(),
    setGene: vi.fn(),
    setBorderEnabled: vi.fn(),
    setBorderWeight: vi.fn(),
    resetAll: vi.fn(),
    dismiss: vi.fn(),
    reveal: vi.fn(),
  };
  const studio = {
    isOpen: false,
    surface: 'title-cards',
    patterns: FRAME_SOURCES,
    baseSource: DEFAULT_FRAME_STYLE.formula.source,
    layers: DEFAULT_FRAME_LAYERS.map((layer) => ({
      source: layer.source,
      label: layer.source,
      blurb: layer.source,
      enabled: layer.enabled,
      level: layer.level,
    })),
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: null,
    designLabel: describeDesign(undefined, SIGNATURE_GENOME),
    level: DEFAULT_FRAME_STYLE.formula.level,
    detailPercent: Math.round(DEFAULT_FRAME_STYLE.intricacy * 100),
    detailPresets: INTRICACY_PRESETS,
    activePreset: INTRICACY_PRESETS[0],
    isDesignPattern: false,
    proportionsOpen: false,
    genome: SIGNATURE_GENOME,
    borderEnabled: false,
    borderWeight: 62,
    ...handlers,
    ...overrides,
  };
  return studio as unknown as FrameStudioController;
}
describe('FrameStudioDock', () => {
  it('offers a reveal button while the studio is closed', async () => {
    const studio = createStudio();
    render(<FrameStudioDock studio={studio} hudHidden={false} />);
    await userEvent.click(screen.getByTestId('frame-studio__reveal'));
    expect(studio.reveal).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('frame-studio__panel')).toBeNull();
  });

  it('renders the studio panel when open and forwards dismiss', async () => {
    const studio = createStudio({ isOpen: true });
    render(<FrameStudioDock studio={studio} hudHidden={false} />);
    expect(screen.getByTestId('frame-studio__panel')).toBeDefined();
    const close = screen.getByTestId('frame-studio__dismiss');
    await userEvent.click(close);
    expect(studio.dismiss).toHaveBeenCalledTimes(1);
  });

  it('fades out with the HUD without unmounting', () => {
    const studio = createStudio({ isOpen: true });
    const { container } = render(<FrameStudioDock studio={studio} hudHidden />);
    const dock = container.firstElementChild;
    expect(dock?.className).toContain('pointer-events-none');
    expect(screen.getByTestId('frame-studio__panel')).toBeDefined();
  });
});
