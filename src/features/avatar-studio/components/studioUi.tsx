import type { ReactNode } from 'react';
import { Button, RangeInput } from '@/shared/ui';

/** Gold studio styling, copied from the Gilded Portrait modal so both studios read as one house. */
export const CHIP_BASE = 'px-2.5 py-1 text-[10px] tracking-[0.16em] uppercase border transition-all whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
export const CHIP_IDLE = 'bg-[#0d0a13]/70 border-[#d4af37]/25 text-[#d4af37]/80 hover:border-[#d4af37]/65 hover:text-[#fff4d4]';
export const CHIP_ACTIVE = 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc] shadow-[0_0_14px_rgba(248,226,155,0.2)]';
export const LABEL = 'block text-[10px] tracking-[0.26em] uppercase text-[#d4af37]';
export const ACTION = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-[0.16em] uppercase border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
export const SECTION_TITLE = 'font-deco text-xs tracking-[0.22em] text-[#fff4d4]';
export const NOTE = 'font-editorial text-xs italic leading-relaxed text-[#e0cfa9]/60';

interface ChipProps {
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly testId: string;
  readonly children: ReactNode;
  readonly isDisabled?: boolean;
  readonly title?: string;
}

export function Chip({ isActive, onClick, testId, children, isDisabled = false, title }: ChipProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      variant={isActive ? 'selected' : 'panel'}
      size="small"
      className={`${CHIP_BASE} ${isActive ? CHIP_ACTIVE : CHIP_IDLE} gap-2`}
      aria-pressed={isActive}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

interface RangeControlProps {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly displayValue: string;
  readonly testId: string;
  readonly onChange: (value: number) => void;
  readonly isDisabled?: boolean;
}

export function RangeControl({ id, label, min, max, step, value, displayValue, testId, onChange, isDisabled = false }: RangeControlProps) {
  return (
    <label htmlFor={id} className={`block ${isDisabled ? 'opacity-40' : ''}`}>
      <span className="flex items-center justify-between gap-3">
        <span className={LABEL}>{label}</span>
        <span className="font-editorial text-xs tabular-nums text-[#fff4d4]/75">{displayValue}</span>
      </span>
      <RangeInput
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        aria-label={label}
        className="mt-2.5 rounded-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-4"
        data-testid={testId}
      />
    </label>
  );
}

export function ChipRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div>
      <span className={LABEL}>{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
