// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { render, screen, fireEvent } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { SIGNATURE_GENOME, GENE_DEFINITIONS } from '@/features/art-deco-frame';

import { GeneSlider } from './GeneSlider';

import { setupDomTests } from '@/test/dom';

import { formatGeneValue, GENE_UI, signatureMarkerPercent } from '../data/frameDesigns';

setupDomTests();
const renderSlider = (overrides: Partial<React.ComponentProps<typeof GeneSlider>> = {}) => {
  const onChange = vi.fn();
  const props = {
    geneKey: 'cornerScale' as const,
    value: SIGNATURE_GENOME.cornerScale,
    isInert: false,
    onChange,
  };
  const view = render(<GeneSlider {...props} {...overrides} />);
  return { onChange, view, props };
};
describe('GeneSlider', () => {
  it('labels the gene, its current value and its hint', () => {
    renderSlider();

    expect(screen.getByText(GENE_UI.cornerScale.label)).toBeTruthy();
    // The value appears twice: as readout text and as `aria-valuetext`.
    expect(
      screen.getAllByText(formatGeneValue('cornerScale', SIGNATURE_GENOME.cornerScale))
    ).toHaveLength(1);
    expect(
      screen.getByTestId('frame-studio__gene-slider-cornerScale').getAttribute('aria-valuetext')
    ).toBe('×1.00');
    expect(screen.getByText(GENE_UI.cornerScale.label).getAttribute('title')).toBe(
      GENE_UI.cornerScale.hint
    );
  });

  it('binds the range to the gene definition', () => {
    renderSlider();
    const slider = screen.getByTestId('frame-studio__gene-slider-cornerScale') as HTMLInputElement;
    const definition = GENE_DEFINITIONS.cornerScale;

    expect(slider.type).toBe('range');
    expect(slider.id).toBe('gene-cornerScale');
    expect([slider.min, slider.max, slider.step]).toEqual([
      String(definition.min),
      String(definition.max),
      String(definition.step),
    ]);
    expect(slider.value).toBe(String(SIGNATURE_GENOME.cornerScale));
  });

  it('reports the formatted value to assistive tech', () => {
    renderSlider({ geneKey: 'zigguratSteps', value: 3 });

    expect(
      screen.getByTestId('frame-studio__gene-slider-zigguratSteps').getAttribute('aria-valuetext')
    ).toBe('3 stairs');
  });

  it('emits the gene key and the parsed number', () => {
    const { onChange } = renderSlider();

    fireEvent.change(screen.getByTestId('frame-studio__gene-slider-cornerScale'), {
      target: { value: '1.4' },
    });

    expect(onChange).toHaveBeenCalledWith('cornerScale', 1.4);
  });

  it('marks the signature tick along the track', () => {
    const { view } = renderSlider();
    const tick = view.container.querySelector('span[aria-hidden="true"]') as HTMLSpanElement;

    expect(tick.style.left).toBe(`${signatureMarkerPercent('cornerScale')}%`);
  });

  it('dims and disables an inert gene', () => {
    renderSlider({ isInert: true });
    const host = screen.getByTestId('frame-studio__gene-cornerScale');
    const slider = screen.getByTestId('frame-studio__gene-slider-cornerScale') as HTMLInputElement;

    expect(host.className).toContain('opacity-40');
    expect(slider.disabled).toBe(true);
  });

  it('lifts the dimming once the gene is live', () => {
    renderSlider();

    expect(screen.getByTestId('frame-studio__gene-cornerScale').className).not.toContain('opacity-40');
  });
});
