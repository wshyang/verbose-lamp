import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { CUT_OUT_STEPS, TUNING_BOUNDS, type TuningKnob } from '@/features/background-removal';
import { Button } from '@/shared/ui';
import type { AvatarLook } from '../hooks/useAvatarLook';
import type { CutOutAvailability } from '../hooks/usePhotoSession';
import { STAGE_HINTS } from '../stage';
import { ACTION, Chip, ChipRow, NOTE, RangeControl, SECTION_TITLE } from './studioUi';

const STEP_ROWS: readonly { readonly knob: TuningKnob; readonly label: string; readonly testId: string }[] = [
  { knob: 'threshold', label: 'Cut', testId: 'avatar-studio__cut-threshold' },
  { knob: 'minIsland', label: 'Stray pieces', testId: 'avatar-studio__cut-strays' },
  { knob: 'edge', label: 'Edge', testId: 'avatar-studio__cut-edge' },
];

const AVAILABILITY_NOTES: Readonly<Record<CutOutAvailability, string | null>> = Object.freeze({
  available: null,
  pending: STAGE_HINTS.refining,
  unavailable: STAGE_HINTS.plain,
});

function FineTune({ look }: { readonly look: AvatarLook }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {STEP_ROWS.map(({ knob, label, testId }) => (
        <RangeControl
          key={knob} id={`avatar-studio-cut-${knob}`} label={label} min={TUNING_BOUNDS[knob].min} max={TUNING_BOUNDS[knob].max} step={1}
          value={look.tuning[knob]} displayValue={String(look.tuning[knob])} testId={testId} onChange={(value) => look.setTuningKnob(knob, value)}
        />
      ))}
    </div>
  );
}

export function CutOutControls({ look, availability }: { readonly look: AvatarLook; readonly availability: CutOutAvailability }) {
  const isUsable = availability === 'available';
  const isCutting = isUsable && look.tuning.removeBackground;
  const note = AVAILABILITY_NOTES[availability];
  return (
    <section className="flex flex-col gap-4" aria-labelledby="avatar-studio-cut-title">
      <h3 id="avatar-studio-cut-title" className={SECTION_TITLE}>BACKGROUND</h3>
      {note && <p className={NOTE}>{note}</p>}
      <ChipRow label="Photo background">
        <Chip isActive={look.tuning.removeBackground} isDisabled={!isUsable} onClick={() => look.setBackgroundRemoved(true)} testId="avatar-studio__cut-background">Take it out</Chip>
        <Chip isActive={!look.tuning.removeBackground} isDisabled={!isUsable} onClick={() => look.setBackgroundRemoved(false)} testId="avatar-studio__cut-background">Leave it in</Chip>
      </ChipRow>
      {isCutting && STEP_ROWS.map(({ knob, label, testId }) => (
        <ChipRow key={knob} label={label}>
          {CUT_OUT_STEPS[knob].map((step) => (
            <Chip key={step.label} isActive={look.tuning[knob] === step.value} onClick={() => look.setTuningKnob(knob, step.value)} testId={testId}>{step.label}</Chip>
          ))}
        </ChipRow>
      ))}
      {isCutting && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={look.toggleFineTuning} variant={look.isFineTuning ? 'selected' : 'panel'} size="compact" aria-pressed={look.isFineTuning}
            className={`${ACTION} border-[#d4af37]/30 text-[#d4af37]/85 hover:border-[#f8e29b]`} data-testid="avatar-studio__cut-fine-toggle">
            <SlidersHorizontal className="h-3 w-3" />
            Fine tune
          </Button>
          <Button type="button" onClick={look.resetTuning} variant="panel" size="compact"
            className={`${ACTION} border-[#d4af37]/30 text-[#d4af37]/85 hover:border-[#f8e29b]`} data-testid="avatar-studio__cut-reset">
            <RotateCcw className="h-3 w-3" />
            Back to normal
          </Button>
        </div>
      )}
      {isCutting && look.isFineTuning && <FineTune look={look} />}
    </section>
  );
}
