// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SIGNATURE_GENOME } from '@/features/art-deco-frame';
import { GeneSlider } from './GeneSlider';

describe('GeneSlider signature styling', () => {
  it('uses bright styling away from signature and muted styling at signature', () => {
    const { rerender } = render(
      <GeneSlider geneKey="cornerScale" value={1.7} isInert={false} onChange={vi.fn()} />
    );
    expect(screen.getByText('×1.70').className).toContain('text-[#fff4d4]');
    rerender(
      <GeneSlider geneKey="cornerScale" value={SIGNATURE_GENOME.cornerScale} isInert onChange={vi.fn()} />
    );
    expect(screen.getByText('×1.00').className).toContain('text-[#d4af37]/70');
  });
});
