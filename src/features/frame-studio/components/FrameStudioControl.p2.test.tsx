// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  FRAME_SOURCES,
  INTRICACY_PRESETS,
  SIGNATURE_GENOME,
} from '@/features/art-deco-frame';
import { FrameStudioControl } from './FrameStudioControl';

function fixture() {
  const handlers = {
    onSurfaceChange: vi.fn(),
    onPatternChange: vi.fn(),
    onLayerToggle: vi.fn(),
    onLayerLevelChange: vi.fn(),
    onDesignChange: vi.fn(),
    onLevelChange: vi.fn(),
    onDetailChange: vi.fn(),
    onProportionsToggle: vi.fn(),
    onGeneChange: vi.fn(),
    onBorderEnabledChange: vi.fn(),
    onBorderWeightChange: vi.fn(),
    onBorderPatternChange: vi.fn(),
    onRerollSeed: vi.fn(),
    onReset: vi.fn(),
    onDismiss: vi.fn(),
  };
  const props = {
    isOpen: true,
    surface: 'title-cards' as const,
    patterns: FRAME_SOURCES,
    baseSource: 'lattice' as const,
    layers: [{ source: 'fractal' as const, label: 'Fractal', blurb: '', enabled: true, level: 2 }],
    designGallery: [{ index: 0, label: 'Signature', kind: 'authored' }],
    activeDesignIndex: null,
    designLabel: 'Signature',
    level: 2,
    detailPercent: 50,
    detailPresets: INTRICACY_PRESETS,
    activePreset: INTRICACY_PRESETS[2],
    isDesignPattern: true,
    isLatticePattern: true,
    latticeSeed: 1925,
    proportionsOpen: false,
    genome: { ...SIGNATURE_GENOME },
    borderEnabled: true,
    borderWeight: 50,
    borderPattern: 'poster' as const,
    onRerollBorder: vi.fn(),
    onRerollPattern: vi.fn(),
    ...handlers,
  };
  return { props, handlers };
}

describe('FrameStudioControl', () => {

  it('routes layer, level, detail, design, and proportion controls', async () => {
    const user = userEvent.setup();
    const { props, handlers } = fixture();
    render(<FrameStudioControl {...props} proportionsOpen />);
    await user.click(screen.getByTestId('frame-studio__layer-toggle'));
    fireEvent.change(screen.getByTestId('frame-studio__layer-level'), { target: { value: '4' } });
    fireEvent.change(screen.getByTestId('frame-studio__level'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('frame-studio__detail'), { target: { value: '80' } });
    await user.click(screen.getByTestId('frame-studio__design'));
    await user.click(screen.getByTestId('frame-studio__proportions-toggle'));
    fireEvent.change(screen.getByTestId('frame-studio__gene-slider-cornerScale'), { target: { value: '1.2' } });
    expect(handlers.onLayerToggle).toHaveBeenCalledWith('fractal', false);
    expect(handlers.onLayerLevelChange).toHaveBeenCalledWith('fractal', 4);
    expect(handlers.onLevelChange).toHaveBeenCalledWith(3);
    expect(handlers.onDetailChange).toHaveBeenCalledWith(80);
    expect(handlers.onDesignChange).toHaveBeenCalledWith(0);
    expect(handlers.onProportionsToggle).toHaveBeenCalledWith(false);
    expect(handlers.onGeneChange).toHaveBeenCalledWith('cornerScale', 1.2);
  });

  it('swaps to the border panel and routes pattern, enable, and weight', async () => {
    const user = userEvent.setup();
    const { props, handlers } = fixture();
    render(<FrameStudioControl {...props} surface="screen-border" />);
    expect(screen.getByTestId('frame-studio__border-blurb')).toBeTruthy();
    await user.click(screen.getAllByTestId('frame-studio__border-pattern')[1]);
    await user.click(screen.getByTestId('frame-studio__border-enable'));
    fireEvent.change(screen.getByTestId('frame-studio__border-weight'), { target: { value: '65' } });
    expect(handlers.onBorderPatternChange).toHaveBeenCalledWith('lattice');
    expect(handlers.onBorderEnabledChange).toHaveBeenCalledWith(false);
    expect(handlers.onBorderWeightChange).toHaveBeenCalledWith(65);
  });

  it('covers reverse surface/pattern choices and disabled border styling', async () => {
    const user = userEvent.setup();
    const { props, handlers } = fixture();
    render(
      <FrameStudioControl {...props} surface="screen-border" borderEnabled={false} borderPattern="lattice" />
    );
    await user.click(screen.getByTestId('frame-studio__surface-sequence'));
    await user.click(screen.getAllByTestId('frame-studio__border-pattern')[0]);
    expect(handlers.onSurfaceChange).toHaveBeenCalledWith('title-cards');
    expect(handlers.onBorderPatternChange).toHaveBeenCalledWith('poster');
    expect(screen.getByTestId('frame-studio__border-weight').parentElement?.className).toContain('opacity-40');
  });

  it('shows non-baseline and percentage detail readouts for a recursive non-design pattern', () => {
    const { props } = fixture();
    const { rerender } = render(
      <FrameStudioControl
        {...props} activePreset={INTRICACY_PRESETS[3]} isDesignPattern={false}
        genome={{ ...SIGNATURE_GENOME, fractalDepth: 2 }}
      />
    );
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe('Ornate');
    expect(screen.getByTestId('frame-studio__level').parentElement?.className).not.toContain('opacity-40');
    rerender(<FrameStudioControl {...props} activePreset={null} detailPercent={37} />);
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe('37%');
  });
});
