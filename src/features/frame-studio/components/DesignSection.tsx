import type { FrameStudioControlProps } from './studioProps';
import { chip } from './chip';

type DesignSectionProps = Pick<
  FrameStudioControlProps,
  'designGallery' | 'activeDesignIndex' | 'designLabel' | 'onDesignChange'
>;

export function DesignSection({ designGallery, activeDesignIndex, designLabel, onDesignChange }: DesignSectionProps) {
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
}
