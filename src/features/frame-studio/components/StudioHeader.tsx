import { RotateCcw, X } from 'lucide-react';
import type { FrameStudioControlProps } from './studioProps';

const ICON_BUTTON =
  'p-1.5 border border-[#d4af37]/30 text-[#d4af37] hover:text-[#fff4d4] hover:border-[#f8e29b] cursor-pointer';

type StudioHeaderProps = Pick<FrameStudioControlProps, 'onReset' | 'onDismiss'>;

export function StudioHeader({ onReset, onDismiss }: StudioHeaderProps) {
  return (
    <header className="flex items-center gap-2 border-b border-[#d4af37]/25 pb-2">
      <span className="flex-1 text-[11px] tracking-[0.24em] uppercase text-[#f8e29b]">Frame Studio</span>
      <button
        type="button"
        onClick={onReset}
        className={ICON_BUTTON}
        title="Reset to original"
        aria-label="Reset frame studio to original"
        data-testid="frame-studio__reset"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className={ICON_BUTTON}
        aria-label="Dismiss Frame Studio (F to reopen)"
        data-testid="frame-studio__dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </header>
  );
}
