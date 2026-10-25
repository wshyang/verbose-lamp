import React from 'react';
import {
  FrameSource,
  FrameSourceInfo,
  FrameLayerSource,
  FrameSurface,
  IntricacyPreset,
  GeneKey,
} from '@/features/art-deco-frame';
import { BorderSection } from './studio/BorderSection';
import { DesignSection } from './studio/DesignSection';
import { DetailSection } from './studio/DetailSection';
import { FoundationSection } from './studio/FoundationSection';
import { LayersSection } from './studio/LayersSection';
import { ProportionsSection } from './studio/ProportionsSection';
import { StudioHeader } from './studio/StudioHeader';
import { SurfaceSwitch } from './studio/SurfaceSwitch';

/** Every field the panel reads. The hook produces it; the sections narrow it. */
export interface FrameStudioControlProps {
  isOpen: boolean;
  surface: FrameSurface;
  patterns: readonly FrameSourceInfo[];
  baseSource: FrameSource;
  layers: readonly {
    source: FrameLayerSource;
    label: string;
    blurb: string;
    enabled: boolean;
    level: number;
  }[];
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
  onLayerToggle: (source: FrameLayerSource, enabled: boolean) => void;
  onLayerLevelChange: (source: FrameLayerSource, level: number) => void;
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

/**
 * The frame studio panel: one card, composed from its sections (ADDENDUM-035).
 *
 * It decides nothing. `useFrameStudio` owns the state and every handler; each
 * section below renders one group of controls and is given only the fields it
 * reads, so a section cannot quietly depend on unrelated studio state.
 */
export const FrameStudioControl: React.FC<FrameStudioControlProps> = (props) => {
  if (!props.isOpen) return null;
  const isTitle = props.surface === 'title-cards';

  return (
    <section
      className="absolute right-3 sm:right-9 top-28 z-[70] w-[min(19rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-8.5rem)] overflow-y-auto deco-scroll flex flex-col gap-3 px-3.5 py-3 bg-[#09070d]/93 border border-[#d4af37]/45 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.62)]"
      data-testid="frame-studio__panel"
      aria-label="Frame Studio"
    >
      <StudioHeader onReset={props.onReset} onDismiss={props.onDismiss} />
      <SurfaceSwitch surface={props.surface} onSurfaceChange={props.onSurfaceChange} />

      {isTitle ? (
        <>
          <FoundationSection patterns={props.patterns} baseSource={props.baseSource} onPatternChange={props.onPatternChange} />
          {props.isDesignPattern && <DesignSection designLabel={props.designLabel} designGallery={props.designGallery} activeDesignIndex={props.activeDesignIndex} onDesignChange={props.onDesignChange} />}
          <LayersSection layers={props.layers} onLayerToggle={props.onLayerToggle} onLayerLevelChange={props.onLayerLevelChange} />
          <DetailSection
            isDesignPattern={props.isDesignPattern}
            level={props.level}
            detailPercent={props.detailPercent}
            activePreset={props.activePreset}
            detailPresets={props.detailPresets}
            onLevelChange={props.onLevelChange}
            onDetailChange={props.onDetailChange}
          />
          {props.isDesignPattern && <ProportionsSection proportionsOpen={props.proportionsOpen} onProportionsToggle={props.onProportionsToggle} genome={props.genome} onGeneChange={props.onGeneChange} />}
        </>
      ) : (
        <BorderSection borderEnabled={props.borderEnabled} borderWeight={props.borderWeight} onBorderEnabledChange={props.onBorderEnabledChange} onBorderWeightChange={props.onBorderWeightChange} />
      )}
    </section>
  );
};
