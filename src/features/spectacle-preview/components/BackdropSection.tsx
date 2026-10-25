import { Flame, Lightbulb, Sparkles, Wine } from 'lucide-react';
import type { SpectaclePreview } from '../hooks/useSpectaclePreview';
import { ActionButton, Section } from './PanelBits';

/** Ambient backdrop effects: fireworks, finale, searchlights, champagne. */
export function BackdropSection({ preview: p }: { preview: SpectaclePreview }) {
  return (
    <Section title="BACKDROP">
      <div className="grid grid-cols-2 gap-1.5">
        <ActionButton label="Fireworks" icon={Sparkles} active={p.playing.has('fireworks')} onClick={p.toggleFireworks} testId="spectacle-preview__fireworks" />
        <ActionButton label="Grand finale" icon={Flame} active={p.playing.has('finale')} onClick={p.playFinale} testId="spectacle-preview__finale" />
        <ActionButton label="Searchlights" icon={Lightbulb} active={p.playing.has('searchlights')} onClick={p.toggleSearchlights} testId="spectacle-preview__searchlights" />
        <ActionButton label="Champagne" icon={Wine} active={p.playing.has('champagne')} onClick={p.toggleChampagne} testId="spectacle-preview__champagne" />
      </div>
    </Section>
  );
}
