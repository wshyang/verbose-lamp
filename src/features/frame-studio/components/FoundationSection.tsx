import type { FrameStudioControlProps } from './studioProps';
import { chip } from './chip';

type FoundationSectionProps = Pick<
  FrameStudioControlProps,
  'patterns' | 'baseSource' | 'layers' | 'onPatternChange' | 'onRerollPattern'
>;

/** The seed reaches the foundation and any composed layer, so either one earns a reroll. */
const isLatticeActive = ({ baseSource, layers }: Pick<FoundationSectionProps, 'baseSource' | 'layers'>) =>
  baseSource === 'lattice' || layers.some((layer) => layer.source === 'lattice' && layer.enabled);

export function FoundationSection(props: FoundationSectionProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Foundation</div>
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Base frame pattern">
        {props.patterns.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            onClick={() => props.onPatternChange(pattern.id)}
            aria-pressed={props.baseSource === pattern.id}
            title={pattern.blurb}
            className={`px-2 py-1.5 text-[9px] tracking-[0.12em] uppercase ${chip(props.baseSource === pattern.id)}`}
            data-testid="frame-studio__pattern"
          >
            {pattern.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/75">
        Keep the authored frame as your base, or build from another foundation.
      </p>
      {isLatticeActive(props) && (
        <button
          type="button"
          onClick={props.onRerollPattern}
          className={`w-full px-2 py-1.5 text-[9px] tracking-[0.12em] uppercase ${chip(false)}`}
          title="Draw a new seeded lattice pattern"
          data-testid="frame-studio__reroll"
        >
          Reroll pattern
        </button>
      )}
    </div>
  );
}
