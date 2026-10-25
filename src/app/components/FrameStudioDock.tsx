import { Layers } from 'lucide-react';
import { FrameStudioControl, type FrameStudioController } from '@/features/frame-studio';
import { Button } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

interface FrameStudioDockProps {
  studio: FrameStudioController;
  hudHidden: boolean;
}

/**
 * The chip that brings a collapsed panel back.
 *
 * On a phone the header wraps to three rows (220 px), so the old `top-28` put this
 * button on top of the QR and sparkler launchers. It sits below the header on narrow
 * screens and returns to the stage edge from `sm` up (ADDENDUM-044).
 */
function RevealButton({ onReveal }: { onReveal: () => void }) {
  return (
    <Button
      onClick={onReveal}
      className="absolute right-3 top-60 z-20 sm:right-9 sm:top-28"
      title="Reopen Frame Studio (F)"
      aria-label="Reopen Frame Studio"
      data-testid="frame-studio__reveal"
    >
      <Layers className="h-3.5 w-3.5 text-[#f8e29b]" />
      <span>Frame Studio</span>
    </Button>
  );
}

export function FrameStudioDock({ studio, hudHidden }: FrameStudioDockProps) {
  const visibilityClass = hudHidden ? 'opacity-0 pointer-events-none' : 'opacity-100';

  return (
    <div className={cn('relative z-[70] transition-all duration-300', visibilityClass)}>
      {studio.isOpen ? (
        <FrameStudioControl
          isOpen
          surface={studio.surface}
          patterns={studio.patterns}
          baseSource={studio.baseSource}
          layers={studio.layers}
          designGallery={studio.designGallery}
          activeDesignIndex={studio.activeDesignIndex}
          designLabel={studio.designLabel}
          level={studio.level}
          detailPercent={studio.detailPercent}
          detailPresets={studio.detailPresets}
          activePreset={studio.activePreset}
          isDesignPattern={studio.isDesignPattern}
          proportionsOpen={studio.proportionsOpen}
          genome={studio.genome}
          borderEnabled={studio.borderEnabled}
          borderWeight={studio.borderWeight}
          onSurfaceChange={studio.setSurface}
          onPatternChange={studio.selectPattern}
          onLayerToggle={studio.setLayerEnabled}
          onLayerLevelChange={studio.setLayerLevel}
          onDesignChange={studio.selectDesign}
          onLevelChange={studio.setLevel}
          onDetailChange={studio.setDetail}
          onProportionsToggle={studio.setProportionsOpen}
          onGeneChange={studio.setGene}
          onBorderEnabledChange={studio.setBorderEnabled}
          onBorderWeightChange={studio.setBorderWeight}
          onReset={studio.resetAll}
          onDismiss={studio.dismiss}
        />
      ) : (
        <RevealButton onReveal={studio.reveal} />
      )}
    </div>
  );
}