import '../spectaclePreview.css';
import {
  Crosshair, Crown, Dices, Flame, Lightbulb, Orbit, PartyPopper, Shuffle,
  Sparkles, Square, Sun, Timer, Wine, X,
} from 'lucide-react';
import { ORB_DEMOS, SUNBURST_DEMOS } from '../data/previewCatalogue';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { ActionButton, Section, SliderRow, ToggleRow } from './PanelBits';
import { GoldUiSection, LatticeSection } from './PanelExtras';

interface PanelProps {
  preview: SpectaclePreview;
  onOpenDraw: () => void;
}

/** Small docked, non-modal panel — the effect stays visible while you drive it. */
export function SpectaclePreviewPanel({ preview, onOpenDraw }: PanelProps) {
  if (!preview.open) return null;
  const p = preview;
  return (
    <aside
      data-testid="spectacle-preview__panel"
      className="spectacle-preview__panel fixed bottom-24 right-3 top-16 z-[60] w-[min(320px,92vw)] overflow-y-auto border border-[#8a6a2f]/50 bg-[#0d0904]/95 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-sm"
    >
      <header className="flex items-center justify-between border-b border-[#8a6a2f]/40 px-4 py-3">
        <h2 className="font-display text-xs tracking-[0.3em] text-[#f2d38a]">SPECTACLE</h2>
        <div className="flex items-center gap-2">
          <span
            data-testid="spectacle-preview__quality"
            className="border border-[#8a6a2f]/50 px-1.5 py-0.5 text-[9px] tracking-widest text-[#c8a86a]"
          >
            {p.qualityTier?.toUpperCase() ?? '—'} TIER
          </span>
          <button type="button" onClick={() => p.setOpen(false)} data-testid="spectacle-preview__close" aria-label="Close spectacle panel" className="text-[#c8a86a] transition hover:text-[#f2d38a]">
            <X size={15} />
          </button>
        </div>
      </header>

      <Section title="BACKDROP">
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton label="Fireworks" icon={Sparkles} active={p.playing.has('fireworks')} onClick={p.toggleFireworks} testId="spectacle-preview__fireworks" />
          <ActionButton label="Grand finale" icon={Flame} active={p.playing.has('finale')} onClick={p.playFinale} testId="spectacle-preview__finale" />
          <ActionButton label="Searchlights" icon={Lightbulb} active={p.playing.has('searchlights')} onClick={p.toggleSearchlights} testId="spectacle-preview__searchlights" />
          <ActionButton label="Champagne" icon={Wine} active={p.playing.has('champagne')} onClick={p.toggleChampagne} testId="spectacle-preview__champagne" />
        </div>
      </Section>

      <Section title="TRANSITIONS">
        <div className="grid grid-cols-2 gap-1.5">
          {ORB_DEMOS.map((demo) => (
            <ActionButton
              key={demo.key}
              label={demo.label}
              icon={Orbit}
              active={p.playing.has(demo.key)}
              onClick={() => p.playOrb(demo.key, demo.pattern, demo.direction)}
              testId="spectacle-preview__orb"
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
            p.demoScreen === 'A'
              ? 'border-[#8a6a2f]/50 bg-[#171006] text-[#e9c877]'
              : 'border-[#3f6b4f] bg-[#0a1a10] text-[#7fd9a0]'
          }`}
        >
          SCREEN {p.demoScreen} — SWAPS UNDER COVER
        </div>
      </Section>

      <Section title="CELEBRATION">
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton label="Confetti burst" icon={PartyPopper} onClick={() => p.playConfetti('burst')} testId="spectacle-preview__confetti" />
          <ActionButton label="Confetti rain" icon={PartyPopper} onClick={() => p.playConfetti('rain')} testId="spectacle-preview__confetti" />
          <ActionButton label="Countdown 5→0" icon={Timer} active={p.playing.has('countdown')} onClick={p.playCountdown} testId="spectacle-preview__countdown" />
          <ActionButton label="Name reveal" icon={Crown} active={p.playing.has('name-reveal')} onClick={p.playNameReveal} testId="spectacle-preview__name-reveal" />
        </div>
        <ToggleRow label="Marquee bulb border" checked={p.marqueeOn} onChange={p.setMarqueeOn} testId="spectacle-preview__marquee" />
      </Section>

      <Section title="LUCKY DRAW">
        <ActionButton label="Open the drum · fair pick, 2–300 guests" icon={Dices} onClick={onOpenDraw} testId="spectacle-preview__lucky-draw" />
      </Section>

      <Section title="STAGE SETTINGS">
        <ActionButton
          label={p.picking ? 'Click the stage…' : `Origin ${p.origin.x.toFixed(2)} · ${p.origin.y.toFixed(2)}`}
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
            onChange={(e) => p.setSeed(Number(e.target.value) || 1925)}
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

      <GoldUiSection preview={p} />
      <LatticeSection preview={p} />
    </aside>
  );
}