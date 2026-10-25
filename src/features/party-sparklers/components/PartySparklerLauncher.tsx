import { Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui';
import type { PartySparklers } from '../hooks/usePartySparklers';
import { PartySparklerOverlay } from './PartySparklerOverlay';

/**
 * The button and its small overlay, in one component so a host needs a single
 * line. Both are inert without a `SpectacleProvider` above them.
 */
export function PartySparklerLauncher({ sparklers }: { sparklers: PartySparklers }) {
  return (
    <div className="relative">
      <Button
        type="button"
        onClick={sparklers.toggle}
        variant={sparklers.isOpen ? 'selected' : 'panel'}
        aria-expanded={sparklers.isOpen}
        title="Light party sparklers over the scene"
        data-testid="party-sparklers__launch"
      >
        <Sparkles className="h-3.5 w-3.5 text-[#f8e29b]" aria-hidden />
        <span className="hidden sm:inline">Sparklers</span>
      </Button>
      {sparklers.isOpen ? <PartySparklerOverlay sparklers={sparklers} /> : null}
    </div>
  );
}
