import { Sparkles, X } from 'lucide-react';
import { Button, IconButton } from '@/shared/ui';
import type { CelebrationGroupView } from '../model/celebrationActions';
import { useCelebrationOverlay, type CelebrationOverlay } from '../hooks/useCelebrationOverlay';

function GroupSection({ group, overlay }: { group: CelebrationGroupView; overlay: CelebrationOverlay }) {
  return (
    <section aria-label={group.heading}>
      <h3 className="mb-1.5 text-[9px] uppercase tracking-[0.28em] text-[#d4af37]/80">
        {group.heading}
      </h3>
      <div className="grid grid-cols-2 gap-1.5">
        {group.actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            size="small"
            variant={action.isActive ? 'selected' : 'panel'}
            aria-pressed={action.isToggle ? action.isActive : undefined}
            disabled={!overlay.isReady}
            onClick={() => overlay.runAction(action.id)}
            data-testid="celebration-overlay__action"
          >
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

function CelebrationPanel({ overlay }: { overlay: CelebrationOverlay }) {
  if (!overlay.isOpen) return null;
  return (
    <div
      role="group"
      aria-label="Celebration effects"
      data-testid="celebration-overlay__panel"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 max-w-[90vw] border border-[#d4af37]/45 bg-[#09070c]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.8)] backdrop-blur-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-[#d4af37]/25 pb-2.5">
        <div>
          <div className="font-deco text-[11px] tracking-[0.24em] text-[#fff4d4]">CELEBRATE</div>
          <p className="mt-0.5 font-editorial text-[11px] text-[#e0cfa9]/75">
            Sparklers and spectacle, over the premiere.
          </p>
        </div>
        <IconButton
          onClick={overlay.close}
          label="Close celebration effects"
          icon={<X className="h-3.5 w-3.5" />}
          data-testid="celebration-overlay__close"
        />
      </div>
      <div className="space-y-3.5">
        {overlay.groups.map((group) => (
          <GroupSection key={group.id} group={group} overlay={overlay} />
        ))}
      </div>
      <div className="mt-3.5 border-t border-[#d4af37]/25 pt-2.5">
        <Button
          type="button"
          size="small"
          variant="quiet"
          onClick={overlay.stopEverything}
          data-testid="celebration-overlay__stop-all"
        >
          Stop all effects
        </Button>
      </div>
    </div>
  );
}

/**
 * Header entry point for the celebration overlay: one button, one small
 * non-modal panel. Self-contained like the other launchers, so the host
 * wires it with a single element. Must sit inside a SpectacleProvider.
 */
export function CelebrationLauncher() {
  const overlay = useCelebrationOverlay();
  return (
    <div className="relative">
      <Button
        type="button"
        onClick={overlay.toggleOpen}
        variant={overlay.isOpen ? 'selected' : 'panel'}
        aria-expanded={overlay.isOpen}
        aria-haspopup="true"
        title="Play sparklers and celebration effects over the premiere"
        data-testid="celebration-overlay__launch"
      >
        <Sparkles className="h-3.5 w-3.5 text-[#f8e29b]" />
        <span className="hidden sm:inline">Celebrate</span>
        <span className="sm:hidden">Party</span>
      </Button>
      <CelebrationPanel overlay={overlay} />
    </div>
  );
}
