import {
  BACKDROP_PRESETS,
  ENAMEL_PALETTES,
  INLAY_LABELS,
  PATTERN_KNOBS,
  PATTERN_LABELS,
  SPEC_KNOBS,
  describeKnob,
  isPaletteActive,
  paletteStops,
  patternKnobValue,
  specKnobValue,
  type BackdropKind,
  type InlayStyle,
  type SpecKnob,
} from '@/features/enamel-backdrop';
import type { AvatarLook } from '../hooks/useAvatarLook';
import { Chip, ChipRow, LABEL, RangeControl, SECTION_TITLE } from './studioUi';

const KINDS = Object.keys(PATTERN_LABELS) as BackdropKind[];
const INLAYS = Object.keys(INLAY_LABELS) as InlayStyle[];
const percent = (value: number) => `${Math.round(value * 100)}%`;
const FINISH_KNOBS: readonly { readonly knob: SpecKnob; readonly testId: string; readonly format: (value: number) => string }[] = [
  { knob: 'gilt', testId: 'avatar-studio__gilt', format: percent },
  { knob: 'wireWidth', testId: 'avatar-studio__wire-width', format: (value) => value.toFixed(1) },
  { knob: 'leafDensity', testId: 'avatar-studio__leaf-density', format: percent },
  { knob: 'guilloche', testId: 'avatar-studio__guilloche', format: percent },
];
const swatch = (stops: readonly string[]) => `linear-gradient(90deg, ${stops.join(', ')})`;

function ColourInput({ label, value, testId, onChange }: { label: string; value: string; testId: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={label}
        className="h-7 w-9 cursor-pointer border border-[#d4af37]/40 bg-transparent p-0.5"
        data-testid={testId}
      />
      <span className={LABEL}>{label}</span>
    </label>
  );
}

export function BackdropControls({ look }: { readonly look: AvatarLook }) {
  const spec = look.backdrop;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="avatar-studio-backdrop-title">
      <h3 id="avatar-studio-backdrop-title" className={SECTION_TITLE}>ENAMEL BACKDROP</h3>
      <ChipRow label="Style">
        {BACKDROP_PRESETS.map((preset) => (
          <Chip key={preset.id} isActive={spec === preset.spec} onClick={() => look.applyBackdropPreset(preset)} testId="avatar-studio__backdrop-preset">
            {preset.name}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label="Pattern">
        {KINDS.map((kind) => (
          <Chip key={kind} isActive={spec.pattern.kind === kind} onClick={() => look.choosePattern(kind)} testId="avatar-studio__pattern">
            {PATTERN_LABELS[kind]}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label="Enamel">
        {ENAMEL_PALETTES.map((palette) => (
          <Chip key={palette.id} isActive={isPaletteActive(spec, palette)} onClick={() => look.choosePalette(palette)} testId="avatar-studio__palette">
            <span aria-hidden="true" className="h-2.5 w-7 border border-[#f8e29b]/40" style={{ background: swatch(paletteStops(palette)) }} />
            {palette.name}
          </Chip>
        ))}
      </ChipRow>
      <div className="flex flex-wrap gap-4">
        <ColourInput label="First enamel" value={spec.colourOne} testId="avatar-studio__colour-one" onChange={(value) => look.setColour('colourOne', value)} />
        <ColourInput label="Last enamel" value={spec.colourTwo} testId="avatar-studio__colour-two" onChange={(value) => look.setColour('colourTwo', value)} />
      </div>
      <ChipRow label="Inlay">
        {INLAYS.map((inlay) => (
          <Chip key={inlay} isActive={(spec.inlay ?? 'cloisonne') === inlay} onClick={() => look.setInlay(inlay)} testId="avatar-studio__inlay">
            {INLAY_LABELS[inlay]}
          </Chip>
        ))}
      </ChipRow>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RangeControl
          id="avatar-studio-bands" label={SPEC_KNOBS.bands.label} min={SPEC_KNOBS.bands.min} max={SPEC_KNOBS.bands.max} step={SPEC_KNOBS.bands.step}
          value={spec.bands} displayValue={String(spec.bands)} testId="avatar-studio__bands" onChange={(value) => look.setSpecKnob('bands', value)}
        />
        {PATTERN_KNOBS[spec.pattern.kind].map((knob) => (
          <RangeControl
            key={`${spec.pattern.kind}-${knob.key}`} id={`avatar-studio-knob-${knob.key}`} label={knob.label} min={knob.min} max={knob.max} step={knob.step}
            value={patternKnobValue(spec.pattern, knob.key)} displayValue={describeKnob(spec.pattern, knob.key)}
            testId="avatar-studio__pattern-knob" onChange={(value) => look.setPatternKnob(knob.key, value)}
          />
        ))}
        {FINISH_KNOBS.map(({ knob, testId, format }) => (
          <RangeControl
            key={knob} id={`avatar-studio-${knob}`} label={SPEC_KNOBS[knob].label} min={SPEC_KNOBS[knob].min} max={SPEC_KNOBS[knob].max} step={SPEC_KNOBS[knob].step}
            value={specKnobValue(spec, knob)} displayValue={format(specKnobValue(spec, knob))} testId={testId} onChange={(value) => look.setSpecKnob(knob, value)}
          />
        ))}
      </div>
    </section>
  );
}
