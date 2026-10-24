import React from 'react';
import { formatGeneValue, GENE_UI, isGeneAtSignature, signatureMarkerPercent } from '../data/frameDesigns';
import { GENE_DEFINITIONS, type GeneKey } from '@/features/art-deco-frame';
import { RangeInput } from '@/shared/ui';

interface GeneSliderProps {
  geneKey: GeneKey;
  value: number;
  isInert: boolean;
  onChange: (key: GeneKey, value: number) => void;
}

/** One proportion gene. The tick marks the signature value that reproduces the original. */
export const GeneSlider: React.FC<GeneSliderProps> = ({ geneKey, value, isInert, onChange }) => {
  const definition = GENE_DEFINITIONS[geneKey];
  const ui = GENE_UI[geneKey];
  const formatted = formatGeneValue(geneKey, value);
  const atSignature = isGeneAtSignature(geneKey, value);

  return (
    <div className={isInert ? 'opacity-40' : ''} data-testid={`frame-studio__gene-${geneKey}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={`gene-${geneKey}`}
          className="text-[10px] tracking-[0.16em] uppercase text-[#e6d5b2]"
          title={ui.hint}
        >
          {ui.label}
        </label>
        <span className={`text-[11px] font-mono ${atSignature ? 'text-[#d4af37]/70' : 'text-[#fff4d4]'}`}>
          {formatted}
        </span>
      </div>
      <div className="relative mt-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-px h-3 bg-[#f8e29b]/50"
          style={{ left: `${signatureMarkerPercent(geneKey)}%` }}
        />
        <RangeInput
          id={`gene-${geneKey}`}
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={value}
          disabled={isInert}
          onChange={(event) => onChange(geneKey, Number(event.target.value))}
          className="disabled:cursor-not-allowed"
          aria-valuetext={formatted}
          title={ui.hint}
          data-testid={`frame-studio__gene-slider-${geneKey}`}
        />
      </div>
    </div>
  );
};
