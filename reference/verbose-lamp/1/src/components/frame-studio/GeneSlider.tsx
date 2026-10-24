import React from 'react';
import { GENE_DEFINITIONS, type GeneKey } from '../../webgl/frame';
import {
  GENE_UI,
  formatGeneValue,
  isGeneAtSignature,
  signatureMarkerPercent,
} from '../../data/frameGenomeUi';

interface GeneSliderProps {
  geneKey: GeneKey;
  value: number;
  isInert: boolean;
  onChange: (key: GeneKey, value: number) => void;
}

export const GeneSlider: React.FC<GeneSliderProps> = ({ geneKey, value, isInert, onChange }) => {
  const definition = GENE_DEFINITIONS[geneKey];
  const ui = GENE_UI[geneKey];
  const formatted = formatGeneValue(geneKey, value);
  const isSignature = isGeneAtSignature(geneKey, value);
  const markerStyle = { left: `${signatureMarkerPercent(geneKey)}%` };
  const valueTone = isSignature ? 'text-[#d4af37]/70' : 'text-[#fff4d4]';
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange(geneKey, Number(event.target.value));

  return (
    <div className={isInert ? 'opacity-40' : ''} data-testid={`architecture__gene-${geneKey}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={`gene-${geneKey}`}
          className="text-[10px] tracking-[0.16em] uppercase text-[#e6d5b2]"
          title={ui.hint}
        >
          {ui.label}
        </label>
        <span className={`text-[11px] font-mono ${valueTone}`}>{formatted}</span>
      </div>
      <div className="relative mt-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-px h-3 bg-[#f8e29b]/50"
          style={markerStyle}
        />
        <input
          id={`gene-${geneKey}`}
          type="range"
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={value}
          disabled={isInert}
          onChange={handleChange}
          className="w-full gatsby-range disabled:cursor-not-allowed"
          aria-valuetext={formatted}
          title={ui.hint}
          data-testid={`architecture__gene-${geneKey}-slider`}
        />
      </div>
    </div>
  );
};
