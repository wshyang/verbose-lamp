import { GENESIS_LEVEL_MAX, GENESIS_LEVEL_MIN } from '@/features/art-deco-frame';
import { RangeInput } from '@/shared/ui';
import type { FrameStudioControlProps } from './studioProps';
import { FOCUS_RING, chip } from './chip';

type LevelDetailProps = Pick<
  FrameStudioControlProps,
  | 'level'
  | 'detailPercent'
  | 'detailPresets'
  | 'activePreset'
  | 'isDesignPattern'
  | 'onLevelChange'
  | 'onDetailChange'
>;

/** The balanced preset reads as "Balanced"; a hand-set value reads as its percentage. */
function detailReadout({ activePreset, detailPercent }: Pick<LevelDetailProps, 'activePreset' | 'detailPercent'>) {
  if (!activePreset) return `${detailPercent}%`;
  return activePreset.id === 'baseline' ? 'Balanced' : activePreset.label;
}

export function BaseLevelSlider({ level, isDesignPattern, onLevelChange }: Pick<LevelDetailProps, 'level' | 'isDesignPattern' | 'onLevelChange'>) {
  return (
    <div className={isDesignPattern ? 'space-y-1 opacity-40' : 'space-y-1'}>
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Base level</span>
        <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__level-readout">{level}</span>
      </div>
      <RangeInput
        id="frame-studio-level"
        min={GENESIS_LEVEL_MIN} max={GENESIS_LEVEL_MAX} step={1} value={level}
        disabled={isDesignPattern}
        onChange={(event) => onLevelChange(Number(event.target.value))}
        className={`${FOCUS_RING} disabled:cursor-not-allowed`}
        aria-label="Base pattern level, 1 to 4"
        data-testid="frame-studio__level"
      />
    </div>
  );
}

export function DetailSlider(props: Pick<LevelDetailProps, 'detailPercent' | 'detailPresets' | 'activePreset' | 'onDetailChange'>) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Detail</span>
        <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__detail-readout">{detailReadout(props)}</span>
      </div>
      <RangeInput
        id="frame-studio-detail"
        min={0} max={100} step={5} value={props.detailPercent}
        onChange={(e) => props.onDetailChange(Number(e.target.value))}
        className={FOCUS_RING} aria-label="Ornament detail, 50 is balanced"
        data-testid="frame-studio__detail"
      />
      <div className="flex justify-between">
        {props.detailPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => props.onDetailChange(Math.round(preset.value * 100))}
            aria-pressed={props.activePreset?.id === preset.id}
            className={`px-1 py-0.5 text-[8px] uppercase ${chip(props.activePreset?.id === preset.id)}`}
            data-testid="frame-studio__detail-preset"
          >
            {preset.id === 'baseline' ? 'Balanced' : preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
