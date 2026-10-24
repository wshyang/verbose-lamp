import React from 'react';
import { Eye, EyeOff, Layers } from 'lucide-react';
import {
  FrameSource,
  FrameSourceInfo,
  FrameSurface,
  IntricacyPreset,
} from '../webgl/frameGrammar';

interface FrameStudioControlProps {
  surface: FrameSurface;
  sources: readonly FrameSourceInfo[];
  activeSource: FrameSourceInfo;
  level: number;
  detailPercent: number;
  detailPresets: readonly IntricacyPreset[];
  activePreset: IntricacyPreset | null;
  isFixedPattern: boolean;
  posterEnabled: boolean;
  onSurfaceChange: (surface: FrameSurface) => void;
  onPatternChange: (source: FrameSource) => void;
  onLevelChange: (level: number) => void;
  onDetailChange: (percent: number) => void;
  onPresetSelect: (preset: IntricacyPreset) => void;
  onPosterVisibilityChange: (enabled: boolean) => void;
}

interface SurfacePickerProps {
  surface: FrameSurface;
  posterEnabled: boolean;
  onChange: (surface: FrameSurface) => void;
}

interface PatternPickerProps {
  sources: readonly FrameSourceInfo[];
  activeSource: FrameSourceInfo;
  onChange: (source: FrameSource) => void;
}

interface LevelControlProps {
  level: number;
  readout: string;
  disabled: boolean;
  onChange: (level: number) => void;
}

interface DetailControlProps {
  percent: number;
  readout: string;
  presets: readonly IntricacyPreset[];
  activePreset: IntricacyPreset | null;
  onChange: (percent: number) => void;
  onPreset: (preset: IntricacyPreset) => void;
}

function SurfacePicker({ surface, posterEnabled, onChange }: SurfacePickerProps) {
  const isSequence = surface === 'title-cards';
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Edit surface</div>
      <div className="grid grid-cols-2 gap-1" role="group" aria-label="Frame surface">
        <button
          type="button"
          onClick={() => onChange('title-cards')}
          className={`px-2 py-1.5 text-[10px] tracking-[0.12em] uppercase border transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-1 ${
            isSequence ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc]' : 'border-[#d4af37]/25 text-[#d4af37]/75 hover:border-[#d4af37]/70'
          }`}
          aria-pressed={isSequence}
          data-testid="frame-studio__surface-sequence"
        >
          Title cards
        </button>
        <button
          type="button"
          onClick={() => onChange('poster-edges')}
          className={`px-2 py-1.5 text-[10px] tracking-[0.12em] uppercase border transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-1 ${
            !isSequence ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc]' : 'border-[#d4af37]/25 text-[#d4af37]/75 hover:border-[#d4af37]/70'
          }`}
          aria-pressed={!isSequence}
          data-testid="frame-studio__surface-poster"
        >
          Poster edges
        </button>
      </div>
      {isSequence && posterEnabled && (
        <span className="block text-[8px] tracking-[0.12em] uppercase text-[#f8e29b]">Poster edge remains on</span>
      )}
    </div>
  );
}

function SequencePatternPicker({ sources, activeSource, onChange }: PatternPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-1" role="group" aria-label="Title-card frame pattern">
      {sources.map((source) => {
        const isActive = source.id === activeSource.id;
        return (
          <button
            key={source.id}
            type="button"
            onClick={() => onChange(source.id)}
            className={`px-2 py-1.5 text-[9px] tracking-[0.13em] uppercase border transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-1 ${
              isActive
                ? 'bg-[#d4af37]/20 border-[#f8e29b] text-[#fff6dc]'
                : 'border-[#d4af37]/25 text-[#d4af37]/75 hover:border-[#d4af37]/70 hover:text-[#f5e7c6]'
            }`}
            title={source.blurb}
            aria-pressed={isActive}
            data-testid="frame-studio__pattern-sequence"
          >
            {source.label}
          </button>
        );
      })}
    </div>
  );
}

function PosterPatternSummary() {
  return (
    <>
      <div
        role="status"
        aria-label="Selected pattern: One-Sheet Deco"
        className="w-full px-2 py-1.5 text-left text-[10px] tracking-[0.12em] uppercase border border-[#f8e29b]/70 bg-[#d4af37]/20 text-[#fff6dc]"
        data-testid="frame-studio__pattern-poster"
      >
        One-Sheet Deco
      </div>
      <p className="text-[10px] leading-snug text-[#e0cfa9]/70 font-editorial">
        A viewport-edge border, separate from the animated title-card frame.
      </p>
    </>
  );
}

function LevelControl({ level, readout, disabled, onChange }: LevelControlProps) {
  return (
    <div className="space-y-1.5 border-t border-[#d4af37]/20 pt-2">
      <div className="flex items-center justify-between">
        <label htmlFor="frame-studio-level" className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Level</label>
        <span className="text-[9px] tracking-[0.15em] uppercase text-[#f8e29b]" data-testid="frame-studio__level-readout">
          {readout}
        </span>
      </div>
      <input
        id="frame-studio-level"
        type="range"
        min={1}
        max={4}
        step={1}
        value={level}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`w-full gatsby-range focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2 ${disabled ? 'opacity-35 cursor-not-allowed' : ''}`}
        aria-label="Frame pattern level, 1 to 4"
        aria-valuetext={readout}
        data-testid="frame-studio__level"
      />
    </div>
  );
}

function DetailPresets({ presets, activePreset, onPreset }: Pick<DetailControlProps, 'presets' | 'activePreset' | 'onPreset'>) {
  return (
    <div className="flex items-center justify-between gap-1">
      {presets.map((preset) => {
        const isActive = activePreset?.id === preset.id;
        const label = preset.id === 'baseline' ? 'Balanced' : preset.label;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPreset(preset)}
            className={`px-1.5 py-0.5 text-[8px] tracking-[0.08em] uppercase border transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-1 ${
              isActive ? 'bg-[#d4af37]/25 border-[#f8e29b] text-[#fff6dc]' : 'border-[#d4af37]/25 text-[#d4af37]/75 hover:border-[#d4af37]/70 hover:text-[#f5e7c6]'
            }`}
            title={`${label} (${Math.round(preset.value * 100)})`}
            aria-pressed={isActive}
            data-testid="frame-studio__detail-preset"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DetailControl({ percent, readout, presets, activePreset, onChange, onPreset }: DetailControlProps) {
  return (
    <div className="space-y-1.5 border-t border-[#d4af37]/20 pt-2">
      <div className="flex items-center justify-between">
        <label htmlFor="frame-studio-detail" className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">Detail</label>
        <span className="text-[9px] tracking-[0.15em] uppercase text-[#f8e29b]" data-testid="frame-studio__detail-readout">
          {readout}
        </span>
      </div>
      <input
        id="frame-studio-detail"
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full gatsby-range focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-2"
        aria-label="Frame detail, 0 minimal to 100 baroque; 50 is balanced"
        aria-valuetext={`${percent} percent, ${readout}`}
        data-testid="frame-studio__detail"
      />
      <DetailPresets presets={presets} activePreset={activePreset} onPreset={onPreset} />
    </div>
  );
}

function PosterVisibilityButton({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-[9px] tracking-[0.16em] uppercase border transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f8e29b] focus-visible:outline-offset-1 ${
        enabled ? 'bg-[#d4af37]/20 border-[#f8e29b] text-[#fff6dc]' : 'border-[#d4af37]/35 text-[#d4af37]/80 hover:border-[#f8e29b]'
      }`}
      aria-pressed={enabled}
      data-testid="frame-studio__poster-visibility"
    >
      {enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      {enabled ? 'Border visible' : 'Show border'}
    </button>
  );
}

export const FrameStudioControl: React.FC<FrameStudioControlProps> = (props) => {
  const isSequence = props.surface === 'title-cards';
  const description = isSequence
    ? props.activeSource.blurb
    : 'A gold perimeter around the viewport, outside the animated title-card frame.';
  const levelReadout = props.isFixedPattern ? 'Fixed' : `Level ${props.level}`;
  const detailReadout = props.activePreset?.id === 'baseline' ? 'Balanced' : props.activePreset?.label ?? `${props.detailPercent}%`;

  return (
    <section
      className="w-[17rem] max-h-[calc(100dvh-12rem)] overflow-y-auto deco-scroll flex flex-col gap-3 px-3 py-3 bg-[#09070d]/90 border border-[#d4af37]/45 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.62)]"
      data-testid="frame-studio__panel"
      aria-label="Frame Studio"
    >
      <header className="flex items-center gap-2 border-b border-[#d4af37]/25 pb-2">
        <Layers className="w-3.5 h-3.5 text-[#f8e29b]" />
        <span className="flex-1 text-[11px] tracking-[0.24em] uppercase text-[#f8e29b]">Frame Studio</span>
        {isSequence && props.posterEnabled && (
          <span className="text-[8px] tracking-[0.12em] uppercase text-[#f8e29b]">Poster edge on</span>
        )}
      </header>
      <SurfacePicker surface={props.surface} posterEnabled={props.posterEnabled} onChange={props.onSurfaceChange} />
      <div className="space-y-1.5">
        <div className="text-[9px] tracking-[0.2em] uppercase text-[#d4af37]/80">
          {isSequence ? 'Title-card pattern' : 'Perimeter pattern'}
        </div>
        {isSequence ? (
          <SequencePatternPicker sources={props.sources} activeSource={props.activeSource} onChange={props.onPatternChange} />
        ) : (
          <PosterPatternSummary />
        )}
        <p className="text-[10px] leading-snug text-[#e0cfa9]/70 font-editorial">{description}</p>
      </div>
      <LevelControl level={props.level} readout={levelReadout} disabled={props.isFixedPattern} onChange={props.onLevelChange} />
      <DetailControl
        percent={props.detailPercent}
        readout={detailReadout}
        presets={props.detailPresets}
        activePreset={props.activePreset}
        onChange={props.onDetailChange}
        onPreset={props.onPresetSelect}
      />
      {!isSequence && <PosterVisibilityButton enabled={props.posterEnabled} onChange={props.onPosterVisibilityChange} />}
    </section>
  );
};