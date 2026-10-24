import { Sparkles } from 'lucide-react';
import type { AvatarLook } from '../hooks/useAvatarLook';
import type { AvatarFrame, SubjectFinish } from '../types';
import { GildingControls, GoldToneRow } from './GildingControls';
import { Chip, ChipRow, SECTION_TITLE } from './studioUi';

const FINISHES: readonly { readonly id: SubjectFinish; readonly label: string; readonly title: string }[] = [
  { id: 'natural', label: 'Natural colour', title: 'Keep the photo’s own colours inside a gold outline' },
  { id: 'tinted', label: 'Gold wash', title: 'A quick gold tint that keeps a trace of the photo’s colour' },
  { id: 'gilded', label: 'Gild subject', title: 'Cast the person in sculpted gold, with full tone controls' },
];

const FRAMES: readonly { readonly id: AvatarFrame; readonly label: string }[] = [
  { id: 'medallion', label: 'Medallion' },
  { id: 'plaque', label: 'Plaque' },
];

export function SubjectControls({ look }: { readonly look: AvatarLook }) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="avatar-studio-subject-title">
      <h3 id="avatar-studio-subject-title" className={SECTION_TITLE}>PORTRAIT</h3>
      <ChipRow label="Finish">
        {FINISHES.map((finish) => (
          <Chip key={finish.id} isActive={look.finish === finish.id} onClick={() => look.setFinish(finish.id)} title={finish.title} testId="avatar-studio__subject-finish">
            {finish.label}
          </Chip>
        ))}
      </ChipRow>
      {look.finish === 'gilded' && <GildingControls look={look} />}
      {look.finish === 'tinted' && <GoldToneRow look={look} />}
      <div className="flex flex-wrap items-end gap-5">
        <ChipRow label="Frame">
          {FRAMES.map((frame) => (
            <Chip key={frame.id} isActive={look.frame === frame.id} onClick={() => look.setFrame(frame.id)} testId="avatar-studio__frame-shape">
              {frame.label}
            </Chip>
          ))}
        </ChipRow>
        <Chip isActive={look.isShimmering} onClick={look.toggleShimmer} testId="avatar-studio__shimmer" title="Light sweeps across the gold. Preview only; the PNG is a still image">
          <Sparkles className="h-3 w-3" />
          Sheen
        </Chip>
      </div>
    </section>
  );
}
