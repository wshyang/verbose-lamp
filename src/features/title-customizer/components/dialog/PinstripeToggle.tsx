import React from 'react';

/** The alternation flag, spelled out because the visual effect is subtle on screen. */
export const PinstripeToggle: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void }> = ({
  enabled,
  onChange,
}) => (
  <label className="flex items-center gap-3 pt-1 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={enabled}
      onChange={(event) => onChange(event.target.checked)}
      className="accent-[#d4af37] w-4 h-4"
      data-testid="title-customizer__pinstripe"
    />
    <span className="text-xs text-[#e6d6b5]">
      Enable Like Minded Studio Alternating 4-Line Deco Pinstripe Glyphs
    </span>
  </label>
);
