import { Mic2 } from 'lucide-react';
import type { NormRect } from '@/features/spectacle';
import { useSpeakerDrag } from '../hooks/useSpeakerDrag';

interface KeepClearSpeakerProps {
  rect: NormRect;
  onMove: (dx: number, dy: number) => void;
  testId?: string;
}

/** A draggable "keep clear" box: fireworks and searchlights avoid it. */
export function KeepClearSpeaker({
  rect,
  onMove,
  testId = 'spectacle-preview__speaker',
}: KeepClearSpeakerProps) {
  const drag = useSpeakerDrag(onMove);
  return (
    <div
      role="img"
      aria-label="Keep-clear demo speaker box. Drag to move; fireworks avoid it."
      data-testid={testId}
      className="absolute z-20 flex cursor-move touch-none flex-col items-center justify-center gap-1 border-2 border-dashed border-[#d9b264]/70 bg-[#171006]/40 text-[#d9b264]"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }}
      {...drag}
    >
      <Mic2 size={18} aria-hidden />
      <span className="text-[8px] tracking-[0.3em]">KEEP CLEAR</span>
    </div>
  );
}
