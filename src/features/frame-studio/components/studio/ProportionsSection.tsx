import React from 'react';
import { ChevronDown, ChevronRight, Sliders } from 'lucide-react';
import type { BaseGenome, GeneKey } from '@/features/art-deco-frame';
import { GENE_GROUPS } from '../../data/frameDesigns';
import { GeneSlider } from '../GeneSlider';
import type { FrameStudioControlProps } from '../FrameStudioControl';

/** The gene drawer: every proportion slider, grouped by what it reshapes. */
function inertGenesOf(genome: BaseGenome): Set<GeneKey> {
  return new Set<GeneKey>(genome.fractalDepth === 0 ? ['fractalRatio'] : []);
}

type ProportionsSectionProps = Pick<FrameStudioControlProps, 'proportionsOpen' | 'onProportionsToggle' | 'genome' | 'onGeneChange'>;

export const ProportionsSection: React.FC<ProportionsSectionProps> = ({ proportionsOpen, onProportionsToggle, genome, onGeneChange }) => {
  const inertGenes = inertGenesOf(genome);
  return (
            <div className="border-t border-[#d4af37]/20 pt-2">
              <button
                type="button"
                onClick={() => onProportionsToggle(!proportionsOpen)}
                aria-expanded={proportionsOpen}
                className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase text-[#d4af37] hover:text-[#fff4d4] cursor-pointer"
                data-testid="frame-studio__proportions-toggle"
              >
                {proportionsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Sliders className="w-3 h-3" />
                {proportionsOpen ? 'Hide proportions' : 'Fine-tune proportions'}
              </button>
              {proportionsOpen && (
                <div className="mt-2.5 space-y-3" data-testid="frame-studio__proportions">
                  {GENE_GROUPS.map((group) => (
                    <fieldset key={group.id} className="space-y-2 border-t border-[#d4af37]/20 pt-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] font-deco tracking-[0.2em] uppercase text-[#f8e29b]">{group.title}</span>
                        <span className="text-[8px] uppercase text-[#d4af37]/55">{group.caption}</span>
                      </div>
                      {group.genes.map((key) => (
                        <GeneSlider key={key} geneKey={key} value={genome[key]} isInert={inertGenes.has(key)} onChange={onGeneChange} />
                      ))}
                    </fieldset>
                  ))}
                  <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/80">
                    Sliders override the selected design. Setback changes keep the same total inset, so the type always fits.
                  </p>
                </div>
              )}
            </div>
  );
};
