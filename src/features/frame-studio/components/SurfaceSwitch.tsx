import type { FrameStudioControlProps } from './studioProps';
import { chip } from './chip';

type SurfaceSwitchProps = Pick<FrameStudioControlProps, 'surface' | 'onSurfaceChange'>;

export function SurfaceSwitch({ surface, onSurfaceChange }: SurfaceSwitchProps) {
  const isTitle = surface === 'title-cards';
  return (
    <div className="grid grid-cols-2 gap-1" role="group" aria-label="Frame surface">
      <button type="button" onClick={() => onSurfaceChange('title-cards')} aria-pressed={isTitle} className={`px-2 py-1.5 text-[10px] tracking-[0.12em] uppercase ${chip(isTitle)}`} data-testid="frame-studio__surface-sequence">
        Title cards
      </button>
      <button type="button" onClick={() => onSurfaceChange('screen-border')} aria-pressed={!isTitle} className={`px-2 py-1.5 text-[10px] tracking-[0.12em] uppercase ${chip(!isTitle)}`} data-testid="frame-studio__surface-border">
        Screen border
      </button>
    </div>
  );
}
