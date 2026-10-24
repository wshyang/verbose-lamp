import { GILDING_PRESETS, GOLD_RAMPS } from '@/features/gilded-portrait';
import { GILDING_TONE_RANGES, gildingSliderValue } from '../gilding';
import type { AvatarLook } from '../hooks/useAvatarLook';
import { Chip, ChipRow, RangeControl } from './studioUi';

const RAMPS = Object.values(GOLD_RAMPS);

export function GoldToneRow({ look }: { readonly look: AvatarLook }) {
  return (
    <ChipRow label="Gold tone">
      {RAMPS.map((ramp) => (
        <Chip key={ramp.id} isActive={look.gilding.rampId === ramp.id} onClick={() => look.setGildingRamp(ramp.id)} testId="avatar-studio__gold-tone">
          <span
            aria-hidden="true"
            className="h-2 w-7 border border-[#fff6dc]/25"
            style={{ background: `linear-gradient(90deg, ${ramp.stops[0].color}, ${ramp.stops[ramp.stops.length - 1].color})` }}
          />
          {ramp.name}
        </Chip>
      ))}
    </ChipRow>
  );
}

/** The full gilding control set for the "Gild subject" finish (lifted from implementation C). */
export function GildingControls({ look }: { readonly look: AvatarLook }) {
  return (
    <div className="flex flex-col gap-4 border-l border-[#d4af37]/20 pl-3">
      <ChipRow label="Gilding">
        {GILDING_PRESETS.map((preset) => (
          <Chip key={preset.id} isActive={look.gildingPresetId === preset.id} onClick={() => look.applyGildingPreset(preset)} testId="avatar-studio__gilding-preset">
            {preset.name}
          </Chip>
        ))}
      </ChipRow>
      <GoldToneRow look={look} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GILDING_TONE_RANGES.map((range) => (
          <RangeControl
            key={range.key} id={`avatar-studio-gilding-${range.key}`} label={range.label} min={range.min} max={range.max} step={1}
            value={gildingSliderValue(look.gilding, range)}
            displayValue={`${gildingSliderValue(look.gilding, range)}${range.key === 'clarity' ? '%' : ''}`}
            testId={`avatar-studio__gilding-${range.key}`} onChange={(value) => look.setGildingTone(range.key, value)}
          />
        ))}
      </div>
    </div>
  );
}
