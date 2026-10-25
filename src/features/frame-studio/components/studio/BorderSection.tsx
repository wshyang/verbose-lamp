import React from 'react';
import { RangeInput } from '@/shared/ui';
import type { FrameStudioControlProps } from '../FrameStudioControl';

/** The one-sheet border: on/off, and how heavy the printed rule is. */
type BorderSectionProps = Pick<FrameStudioControlProps, 'borderEnabled' | 'borderWeight' | 'onBorderEnabledChange' | 'onBorderWeightChange'>;

export const BorderSection: React.FC<BorderSectionProps> = ({ borderEnabled, borderWeight, onBorderEnabledChange, onBorderWeightChange }) => {
  return (
        <div className="space-y-3">
          <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/80" data-testid="frame-studio__border-blurb">
            The printed border of the one-sheet, drawn around the edge of the picture. It stays fixed while the camera flies.
          </p>
          <label className="flex items-center justify-between gap-3 cursor-pointer" data-testid="frame-studio__border-row">
            <span className="text-[11px] tracking-[0.16em] uppercase text-[#e6d5b2]">Show border</span>
            <input
              type="checkbox" checked={borderEnabled}
              onChange={(e) => onBorderEnabledChange(e.target.checked)}
              className="accent-[#d4af37] w-4 h-4 cursor-pointer" aria-label="Show screen border"
              data-testid="frame-studio__border-enable"
            />
          </label>
          <div className={borderEnabled ? 'space-y-1' : 'space-y-1 opacity-40'}>
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Border weight</span>
              <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__border-weight-readout">{borderWeight}%</span>
            </div>
            <RangeInput
              id="frame-studio-border-weight"
              min={0} max={100} step={5} value={borderWeight}
              disabled={!borderEnabled}
              onChange={(e) => onBorderWeightChange(Number(e.target.value))}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2 disabled:cursor-not-allowed" aria-label="Border weight"
              data-testid="frame-studio__border-weight"
            />
            <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/70">
              Weight adds nested rules and reeding. The proportions sliders under the title frame reshape it too.
            </p>
          </div>
        </div>
  );
};
