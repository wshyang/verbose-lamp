import { Crown, PartyPopper, Timer } from 'lucide-react';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { ActionButton, Section, ToggleRow } from './PanelBits';

/** Confetti, countdown, name reveal and the marquee bulb border toggle. */
export function CelebrationSection({ preview: p }: { preview: SpectaclePreview }) {
  return (
    <Section title="CELEBRATION">
      <div className="grid grid-cols-2 gap-1.5">
        <ActionButton label="Confetti burst" icon={PartyPopper} onClick={() => p.playConfetti('burst')} testId="spectacle-preview__confetti" />
        <ActionButton label="Confetti rain" icon={PartyPopper} onClick={() => p.playConfetti('rain')} testId="spectacle-preview__confetti" />
        <ActionButton label="Countdown 5→0" icon={Timer} active={p.playing.has('countdown')} onClick={p.playCountdown} testId="spectacle-preview__countdown" />
        <ActionButton label="Name reveal" icon={Crown} active={p.playing.has('name-reveal')} onClick={p.playNameReveal} testId="spectacle-preview__name-reveal" />
      </div>
      <ToggleRow label="Marquee bulb border" checked={p.marqueeOn} onChange={p.setMarqueeOn} testId="spectacle-preview__marquee" />
    </Section>
  );
}
