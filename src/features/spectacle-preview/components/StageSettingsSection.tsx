import { Crosshair, Shuffle, Square } from 'lucide-react';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { ActionButton, Section, SliderRow, ToggleRow } from './PanelBits';
import { DEFAULT_SEED } from '@/shared/lib/random';

function originLabel(p: SpectaclePreview): string {
  return p.picking ? 'Click the stage…' : `Origin ${p.origin.x.toFixed(2)} · ${p.origin.y.toFixed(2)}`;
}

/** Origin picking, intensity, seed, keep-clear box, reduced motion, stop-all. */
export function StageSettingsSection({ preview: p }: { preview: SpectaclePreview }) {
  return (
    <Section title="STAGE SETTINGS">
      <ActionButton
        label={originLabel(p)}
        icon={Crosshair}
        active={p.picking}
        onClick={() => p.setPicking(!p.picking)}
        testId="spectacle-preview__pick-origin"
      />
      <SliderRow label="Intensity" value={p.intensity} min={0} max={1} step={0.05} onChange={p.setIntensity} testId="spectacle-preview__intensity" />
      <div className="flex items-center justify-between gap-2 text-[11px] tracking-wider text-[#c8a86a]">
        <span className="w-20 shrink-0">Seed</span>
        <input
          type="number"
          value={p.seed}
          onChange={(e) => p.setSeed(Number(e.target.value) || DEFAULT_SEED)}
          data-testid="spectacle-preview__seed"
          className="w-full border border-[#8a6a2f]/40 bg-[#171006] px-2 py-1 text-[#e9c877] outline-none"
        />
        <button type="button" onClick={p.rerollSeed} data-testid="spectacle-preview__reroll" aria-label="Reroll seed" className="border border-[#8a6a2f]/50 p-1.5 text-[#d8b878] transition hover:bg-[#8a6a2f]/20">
          <Shuffle size={12} />
        </button>
      </div>
      <ToggleRow label="Keep-clear speaker box" checked={p.keepClearOn} onChange={p.setKeepClearOn} testId="spectacle-preview__keep-clear" />
      <ToggleRow label="Simulate reduced motion" checked={p.simulatedReducedMotion} onChange={p.setSimulatedReducedMotion} testId="spectacle-preview__reduced-motion" />
      <ActionButton label="Stop all effects" icon={Square} onClick={p.stopAll} testId="spectacle-preview__stop-all" />
    </Section>
  );
}
