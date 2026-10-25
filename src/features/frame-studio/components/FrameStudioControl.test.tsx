// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FRAME_SOURCES, INTRICACY_PRESETS, SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { FrameStudioControl } from './FrameStudioControl';


const baseProps = {
  isOpen: true,
  surface: 'title-cards' as const,
  patterns: FRAME_SOURCES,
  baseSource: 'authored' as const,
  layers: [
    { source: 'lattice' as const, label: 'Deco Lattice', blurb: 'Bundles', enabled: false, level: 3 },
  ],
  designGallery: [{ index: 0, label: 'Signature', kind: 'signature' }],
  activeDesignIndex: 0,
  designLabel: 'Signature',
  level: 2,
  detailPercent: 50,
  detailPresets: INTRICACY_PRESETS,
  activePreset: INTRICACY_PRESETS[2],
  isDesignPattern: true,
  proportionsOpen: false,
  genome: SIGNATURE_GENOME,
  borderEnabled: false,
  borderPattern: 'poster' as const,
  borderWeight: 50,
  onSurfaceChange: vi.fn(),
  onPatternChange: vi.fn(),
  onRerollPattern: vi.fn(),
  onLayerToggle: vi.fn(),
  onLayerLevelChange: vi.fn(),
  onDesignChange: vi.fn(),
  onLevelChange: vi.fn(),
  onDetailChange: vi.fn(),
  onProportionsToggle: vi.fn(),
  onGeneChange: vi.fn(),
  onBorderEnabledChange: vi.fn(),
  onBorderPatternChange: vi.fn(),
  onRerollBorder: vi.fn(),
  onBorderWeightChange: vi.fn(),
  onReset: vi.fn(),
  onDismiss: vi.fn(),
};

const renderStudio = (overrides: Partial<ComponentProps<typeof FrameStudioControl>> = {}) =>
  render(<FrameStudioControl {...baseProps} {...overrides} />);

describe('FrameStudioControl', () => {
  it('renders nothing when closed', () => {
    renderStudio({ isOpen: false });
    expect(screen.queryByTestId('frame-studio__panel')).toBeNull();
  });

  it('swaps the title-card and screen-border panels', async () => {
    const onSurfaceChange = vi.fn();
    const { rerender } = renderStudio({ onSurfaceChange });
    expect(screen.getByTestId('frame-studio__surface-sequence').getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByTestId('frame-studio__surface-border'));
    expect(onSurfaceChange).toHaveBeenCalledWith('screen-border');
    rerender(<FrameStudioControl {...baseProps} surface="screen-border" />);
    expect(screen.getByTestId('frame-studio__surface-border').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the border controls only on the screen-border surface', () => {
    const { rerender } = renderStudio();
    expect(screen.queryByTestId('frame-studio__border-enable')).toBeNull();
    rerender(<FrameStudioControl {...baseProps} surface="screen-border" />);
    expect(screen.getByTestId('frame-studio__border-enable')).toBeTruthy();
    expect(screen.getByTestId('frame-studio__border-blurb')).toBeTruthy();
  });

  it('selects a foundation pattern', async () => {
    const onPatternChange = vi.fn();
    renderStudio({ onPatternChange });
    await userEvent.click(screen.getAllByTestId('frame-studio__pattern')[4]);
    expect(onPatternChange).toHaveBeenCalledWith('lattice');
  });

  it('shows the reroll button only for the seeded lattice source', () => {
    const { rerender } = renderStudio();
    expect(screen.queryByTestId('frame-studio__reroll')).toBeNull();
    rerender(<FrameStudioControl {...baseProps} baseSource="lattice" isDesignPattern={false} />);
    expect(screen.getByTestId('frame-studio__reroll')).toBeTruthy();
  });

  it('also offers the reroll when the lattice is an enabled composed layer', () => {
    const layer = (enabled: boolean) => [
      { source: 'lattice' as const, label: 'Deco Lattice', blurb: 'Bundles', enabled, level: 3 },
    ];
    const { rerender } = renderStudio({ layers: layer(false) });
    expect(screen.queryByTestId('frame-studio__reroll')).toBeNull();

    rerender(<FrameStudioControl {...baseProps} layers={layer(true)} />);
    expect(screen.getByTestId('frame-studio__reroll')).toBeTruthy();
  });

  it('rerolls the lattice pattern', async () => {
    const onRerollPattern = vi.fn();
    renderStudio({ baseSource: 'lattice', isDesignPattern: false, onRerollPattern });
    await userEvent.click(screen.getByTestId('frame-studio__reroll'));
    expect(onRerollPattern).toHaveBeenCalledTimes(1);
  });

  it('selects a gallery design', async () => {
    const onDesignChange = vi.fn();
    renderStudio({ onDesignChange });
    await userEvent.click(screen.getByTestId('frame-studio__design'));
    expect(onDesignChange).toHaveBeenCalledWith(0);
  });

  it('toggles a composable layer and its level', async () => {
    const onLayerToggle = vi.fn();
    const onLayerLevelChange = vi.fn();
    const { rerender } = renderStudio({ onLayerToggle });
    await userEvent.click(screen.getByTestId('frame-studio__layer-toggle'));
    expect(onLayerToggle).toHaveBeenCalledWith('lattice', true);

    rerender(
      <FrameStudioControl
        {...baseProps}
        layers={[{ source: 'lattice', label: 'Deco Lattice', blurb: 'Bundles', enabled: true, level: 3 }]}
        onLayerLevelChange={onLayerLevelChange}
      />
    );
    fireEvent.change(screen.getByTestId('frame-studio__layer-level'), { target: { value: '4' } });
    expect(onLayerLevelChange).toHaveBeenCalledWith('lattice', 4);
  });

  it('changes the base level and the ornament detail', () => {
    const onLevelChange = vi.fn();
    const onDetailChange = vi.fn();
    renderStudio({ isDesignPattern: false, onLevelChange, onDetailChange });
    fireEvent.change(screen.getByTestId('frame-studio__level'), { target: { value: '3' } });
    expect(onLevelChange).toHaveBeenCalledWith(3);
    fireEvent.change(screen.getByTestId('frame-studio__detail'), { target: { value: '75' } });
    expect(onDetailChange).toHaveBeenCalledWith(75);
    expect(screen.getByTestId('frame-studio__level-readout').textContent).toBe('2');
  });

  it('applies an intricacy preset', async () => {
    const onDetailChange = vi.fn();
    renderStudio({ onDetailChange });
    await userEvent.click(screen.getAllByTestId('frame-studio__detail-preset')[0]);
    expect(onDetailChange).toHaveBeenCalledWith(0);
  });

  it('reads the preset name unless it is the baseline', () => {
    renderStudio();
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe('Balanced');
  });

  it('opens the proportion genes', async () => {
    const onProportionsToggle = vi.fn();
    renderStudio({ onProportionsToggle });
    await userEvent.click(screen.getByTestId('frame-studio__proportions-toggle'));
    expect(onProportionsToggle).toHaveBeenCalledWith(true);
  });

  it('switches the screen border between poster and lattice', async () => {
    const onBorderPatternChange = vi.fn();
    const { rerender } = renderStudio({ surface: 'screen-border', onBorderPatternChange });

    const chips = screen.getAllByTestId('frame-studio__border-pattern');
    expect(chips).toHaveLength(2);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('frame-studio__border-reroll')).toBeNull();

    await userEvent.click(chips[1]);
    expect(onBorderPatternChange).toHaveBeenCalledWith('lattice');

    rerender(<FrameStudioControl {...baseProps} surface="screen-border" borderPattern="lattice" />);
    expect(screen.getAllByTestId('frame-studio__border-pattern')[1].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('frame-studio__border-reroll')).toBeTruthy();
  });

  it('rerolls the proscenium seed', async () => {
    const onRerollBorder = vi.fn();
    renderStudio({ surface: 'screen-border', borderPattern: 'lattice', onRerollBorder });
    await userEvent.click(screen.getByTestId('frame-studio__border-reroll'));
    expect(onRerollBorder).toHaveBeenCalledTimes(1);
  });

  it('toggles and weights the screen border', async () => {
    const onBorderEnabledChange = vi.fn();
    const onBorderWeightChange = vi.fn();
    renderStudio({
      surface: 'screen-border',
      borderEnabled: true,
      onBorderEnabledChange,
      onBorderWeightChange,
    });
    await userEvent.click(screen.getByTestId('frame-studio__border-enable'));
    expect(onBorderEnabledChange).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByTestId('frame-studio__border-weight'), { target: { value: '80' } });
    expect(onBorderWeightChange).toHaveBeenCalledWith(80);
  });

  it('resets and dismisses from the header', async () => {
    const onReset = vi.fn();
    const onDismiss = vi.fn();
    renderStudio({ onReset, onDismiss });
    await userEvent.click(screen.getByTestId('frame-studio__reset'));
    await userEvent.click(screen.getByTestId('frame-studio__dismiss'));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
