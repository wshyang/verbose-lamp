import React from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Sliders, X } from 'lucide-react';
import {
  FrameSource,
  FrameSourceInfo,
  FrameSurface,
  IntricacyPreset,
} from '../webgl/frameGrammar';
import { GENE_GROUPS } from '../data/frameDesigns';
import type { GeneKey } from '../webgl/frameGrammar/genome';
import { GeneSlider } from './frame-studio/GeneSlider';

interface FrameStudioControlProps {
  isOpen: boolean;
  surface: FrameSurface;
  patterns: readonly FrameSourceInfo[];
  designGallery: readonly { index: number; label: string; kind: string }[];
  activeDesignIndex: number | null;
  designLabel: string;
  level: number;
  detailPercent: number;
  detailPresets: readonly IntricacyPreset[];
  activePreset: IntricacyPreset | null;
  isDesignPattern: boolean;
  proportionsOpen: boolean;
  genome: Record<GeneKey, number>;
  borderEnabled: boolean;
  borderWeight: number;
  onSurfaceChange: (surface: FrameSurface) => void;
  onPatternChange: (source: FrameSource) => void;
  onDesignChange: (index: number) => void;
  onLevelChange: (level: number) => void;
  onDetailChange: (percent: number) => void;
  onProportionsToggle: (open: boolean) => void;
  onGeneChange: (key: GeneKey, value: number) => void;
  onBorderEnabledChange: (enabled: boolean) => void;
  onBorderWeightChange: (weight: number) => void;
  onReset: () => void;
  onDismiss: () => void;
}

const chip = (active: boolean) =>
  `cursor-pointer border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-1 ${
    active
      ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc]'
      : 'border-[#d4af37]/25 bg-[#0f0b16] text-[#d4af37]/80 hover:border-[#f8e29b]/70 hover:text-[#f5e7c6]'
  }`;

export const FrameStudioControl: React.FC<FrameStudioControlProps> = (props) => {
  if (!props.isOpen) return null;
  const isTitle = props.surface === 'title-cards';
  const inertGenes = new Set<GeneKey>(props.genome.fractalDepth === 0 ? ['fractalRatio'] : []);
  const detailReadout = props.activePreset
    ? props.activePreset.id === 'baseline'
      ? 'Balanced'
      : props.activePreset.label
    : `${props.detailPercent}%`;

  return (
    <section
      className="absolute right-6 sm:right-9 top-28 z-20 w-[19rem] max-h-[calc(100dvh-11rem)] overflow-y-auto deco-scroll flex flex-col gap-3 px-3.5 py-3 bg-[#09070d]/93 border border-[#d4af37]/45 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.62)]"
      data-testid="frame-studio__panel"
      aria-label="Frame Studio"
    >
      <header className="flex items-center gap-2 border-b border-[#d4af37]/25 pb-2">
        <span className="flex-1 text-[11px] tracking-[0.24em] uppercase text-[#f8e29b]">Frame Studio</span>
        <button
          type="button"
          onClick={props.onReset}
          className="p-1.5 border border-[#d4af37]/30 text-[#d4af37] hover:text-[#fff4d4] hover:border-[#f8e29b] cursor-pointer"
          title="Reset to original"
          aria-label="Reset frame studio to original"
          data-testid="frame-studio__reset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={props.onDismiss}
          className="p-1.5 border border-[#d4af37]/30 text-[#d4af37] hover:text-[#fff4d4] hover:border-[#f8e29b] cursor-pointer"
          aria-label="Dismiss Frame Studio (F to reopen)"
          data-testid="frame-studio__dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Frame surface">
        <button type="button" onClick={() => props.onSurfaceChange('title-cards')} aria-pressed={isTitle} className={`px-2 py-1.5 text-[10px] tracking-[0.12em] uppercase ${chip(isTitle)}`} data-testid="frame-studio__surface-sequence">
          Title cards
        </button>
        <button type="button" onClick={() => props.onSurfaceChange('screen-border')} aria-pressed={!isTitle} className={`px-2 py-1.5 text-[10px] tracking-[0.12em] uppercase ${chip(!isTitle)}`} data-testid="frame-studio__surface-border">
          Screen border
        </button>
      </div>

      {isTitle ? (
        <>
          <div className="space-y-1.5">
            <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Pattern</div>
            <div className="grid grid-cols-2 gap-1" role="group" aria-label="Title-card pattern">
              {props.patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  type="button"
                  onClick={() => props.onPatternChange(pattern.id)}
                  aria-pressed={false}
                  title={pattern.blurb}
                  className={`px-2 py-1.5 text-[9px] tracking-[0.12em] uppercase ${chip(false)}`}
                  data-testid="frame-studio__pattern"
                >
                  {pattern.label}
                </button>
              ))}
            </div>
          </div>

          {props.isDesignPattern && (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Design</div>
                <span className="text-[9px] uppercase text-[#f8e29b]" data-testid="frame-studio__design-label">
                  {props.designLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1" role="group" aria-label="Design gallery">
                {props.designGallery.map((entry) => (
                  <button
                    key={entry.index}
                    type="button"
                    onClick={() => props.onDesignChange(entry.index)}
                    aria-pressed={props.activeDesignIndex === entry.index}
                    title={entry.label}
                    className={`px-1 py-1 text-[8px] tracking-[0.06em] uppercase ${chip(props.activeDesignIndex === entry.index)}`}
                    data-testid="frame-studio__design"
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Level</span>
              <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__level-readout">{props.level}</span>
            </div>
            <input
              id="frame-studio-level"
              type="range" min={1} max={4} step={1} value={props.level}
              onChange={(e) => props.onLevelChange(Number(e.target.value))}
              className="w-full gatsby-range" aria-label="Pattern level, 1 to 4"
              data-testid="frame-studio__level"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Detail</span>
              <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__detail-readout">{detailReadout}</span>
            </div>
            <input
              id="frame-studio-detail"
              type="range" min={0} max={100} step={5} value={props.detailPercent}
              onChange={(e) => props.onDetailChange(Number(e.target.value))}
              className="w-full gatsby-range" aria-label="Ornament detail, 50 is balanced"
              data-testid="frame-studio__detail"
            />
            <div className="flex justify-between">
              {props.detailPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => props.onDetailChange(Math.round(preset.value * 100))}
                  aria-pressed={props.activePreset?.id === preset.id}
                  className={`px-1 py-0.5 text-[8px] uppercase ${chip(props.activePreset?.id === preset.id)}`}
                  data-testid="frame-studio__detail-preset"
                >
                  {preset.id === 'baseline' ? 'Balanced' : preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#d4af37]/20 pt-2">
            <button
              type="button"
              onClick={() => props.onProportionsToggle(!props.proportionsOpen)}
              aria-expanded={props.proportionsOpen}
              className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] uppercase text-[#d4af37] hover:text-[#fff4d4] cursor-pointer"
              data-testid="frame-studio__proportions-toggle"
            >
              {props.proportionsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Sliders className="w-3 h-3" />
              {props.proportionsOpen ? 'Hide proportions' : 'Fine-tune proportions'}
            </button>
            {props.proportionsOpen && (
              <div className="mt-2.5 space-y-3" data-testid="frame-studio__proportions">
                {GENE_GROUPS.map((group) => (
                  <fieldset key={group.id} className="space-y-2 border-t border-[#d4af37]/20 pt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] font-deco tracking-[0.2em] uppercase text-[#f8e29b]">{group.title}</span>
                      <span className="text-[8px] uppercase text-[#d4af37]/55">{group.caption}</span>
                    </div>
                    {group.genes.map((key) => (
                      <GeneSlider key={key} geneKey={key} value={props.genome[key]} isInert={inertGenes.has(key)} onChange={props.onGeneChange} />
                    ))}
                  </fieldset>
                ))}
                <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/80">
                  Sliders override the selected design. Setback changes keep the same total inset, so the type always fits.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/80" data-testid="frame-studio__border-blurb">
            The printed border of the one-sheet, drawn around the edge of the picture. It stays fixed while the camera flies.
          </p>
          <label className="flex items-center justify-between gap-3 cursor-pointer" data-testid="frame-studio__border-row">
            <span className="text-[11px] tracking-[0.16em] uppercase text-[#e6d5b2]">Show border</span>
            <input
              type="checkbox" checked={props.borderEnabled}
              onChange={(e) => props.onBorderEnabledChange(e.target.checked)}
              className="accent-[#d4af37] w-4 h-4 cursor-pointer" aria-label="Show screen border"
              data-testid="frame-studio__border-enable"
            />
          </label>
          <div className={props.borderEnabled ? 'space-y-1' : 'space-y-1 opacity-40'}>
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Border weight</span>
              <span className="text-[10px] font-mono text-[#f5e7c6]" data-testid="frame-studio__border-weight-readout">{props.borderWeight}%</span>
            </div>
            <input
              id="frame-studio-border-weight"
              type="range" min={0} max={100} step={5} value={props.borderWeight}
              disabled={!props.borderEnabled}
              onChange={(e) => props.onBorderWeightChange(Number(e.target.value))}
              className="w-full gatsby-range disabled:cursor-not-allowed" aria-label="Border weight"
              data-testid="frame-studio__border-weight"
            />
            <p className="text-[10px] font-editorial leading-snug text-[#d9c7a3]/70">
              Weight adds nested rules and reeding. The proportions sliders under the title frame reshape it too.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
