import React from 'react';
import { RangeInput } from '@/shared/ui';
import type { FrameStudioControlProps } from '../FrameStudioControl';

/** Decorative pattern layers composited over the foundation, each with its own level. */
type LayersSectionProps = Pick<FrameStudioControlProps, 'layers' | 'onLayerToggle' | 'onLayerLevelChange'>;

export const LayersSection: React.FC<LayersSectionProps> = ({ layers, onLayerToggle, onLayerLevelChange }) => {
  return (
          <div className="space-y-1.5">
            <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Pattern layers</div>
            <div className="space-y-1">
              {layers.map((layer) => (
                <div key={layer.source} className="border-b border-[#d4af37]/15 last:border-b-0">
                  <label className="flex items-center gap-2 py-1.5 cursor-pointer" title={layer.blurb}>
                    <input
                      type="checkbox"
                      checked={layer.enabled}
                      onChange={(event) => onLayerToggle(layer.source, event.target.checked)}
                      className="accent-[#d4af37] w-3.5 h-3.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2"
                      aria-label={`Add ${layer.label} layer`}
                      data-testid="frame-studio__layer-toggle"
                    />
                    <span className="flex-1 text-[10px] uppercase tracking-[0.12em] text-[#e6d5b2]">{layer.label}</span>
                  </label>
                  {layer.enabled && (
                    <div className="pl-5 pb-2 space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[8px] tracking-[0.18em] uppercase text-[#d4af37]/75">Layer level</span>
                        <span className="text-[9px] font-mono text-[#f5e7c6]">{layer.level}</span>
                      </div>
                      <RangeInput
                        min={1} max={4} step={1} value={layer.level}
                        onChange={(event) => onLayerLevelChange(layer.source, Number(event.target.value))}
                        className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2"
                        aria-label={`${layer.label} layer level`}
                        data-testid="frame-studio__layer-level"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/75">
              Layers combine with the foundation; their levels stay independent.
            </p>
          </div>
  );
};
