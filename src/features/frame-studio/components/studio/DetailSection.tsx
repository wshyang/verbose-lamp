import React from 'react';
import { chip } from './chip';
import type { IntricacyPreset } from '@/features/art-deco-frame';
import { RangeInput } from '@/shared/ui';
import type { FrameStudioControlProps } from '../FrameStudioControl';

/** Base pattern level plus the ornament-detail slider and its presets. */
function detailReadoutOf(preset: IntricacyPreset | null, percent: number): string {
  if (!preset) return `${percent}%`;
  return preset.id === 'baseline' ? 'Balanced' : preset.label;
}

type DetailSectionProps = Pick<FrameStudioControlProps, 'isDesignPattern' | 'level' | 'onLevelChange' | 'detailPercent' | 'activePreset' | 'detailPresets' | 'onDetailChange'>;

export const DetailSection: React.FC<DetailSectionProps> = ({ isDesignPattern, level, onLevelChange, detailPercent, activePreset, detailPresets, onDetailChange }) => {
  const detailReadout = detailReadoutOf(activePreset, detailPercent);
  return (
    <>
      <div className={isDesignPattern ? 'space-y-1 opacity-40' : 'space-y-1'}>
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Base level</span>
              <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__level-readout">{level}</span>
            </div>
            <RangeInput
              id="frame-studio-level"
              min={1} max={4} step={1} value={level}
              disabled={isDesignPattern}
              onChange={(event) => onLevelChange(Number(event.target.value))}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2 disabled:cursor-not-allowed"
              aria-label="Base pattern level, 1 to 4"
              data-testid="frame-studio__level"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Detail</span>
              <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__detail-readout">{detailReadout}</span>
            </div>
            <RangeInput
              id="frame-studio-detail"
              min={0} max={100} step={5} value={detailPercent}
              onChange={(e) => onDetailChange(Number(e.target.value))}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2" aria-label="Ornament detail, 50 is balanced"
              data-testid="frame-studio__detail"
            />
            <div className="flex justify-between">
              {detailPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onDetailChange(Math.round(preset.value * 100))}
                  aria-pressed={activePreset?.id === preset.id}
                  className={`px-1 py-0.5 text-[8px] uppercase ${chip(activePreset?.id === preset.id)}`}
                  data-testid="frame-studio__detail-preset"
                >
                  {preset.id === 'baseline' ? 'Balanced' : preset.label}
                </button>
              ))}
            </div>
          </div>
    </>
  );
};
