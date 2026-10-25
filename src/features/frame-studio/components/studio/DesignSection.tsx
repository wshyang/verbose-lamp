import React from 'react';
import { chip } from './chip';
import type { FrameStudioControlProps } from '../FrameStudioControl';

/** The authored gallery: the delivered lockup plus the named designs and variations. */
type DesignSectionProps = Pick<FrameStudioControlProps, 'designLabel' | 'designGallery' | 'activeDesignIndex' | 'onDesignChange'>;

export const DesignSection: React.FC<DesignSectionProps> = ({ designLabel, designGallery, activeDesignIndex, onDesignChange }) => {
  return (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Design</div>
                <span className="text-[9px] uppercase text-[#f8e29b]" data-testid="frame-studio__design-label">
                  {designLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1" role="group" aria-label="Design gallery">
                {designGallery.map((entry) => (
                  <button
                    key={entry.index}
                    type="button"
                    onClick={() => onDesignChange(entry.index)}
                    aria-pressed={activeDesignIndex === entry.index}
                    title={entry.label}
                    className={`px-1 py-1 text-[8px] tracking-[0.06em] uppercase ${chip(activeDesignIndex === entry.index)}`}
                    data-testid="frame-studio__design"
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
  );
};
