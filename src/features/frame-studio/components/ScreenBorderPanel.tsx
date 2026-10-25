import { RangeInput } from '@/shared/ui';
import type { ScreenBorderPattern } from '@/features/art-deco-frame';
import type { FrameStudioControlProps } from './studioProps';
import { FOCUS_RING, chip } from './chip';

const BORDER_PATTERNS: readonly { id: ScreenBorderPattern; label: string }[] = [
  { id: 'poster', label: 'Printed poster' },
  { id: 'lattice', label: 'Deco lattice' },
];

type BorderProps = Pick<
  FrameStudioControlProps,
  | 'borderEnabled'
  | 'borderPattern'
  | 'borderWeight'
  | 'onBorderEnabledChange'
  | 'onBorderPatternChange'
  | 'onRerollBorder'
  | 'onBorderWeightChange'
>;

function BorderPatternChooser(props: Pick<BorderProps, 'borderPattern' | 'onBorderPatternChange' | 'onRerollBorder'>) {
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Pattern</div>
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Screen border pattern">
        {BORDER_PATTERNS.map((pattern) => (
          <button
            key={pattern.id}
            type="button"
            onClick={() => props.onBorderPatternChange(pattern.id)}
            aria-pressed={props.borderPattern === pattern.id}
            className={`px-2 py-1.5 text-[9px] tracking-[0.12em] uppercase ${chip(props.borderPattern === pattern.id)}`}
            data-testid="frame-studio__border-pattern"
          >
            {pattern.label}
          </button>
        ))}
      </div>
      {props.borderPattern === 'lattice' && (
        <button
          type="button"
          onClick={props.onRerollBorder}
          className={`w-full px-2 py-1.5 text-[9px] tracking-[0.12em] uppercase ${chip(false)}`}
          title="Draw a new seeded proscenium"
          data-testid="frame-studio__border-reroll"
        >
          Reroll proscenium
        </button>
      )}
    </div>
  );
}

function BorderWeightSlider(props: Pick<BorderProps, 'borderEnabled' | 'borderWeight' | 'onBorderWeightChange'>) {
  return (
    <div className={props.borderEnabled ? 'space-y-1' : 'space-y-1 opacity-40'}>
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Border weight</span>
        <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__border-weight-readout">{props.borderWeight}%</span>
      </div>
      <RangeInput
        id="frame-studio-border-weight"
        min={0} max={100} step={5} value={props.borderWeight}
        disabled={!props.borderEnabled}
        onChange={(e) => props.onBorderWeightChange(Number(e.target.value))}
        className={`${FOCUS_RING} disabled:cursor-not-allowed`} aria-label="Border weight"
        data-testid="frame-studio__border-weight"
      />
      <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/70">
        Weight adds nested rules and reeding. The proportions sliders under the title frame reshape it too.
      </p>
    </div>
  );
}

export function ScreenBorderPanel(props: BorderProps) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/80" data-testid="frame-studio__border-blurb">
        The printed border of the one-sheet, drawn around the edge of the picture. It stays fixed while the camera flies.
      </p>
      <label className="flex items-center justify-between gap-3 cursor-pointer" data-testid="frame-studio__border-row">
        <span className="text-[11px] tracking-[0.16em] uppercase text-[#e6d5b2]">Show border</span>
        <input
          type="checkbox" checked={props.borderEnabled}
          onChange={(e) => props.onBorderEnabledChange(e.target.checked)}
          className="accent-[#d4af37] w-4 h-4 cursor-pointer" aria-label="Show screen border"
          data-testid="frame-studio__border-enable"
        />
      </label>
      <BorderPatternChooser {...props} />
      <BorderWeightSlider {...props} />
    </div>
  );
}
