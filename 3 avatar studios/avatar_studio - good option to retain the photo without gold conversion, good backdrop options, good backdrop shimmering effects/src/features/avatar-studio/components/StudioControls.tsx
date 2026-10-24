import { Button, RangeInput } from '@/shared/ui';
import { ENAMEL_PALETTES, PATTERN_OPTIONS } from '../data/backdropStyles';
import type { AvatarStudioState } from '../hooks/useAvatarStudio';
import type { SubjectFinish } from '../model/types';

const LABEL = 'block text-[10px] tracking-[0.26em] uppercase text-[#d4af37]';
const CHIP = 'px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase border transition-all whitespace-nowrap';
const IDLE = 'bg-[#0d0a13]/70 border-[#d4af37]/25 text-[#d4af37]/80 hover:border-[#d4af37]/65 hover:text-[#fff4d4]';
const ACTIVE = 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc] shadow-[0_0_14px_rgba(248,226,155,0.2)]';

const PALETTES = Object.values(ENAMEL_PALETTES);
const FINISHES: readonly { readonly id: SubjectFinish; readonly label: string }[] = [
  { id: 'gilded', label: 'Gilded' },
  { id: 'natural', label: 'Natural' },
];

interface ChipProps {
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly testId: string;
  readonly children: React.ReactNode;
}

function Chip({ isActive, onClick, testId, children }: ChipProps) {
  return (
    <Button
      size="small"
      variant={isActive ? 'selected' : 'panel'}
      onClick={onClick}
      aria-pressed={isActive}
      className={`${CHIP} ${isActive ? ACTIVE : IDLE} gap-2`}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

type Props = { readonly studio: AvatarStudioState };

export function PatternRow({ studio }: Props) {
  return (
    <div>
      <span className={LABEL}>Gold work</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PATTERN_OPTIONS.map((option) => (
          <Chip key={option.id} isActive={studio.style.pattern === option.id} onClick={() => studio.setPattern(option.id)} testId="avatar-studio__pattern">
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function PaletteRow({ studio }: Props) {
  return (
    <div>
      <span className={LABEL}>Enamel</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PALETTES.map((palette) => (
          <Chip key={palette.id} isActive={studio.style.palette === palette.id} onClick={() => studio.setPalette(palette.id)} testId="avatar-studio__palette">
            <span aria-hidden="true" className="flex h-2.5 w-8 overflow-hidden border border-[#f8e29b]/50">
              {palette.enamels.map((colour) => <span key={colour} className="flex-1" style={{ background: colour }} />)}
            </span>
            {palette.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export function FinishRow({ studio }: Props) {
  return (
    <div>
      <span className={LABEL}>Portrait finish</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FINISHES.map((option) => (
          <Chip key={option.id} isActive={studio.finish === option.id} onClick={() => studio.setFinish(option.id)} testId="avatar-studio__finish">
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

interface SliderProps {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly testId: string;
  readonly isDisabled?: boolean;
  readonly onChange: (value: number) => void;
}

export function Slider({ label, min, max, value, testId, isDisabled, onChange }: SliderProps) {
  return (
    <label className={`block ${isDisabled ? 'opacity-40' : ''}`}>
      <span className="flex justify-between">
        <span className={LABEL}>{label}</span>
        <span className="text-xs tabular-nums text-[#fff4d4]/75">{value}</span>
      </span>
      <RangeInput
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={isDisabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="mt-2"
        data-testid={testId}
      />
    </label>
  );
}

export function BackgroundControls({ studio }: Props) {
  const { tuning } = studio;
  const isOff = !tuning.isBackgroundRemoved || studio.subject?.matte === null;
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#fff4d4]/80">
        <input
          type="checkbox"
          checked={tuning.isBackgroundRemoved}
          onChange={(event) => studio.updateTuning({ isBackgroundRemoved: event.currentTarget.checked })}
          className="accent-[#d4af37]"
          data-testid="avatar-studio__remove-background"
        />
        Remove background
      </label>
      <Slider label="Cut tightness" min={16} max={240} value={tuning.threshold} isDisabled={isOff} testId="avatar-studio__threshold" onChange={(threshold) => studio.updateTuning({ threshold })} />
      <Slider label="Edge" min={-4} max={4} value={tuning.edge} isDisabled={isOff} testId="avatar-studio__edge" onChange={(edge) => studio.updateTuning({ edge })} />
      <Slider label="Rays & bands" min={4} max={32} value={studio.style.bands} testId="avatar-studio__bands" onChange={studio.setBands} />
    </div>
  );
}
