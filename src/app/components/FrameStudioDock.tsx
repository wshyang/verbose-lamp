import { Layers } from 'lucide-react';
import { FrameStudioControl, type FrameStudioController } from '@/features/frame-studio';
import { Button } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';

interface FrameStudioDockProps {
  studio: FrameStudioController;
  hudHidden: boolean;
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
          isLatticePattern={studio.isLatticePattern}
          latticeSeed={studio.latticeSeed}
          proportionsOpen={studio.proportionsOpen}
          genome={studio.genome}
          borderEnabled={studio.borderEnabled}
          borderWeight={studio.borderWeight}
          borderPattern={studio.borderPattern}
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
          onBorderPatternChange={studio.setBorderPattern}
          onRerollSeed={studio.rerollSeed}
          onReset={studio.resetAll}
          onDismiss={studio.dismiss}
        />
      ) : (
        <Button
          onClick={studio.reveal}
          className="absolute right-6 top-48 z-20 sm:right-9 sm:top-28"
          title="Reopen Frame Studio (F)"
          aria-label="Reopen Frame Studio"
          data-testid="frame-studio__reveal"
        >
          <Layers className="h-3.5 w-3.5 text-[#f8e29b]" />
          <span>Frame Studio</span>
        </Button>
      )}
    </div>
  );
}