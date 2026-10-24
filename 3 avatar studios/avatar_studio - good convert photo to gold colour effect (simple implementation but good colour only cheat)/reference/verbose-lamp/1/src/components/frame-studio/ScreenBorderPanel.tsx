import React from 'react';

interface ScreenBorderPanelProps {
  enabled: boolean;
  weight: number;
  railCount: number | null;
  onEnabledChange: (enabled: boolean) => void;
  onWeightChange: (weight: number) => void;
}

/** The poster's printed edge border, drawn at the viewport edge. */
export const ScreenBorderPanel: React.FC<ScreenBorderPanelProps> = ({
  enabled,
  weight,
  railCount,
  onEnabledChange,
  onWeightChange,
}) => (
  <div className="space-y-4" data-testid="frame-studio__section-border">
    <div>
      <h3 className="text-xs font-deco tracking-[0.26em] uppercase text-[#f8e29b]">Screen border</h3>
      <p className="mt-0.5 text-[11px] font-editorial text-[#d9c7a3]/80">
        The printed border of the one-sheet, drawn around the edge of the picture. It stays fixed while
        the camera flies, so it belongs to no title card.
      </p>
    </div>

    <label className="flex items-center justify-between gap-3 cursor-pointer" data-testid="border__row">
      <span className="text-[11px] tracking-[0.16em] uppercase text-[#e6d5b2]">Show border</span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onEnabledChange(event.target.checked)}
        className="accent-[#d4af37] w-4 h-4 cursor-pointer"
        aria-label="Show screen border"
        data-testid="border__enable"
      />
    </label>

    <div className={enabled ? '' : 'opacity-40'} data-testid="border__controls">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80">Border weight</span>
        <span className="text-[11px] font-mono text-[#f5e7c6]">{Math.round(weight * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={weight}
        disabled={!enabled}
        onChange={(event) => onWeightChange(Number(event.target.value))}
        className="mt-1.5 w-full gatsby-range disabled:cursor-not-allowed"
        aria-label="Border weight"
        data-testid="border__weight"
      />
      <div className="mt-1 flex justify-between text-[9px] tracking-[0.14em] uppercase text-[#d4af37]/55">
        <span>Single rule</span>
        <span>Fans, reeding, four rules</span>
      </div>
      <p className="mt-2 text-[11px] font-editorial leading-relaxed text-[#d9c7a3]/80">
        Nested stepped rules, a quarter-circle fan in each corner, and reeded ticks along the straight
        runs. Weight adds rules and reeding; the proportions sliders under the title frame also reshape it.
        {railCount !== null ? ` Currently ${railCount.toLocaleString('en-US')} rails.` : ''}
      </p>
    </div>
  </div>
);
