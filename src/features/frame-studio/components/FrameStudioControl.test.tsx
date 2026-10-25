// @vitest-environment jsdom
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FRAME_SOURCES,
  type FrameLayerSource,
  INTRICACY_PRESETS,
  SIGNATURE_GENOME,
  type IntricacyPreset,
} from '@/features/art-deco-frame';
import { DESIGN_GALLERY } from '../data/frameDesigns';
import { FrameStudioControl } from './FrameStudioControl';
import { GeneSlider } from './GeneSlider';

type ControlProps = React.ComponentProps<typeof FrameStudioControl>;

function makeProps(overrides: Partial<ControlProps> = {}): ControlProps {
  return {
    isOpen: true,
    surface: 'title-cards' as const,
    patterns: FRAME_SOURCES,
    baseSource: 'authored' as const,
    layers: FRAME_SOURCES.filter((pattern) => pattern.id !== 'authored').map((pattern) => ({
      source: pattern.id as FrameLayerSource,
      label: pattern.label,
      blurb: pattern.blurb,
      enabled: pattern.id === FRAME_SOURCES.filter((entry) => entry.id !== 'authored')[0].id,
      level: 2,
    })),
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: 0,
    designLabel: 'Original',
    level: 2,
    detailPercent: 50,
    detailPresets: INTRICACY_PRESETS,
    activePreset: INTRICACY_PRESETS[0] as IntricacyPreset | null,
    isDesignPattern: true,
    proportionsOpen: false,
    genome: SIGNATURE_GENOME,
    borderEnabled: true,
    borderWeight: 50,
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
    onReset: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe('FrameStudioControl', () => {
  it('renders nothing while dismissed', () => {
    render(<FrameStudioControl {...makeProps({ isOpen: false })} />);
    expect(screen.queryByTestId('frame-studio__panel')).toBeNull();
  });

  it('offers the surfaces, patterns, designs and layers', async () => {
    const props = makeProps();
    render(<FrameStudioControl {...props} />);
    expect(screen.getByLabelText('Frame Studio')).toBeDefined();
    expect(screen.getByTestId('frame-studio__design-label').textContent).toBe('Original');

    await userEvent.click(screen.getByTestId('frame-studio__surface-border'));
    expect(props.onSurfaceChange).toHaveBeenCalledWith('screen-border');

    await userEvent.click(screen.getAllByTestId('frame-studio__pattern')[1]);
    expect(props.onPatternChange).toHaveBeenCalledWith(FRAME_SOURCES[1].id);

    await userEvent.click(screen.getAllByTestId('frame-studio__design')[2]);
    expect(props.onDesignChange).toHaveBeenCalledWith(2);

    const toggles = screen.getAllByTestId('frame-studio__layer-toggle');
    await userEvent.click(toggles[0]);
    expect(props.onLayerToggle).toHaveBeenCalled();

    const levelSlider = screen.getAllByTestId('frame-studio__layer-level')[0] as HTMLInputElement;
    fireEvent.change(levelSlider, { target: { value: '3' } });
    expect(props.onLayerLevelChange).toHaveBeenCalled();
  });

  it('drives the base level, detail slider and presets', () => {
    const props = makeProps();
    render(<FrameStudioControl {...props} />);
    expect(screen.getByTestId('frame-studio__level-readout').textContent).toBe('2');

    fireEvent.change(screen.getByTestId('frame-studio__level'), { target: { value: '4' } });
    expect(props.onLevelChange).toHaveBeenCalledWith(4);

    fireEvent.change(screen.getByTestId('frame-studio__detail'), { target: { value: '65' } });
    expect(props.onDetailChange).toHaveBeenCalledWith(65);

    const presets = screen.getAllByTestId('frame-studio__detail-preset');
    fireEvent.click(presets.at(-1)!);
    expect(props.onDetailChange).toHaveBeenCalledWith(Math.round(INTRICACY_PRESETS.at(-1)!.value * 100));
    expect(screen.getByTestId('frame-studio__detail-readout').textContent.length).toBeGreaterThan(0);
  });

  it('shows the balanced label and the raw percentage without a preset', () => {
    const baseline = render(
      <FrameStudioControl
        {...makeProps({ activePreset: { ...INTRICACY_PRESETS[0], id: 'baseline' } })}
      />,
    );
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe('Balanced');
    baseline.unmount();

    render(<FrameStudioControl {...makeProps({ activePreset: null, detailPercent: 37 })} />);
    expect(screen.getByTestId('frame-studio__detail-readout').textContent).toBe('37%');
  });

  it('opens the proportions drawer with every gene group', async () => {
    const props = makeProps();
    const { rerender } = render(<FrameStudioControl {...props} />);
    expect(screen.queryByTestId('frame-studio__proportions')).toBeNull();

    await userEvent.click(screen.getByTestId('frame-studio__proportions-toggle'));
    expect(props.onProportionsToggle).toHaveBeenCalledWith(true);

    rerender(<FrameStudioControl {...props} proportionsOpen />);
    expect(screen.getByTestId('frame-studio__proportions')).toBeDefined();
    expect(screen.getByTestId('frame-studio__gene-slider-rayDensity')).toBeDefined();
    expect(screen.getByTestId('frame-studio__proportions-toggle').textContent).toContain('Hide proportions');
  });

  it('shows the screen-border controls when that surface is chosen', () => {
    const props = makeProps({ surface: 'screen-border' as const });
    render(<FrameStudioControl {...props} />);
    expect(screen.getByTestId('frame-studio__border-blurb')).toBeDefined();
    expect(screen.getByTestId('frame-studio__border-weight-readout').textContent).toBe('50%');

    fireEvent.click(screen.getByTestId('frame-studio__border-enable'));
    expect(props.onBorderEnabledChange).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByTestId('frame-studio__border-weight'), { target: { value: '70' } });
    expect(props.onBorderWeightChange).toHaveBeenCalledWith(70);
  });

  it('switches back to the title cards from the border surface', async () => {
    const props = makeProps({ surface: 'screen-border' as const });
    render(<FrameStudioControl {...props} />);
    await userEvent.click(screen.getByTestId('frame-studio__surface-sequence'));
    expect(props.onSurfaceChange).toHaveBeenCalledWith('title-cards');
  });

  it('dims the border weight while the border is off', () => {
    render(<FrameStudioControl {...makeProps({ surface: 'screen-border' as const, borderEnabled: false })} />);
    const row = screen.getByTestId('frame-studio__border-weight-readout').parentElement?.parentElement;
    expect(row?.className).toContain('opacity-40');
  });

  it('dims the fractal ratio only while there is no recursion', () => {
    const inert = render(
      <FrameStudioControl
        {...makeProps({ proportionsOpen: true, genome: { ...SIGNATURE_GENOME, fractalDepth: 0 } })}
      />,
    );
    expect(screen.getByTestId('frame-studio__gene-slider-fractalRatio')).toHaveProperty('disabled', true);
    inert.unmount();

    render(
      <FrameStudioControl
        {...makeProps({ proportionsOpen: true, genome: { ...SIGNATURE_GENOME, fractalDepth: 3 } })}
      />,
    );
    expect(screen.getByTestId('frame-studio__gene-slider-fractalRatio')).toHaveProperty('disabled', false);
  });

  it('resets and dismisses from the header', async () => {
    const props = makeProps();
    render(<FrameStudioControl {...props} />);
    await userEvent.click(screen.getByTestId('frame-studio__reset'));
    expect(props.onReset).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByTestId('frame-studio__dismiss'));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('hides the design gallery and proportions when the foundation is not authored', () => {
    render(<FrameStudioControl {...makeProps({ isDesignPattern: false, baseSource: 'fractal' })} />);
    expect(screen.queryByTestId('frame-studio__design-label')).toBeNull();
    expect(screen.queryByTestId('frame-studio__proportions-toggle')).toBeNull();
    expect(screen.getByTestId('frame-studio__level')).toHaveProperty('disabled', false);
  });
});

describe('GeneSlider', () => {
  it('shows the formatted value, the signature tick and reports changes', () => {
    const onChange = vi.fn();
    render(
      <GeneSlider geneKey="zigguratSteps" value={3} isInert={false} onChange={onChange} />,
    );
    expect(screen.getByText('Setback stairs')).toBeDefined();
    expect(screen.getByText('3 stairs')).toBeDefined();
    const slider = screen.getByTestId('frame-studio__gene-slider-zigguratSteps') as HTMLInputElement;
    expect(slider.getAttribute('aria-valuetext')).toBe('3 stairs');
    fireEvent.change(slider, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith('zigguratSteps', 2);
  });

  it('marks an inert gene and dims it', () => {
    const { container } = render(
      <GeneSlider geneKey="fractalRatio" value={0.5} isInert onChange={vi.fn()} />,
    );
    expect(container.querySelector('.opacity-40')).not.toBeNull();
    expect(screen.getByTestId('frame-studio__gene-slider-fractalRatio')).toHaveProperty('disabled', true);
  });
});
