import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[#8a6a2f]/30 px-4 py-3 first:border-t-0">
      <h3 className="mb-2 font-display text-[11px] tracking-[0.3em] text-[#d9b264]">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

interface ActionButtonProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId: string;
}

export function ActionButton({ label, icon: Icon, onClick, active, disabled, testId }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`flex items-center gap-2 border px-2.5 py-1.5 text-left text-[11px] tracking-wider transition ${
        active
          ? 'border-[#f2d38a] bg-gradient-to-b from-[#a87c33] to-[#6e4d1c] text-[#fff3d0] shadow-[0_0_12px_rgba(217,178,100,0.4)]'
          : 'border-[#8a6a2f]/50 text-[#d8b878] hover:border-[#d9b264] hover:bg-[#8a6a2f]/15'
      } disabled:opacity-40`}
    >
      <Icon size={13} aria-hidden className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function ToggleRow({ label, checked, onChange, testId }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[11px] tracking-wider text-[#c8a86a]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
        className="h-3.5 w-3.5 accent-[#d9b264]"
      />
    </label>
  );
}

export function SliderRow({ label, value, min, max, step, onChange, testId }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] tracking-wider text-[#c8a86a]">
      <span className="w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        className="w-full accent-[#d9b264]"
      />
      <span className="w-9 shrink-0 text-right text-[#e9c877]">{value.toFixed(2)}</span>
    </label>
  );
}