import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Sliders, Sparkles } from 'lucide-react';
import { isSignatureGenome, type GeneKey } from '../../webgl/frame';
import {
  DESIGN_GALLERY,
  FRAME_STYLES,
  GENE_GROUPS,
  describeDesign,
  designAt,
  findDesignEntry,
} from '../../data/frameGenomeUi';
import {
  FRAME_PRESETS,
  formatIntricacyPercent,
  getIntricacyTier,
} from '../../data/frameIntricacy';
import type { FrameStyleController } from '../../hooks/useFrameStyle';
import { GeneSlider } from './GeneSlider';

interface TitleFramePanelProps {
  controller: FrameStyleController;
}

/** Everything that decorates the five title cards: style, design, density, proportions. */
export const TitleFramePanel: React.FC<TitleFramePanelProps> = ({ controller }) => {
  const { style, designIndex, setFamily, selectDesign, stepDesign, setGene, setIntricacy } = controller;
  const [showFineTune, setShowFineTune] = useState(false);

  const genome = style.genome;
  const activeStyle = FRAME_STYLES.find((option) => option.id === style.family) ?? FRAME_STYLES[0];
  const matchedEntry = designIndex === null ? undefined : designAt(designIndex);
  const designLabel = describeDesign(matchedEntry ?? findDesignEntry(genome), genome);
  const isOriginalDesign = designIndex === 0 || (designIndex === null && isSignatureGenome(genome));
  const inertGenes = new Set<GeneKey>(genome.fractalDepth === 0 ? ['fractalRatio'] : []);
  const percent = formatIntricacyPercent(style.intricacy);
  const tier = getIntricacyTier(style.intricacy);

  return (
    <div className="space-y-5" data-testid="frame-studio__section-title">
      <div>
        <h3 className="text-xs font-deco tracking-[0.26em] uppercase text-[#f8e29b]">Title frame</h3>
        <p className="mt-0.5 text-[11px] font-editorial text-[#d9c7a3]/80">
          The golden frame drawn around each of the five title cards.
        </p>
      </div>

      {/* 1. Style — which ornament vocabulary */}
      <div data-testid="architecture__styles">
        <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80">Style</div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {FRAME_STYLES.map((option) => (
            <button
              key={option.id}
              onClick={() => setFamily(option.id)}
              aria-pressed={style.family === option.id}
              className={`px-2.5 py-2 text-left border transition-colors cursor-pointer ${
                style.family === option.id
                  ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc]'
                  : 'bg-[#0f0b16] border-[#d4af37]/30 text-[#e6d5b2] hover:border-[#f8e29b]/70'
              }`}
              data-testid={`architecture__style-${option.id}`}
            >
              <span className="block text-[11px] tracking-[0.16em] uppercase">{option.label}</span>
              <span className="block text-[9px] tracking-[0.08em] opacity-70">{option.vocabulary}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs font-editorial leading-relaxed text-[#d9c7a3]">
          {activeStyle.description}
        </p>
      </div>

      {/* 2. Design — one gallery, replacing the old preset row and variant explorer */}
      <div data-testid="architecture__design">
        <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80">Design</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            onClick={() => stepDesign(-1)}
            className="p-1.5 border border-[#d4af37]/35 text-[#d4af37] hover:text-[#fff4d4] hover:border-[#f8e29b] cursor-pointer"
            aria-label="Previous design"
            data-testid="architecture__design-prev"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span
            className="flex-1 text-center text-[11px] tracking-[0.16em] uppercase text-[#fff4d4]"
            data-testid="architecture__design-label"
          >
            {designLabel}
            <span className="ml-1.5 opacity-60">
              {designIndex === null ? '' : `of ${DESIGN_GALLERY.length - 1}`}
            </span>
          </span>
          <button
            onClick={() => stepDesign(1)}
            className="p-1.5 border border-[#d4af37]/35 text-[#d4af37] hover:text-[#fff4d4] hover:border-[#f8e29b] cursor-pointer"
            aria-label="Next design"
            data-testid="architecture__design-next"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {isOriginalDesign ? (
          <span
            className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 border border-[#f8e29b]/60 bg-[#f8e29b]/10 text-[10px] tracking-[0.16em] uppercase text-[#fff4d4]"
            data-testid="architecture__signature-badge"
          >
            <Sparkles className="w-3 h-3" />
            Original architecture
          </span>
        ) : (
          <button
            onClick={() => selectDesign(0)}
            className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase text-[#d4af37] hover:text-[#fff4d4] cursor-pointer"
            data-testid="architecture__design-original"
          >
            <RotateCcw className="w-3 h-3" />
            Back to original
          </button>
        )}
      </div>

      {/* 3. Ornament density */}
      <div data-testid="intricacy__panel">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] tracking-[0.22em] uppercase text-[#d4af37]/80">Ornament density</div>
          <span className="text-[11px] font-mono text-[#f5e7c6]">
            {percent} · {tier}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={style.intricacy}
          onChange={(event) => setIntricacy(Number(event.target.value))}
          className="mt-1.5 w-full gatsby-range"
          aria-label="Ornament density"
          aria-valuetext={`${percent}, ${tier}`}
          data-testid="frame-studio__intricacy-slider"
        />
        <div className="mt-1 flex justify-between text-[9px] tracking-[0.14em] uppercase text-[#d4af37]/55">
          <span>Restrained</span>
          <span>Half · original density</span>
          <span>Maximal</span>
        </div>
      </div>

      {/* 4. Fine tune — opt-in */}
      <div>
        <button
          onClick={() => setShowFineTune((open) => !open)}
          aria-expanded={showFineTune}
          className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.22em] uppercase text-[#d4af37] hover:text-[#fff4d4] cursor-pointer"
          data-testid="architecture__fine-tune-toggle"
        >
          <Sliders className="w-3 h-3" />
          {showFineTune ? 'Hide proportions' : 'Fine-tune proportions'}
        </button>
        {showFineTune && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4" data-testid="architecture__fine-tune">
            {GENE_GROUPS.map((group) => (
              <fieldset key={group.id} className="space-y-2.5 border-t border-[#d4af37]/20 pt-2.5">
                <legend className="sr-only">{group.title}</legend>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-deco tracking-[0.22em] uppercase text-[#f8e29b]">
                    {group.title}
                  </span>
                  <span className="text-[9px] tracking-[0.14em] uppercase text-[#d4af37]/55">
                    {group.caption}
                  </span>
                </div>
                {group.genes.map((key) => (
                  <GeneSlider
                    key={key}
                    geneKey={key}
                    value={genome[key]}
                    isInert={inertGenes.has(key)}
                    onChange={setGene}
                  />
                ))}
              </fieldset>
            ))}
            <p className="text-[11px] font-editorial leading-relaxed text-[#d9c7a3]/80 sm:col-span-2">
              Sliders override the selected design and relabel it Custom. Corner and setback changes keep
              the same total inset, so the type always fits.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs font-editorial leading-relaxed text-[#d9c7a3]/90 border-t border-[#d4af37]/20 pt-3">
        {matchedEntry?.label === 'Original'
          ? 'The original frame, exactly as first rendered.'
          : 'Every design is a setting of the same parameters — the original is entry 0 of this gallery.'}
      </p>
      <span className="sr-only" data-testid="architecture__presets">
        {FRAME_PRESETS.length} named designs are in the gallery above
      </span>
    </div>
  );
};
