import '../spectaclePreview.css';
import { Dices, X } from 'lucide-react';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { BackdropSection } from './BackdropSection';
import { CelebrationSection } from './CelebrationSection';
import { ActionButton, Section } from './PanelBits';
import { GoldUiSection, LatticeSection } from './PanelExtras';
import { StageSettingsSection } from './StageSettingsSection';
import { TransitionsSection } from './TransitionsSection';

interface PanelProps {
  preview: SpectaclePreview;
  onOpenDraw: () => void;
  placement?: 'left' | 'right';
}

function PanelHeader({ preview: p }: { preview: SpectaclePreview }) {
  return (
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
  );
}

/** Small docked, non-modal panel — the effect stays visible while you drive it. */
export function SpectaclePreviewPanel({ preview, onOpenDraw, placement = 'right' }: PanelProps) {
  if (!preview.open) return null;
  const placementClass = placement === 'left' ? 'left-3' : 'right-3';
  return (
    <aside
      data-testid="spectacle-preview__panel"
      className={`spectacle-preview__panel fixed bottom-24 ${placementClass} top-16 z-[80] w-[min(320px,92vw)] overflow-y-auto border border-[#8a6a2f]/50 bg-[#0d0904]/95 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-sm`}
    >
      <PanelHeader preview={preview} />
      <BackdropSection preview={preview} />
      <TransitionsSection preview={preview} />
      <CelebrationSection preview={preview} />
      <Section title="LUCKY DRAW">
        <ActionButton label="Open the drum · fair pick, 2–300 guests" icon={Dices} onClick={onOpenDraw} testId="spectacle-preview__lucky-draw" />
      </Section>
      <StageSettingsSection preview={preview} />
      <GoldUiSection preview={preview} />
      <LatticeSection preview={preview} />
    </aside>
  );
}
