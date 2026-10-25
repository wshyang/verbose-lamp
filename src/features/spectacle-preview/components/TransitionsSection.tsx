import { Sparkles, Sun } from 'lucide-react';
import { SPARKLER_DEMOS, SUNBURST_DEMOS } from '../data/previewCatalogue';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { ActionButton, Section } from './PanelBits';

const SCREEN_A_CLASS = 'border-[#8a6a2f]/50 bg-[#171006] text-[#e9c877]';
const SCREEN_B_CLASS = 'border-[#3f6b4f] bg-[#0a1a10] text-[#7fd9a0]';

/** Sparkler and sunburst transitions, plus the A/B screen that swaps under cover. */
export function TransitionsSection({ preview: p }: { preview: SpectaclePreview }) {
  return (
    <Section title="TRANSITIONS">
      <div className="grid grid-cols-2 gap-1.5">
        {SPARKLER_DEMOS.map((demo) => (
          <ActionButton
            key={demo.key}
            label={demo.label}
            icon={Sparkles}
            active={p.playing.has(demo.key)}
            onClick={() => p.playSparkler(demo.key, demo.pattern, demo.direction)}
            testId="spectacle-preview__sparkler"
          />
        ))}
        {SUNBURST_DEMOS.map((demo) => (
          <ActionButton
            key={demo.key}
            label={demo.label}
            icon={Sun}
            active={p.playing.has(demo.key)}
            onClick={() => p.playSunburst(demo.key, demo.variant)}
            testId="spectacle-preview__sunburst"
          />
        ))}
      </div>
      <div
        data-testid="spectacle-preview__demo-screen"
        className={`flex h-12 items-center justify-center border text-[11px] tracking-[0.3em] transition-colors ${
          p.demoScreen === 'A' ? SCREEN_A_CLASS : SCREEN_B_CLASS
        }`}
      >
        SCREEN {p.demoScreen} — SWAPS UNDER COVER
      </div>
    </Section>
  );
}
