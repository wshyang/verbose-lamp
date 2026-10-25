import React from 'react';
import { chip } from './chip';
import type { FrameStudioControlProps } from '../FrameStudioControl';

/** The foundation pattern buttons: authored, or one of the generative families. */
type FoundationSectionProps = Pick<FrameStudioControlProps, 'patterns' | 'baseSource' | 'onPatternChange'>;

export const FoundationSection: React.FC<FoundationSectionProps> = ({ patterns, baseSource, onPatternChange }) => {
  return (
          <div className="space-y-1.5">
            <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Foundation</div>
            <div className="grid grid-cols-2 gap-1" role="group" aria-label="Base frame pattern">
              {patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => onPatternChange(pattern.id)}
                  aria-pressed={baseSource === pattern.id}
                  title={pattern.blurb}
                  className={`px-2 py-1.5 text-[9px] tracking-[0.12em] uppercase ${chip(baseSource === pattern.id)}`}
                  data-testid="frame-studio__pattern"
                >
                  {pattern.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/75">
              Keep the authored frame as your base, or build from another foundation.
            </p>
          </div>
  );
};
