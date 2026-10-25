import { X } from 'lucide-react';
import { Button } from '@/shared/ui';
import type { PartySparklers } from '../hooks/usePartySparklers';
import { SPARKLER_LIMITS } from '../model/sparklerSettings';

interface OverlayProps {
  sparklers: PartySparklers;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  testId: string;
}

function SliderRow({ label, value, min, max, step, suffix = '', onChange, testId }: SliderRowProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between text-[9px] uppercase tracking-[0.18em] text-[#d4af37]/80">
        <span>{label}</span>
        <span className="font-mono text-[10px] text-[#f5e7c6]" data-testid={`${testId}-readout`}>
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        data-testid={testId}
        className="accent-[#d4af37] cursor-pointer"
      />
    </label>
  );
}

/** Small, non-modal: the scene stays visible while you set the fan up. */
export function PartySparklerOverlay({ sparklers }: OverlayProps) {
  const { settings, updateSettings } = sparklers;
  return (
    <div
      className="absolute right-0 top-11 z-[65] w-[min(17rem,calc(100vw-1.5rem))] border border-[#d4af37]/45 bg-[#09070d]/95 px-3.5 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur-md"
      data-testid="party-sparklers__overlay"
      role="group"
      aria-label="Party sparklers"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-[10px] tracking-[0.3em] text-[#f2d38a]">PARTY SPARKLERS</h2>
        <button
          type="button"
          onClick={sparklers.close}
          aria-label="Close sparkler settings"
          data-testid="party-sparklers__close"
          className="text-[#c8a86a] transition hover:text-[#f2d38a]"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2.5">
        <SliderRow
          label="Sticks"
          value={settings.count}
          min={SPARKLER_LIMITS.count.min}
          max={SPARKLER_LIMITS.count.max}
          step={1}
          onChange={(count) => updateSettings({ count })}
          testId="party-sparklers__count"
        />
        <SliderRow
          label="Burn"
          value={settings.durationSec}
          min={SPARKLER_LIMITS.durationSec.min}
          max={SPARKLER_LIMITS.durationSec.max}
          step={0.2}
          suffix="s"
          onChange={(durationSec) => updateSettings({ durationSec })}
          testId="party-sparklers__duration"
        />
        <SliderRow
          label="Fan width"
          value={settings.spread}
          min={SPARKLER_LIMITS.spread.min}
          max={SPARKLER_LIMITS.spread.max}
          step={0.01}
          onChange={(spread) => updateSettings({ spread })}
          testId="party-sparklers__spread"
        />
        <Button
          type="button"
          variant="accent"
          size="control"
          className="w-full"
          onClick={() => sparklers.light()}
          data-testid="party-sparklers__light"
        >
          Light sparklers
        </Button>
      </div>
    </div>
  );
}
