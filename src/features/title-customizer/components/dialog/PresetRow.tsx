import React from 'react';
import type { HeroTitleConfig } from '@/features/premiere/model/types';
import { Button } from '@/shared/ui';
import { HERO_TITLE_PRESETS } from '../../data/titlePresets';

/** The archival presets: one click replaces the whole draft. */
export const PresetRow: React.FC<{ onPick: (preset: HeroTitleConfig) => void }> = ({ onPick }) => (
  <div className="mb-5">
    <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80 mb-2">
      Fitzgerald & Archival Presets
    </div>
    <div className="flex flex-wrap gap-1.5">
      {HERO_TITLE_PRESETS.map((preset) => (
        <Button
          key={preset.id}
          type="button"
          onClick={() => onPick(preset.config)}
          size="small"
          className="border-[#d4af37]/30 bg-[#120e18] text-[#e5d2ab] hover:border-[#f8e29b] hover:text-[#fff6dc]"
          data-testid="title-customizer__preset"
        >
          {preset.name}
        </Button>
      ))}
    </div>
  </div>
);
