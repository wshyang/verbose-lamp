import type { GoldRampId } from '@/shared/lib/goldRamp';

/**
 * Backdrop patterns ported from the reference studio's spiral / concentric / waves /
 * psychedelic generators, renamed for this house (ADDENDUM-017 §3.3), plus the Deco Fan
 * lifted from avatar-studio implementation B (ADDENDUM-019). Distances are in cells of
 * the reference 128 grid.
 */
export interface SunburstPattern {
  readonly kind: 'sunburst';
  readonly rays: number;
  readonly twist: number;
}

export interface RadiancePattern {
  readonly kind: 'radiance';
  /** 1 diamond, 2 circle, 3 squircle, 4 square. */
  readonly shape: number;
  readonly ringWidth: number;
  readonly lobes: number;
  readonly lobeDepth: number;
}

export interface ChevronPattern {
  readonly kind: 'chevron';
  /** 1 sharp chevron, 2 soft bargello. */
  readonly wave: number;
  readonly period: number;
  /** Amplitude in tenths of the period. */
  readonly amplitude: number;
  readonly bandHeight: number;
}

export interface SwirlPattern {
  readonly kind: 'swirl';
  readonly swirl: number;
  readonly frequency: number;
  readonly ripple: number;
  readonly scale: number;
}

/** Rays fanning up from a hub below the bottom edge: the Art Deco sunrise. */
export interface FanPattern {
  readonly kind: 'fan';
  readonly rays: number;
  /** Hub depth below the bottom edge, in steps of 4 % of the panel. */
  readonly lift: number;
}

export type BackdropPattern = SunburstPattern | RadiancePattern | ChevronPattern | SwirlPattern | FanPattern;
export type BackdropKind = BackdropPattern['kind'];

/** Cloisonné keeps every band enamel; gilded bands lay hammered gold leaf into every other band. */
export type InlayStyle = 'cloisonne' | 'gilded-bands';

export interface EnamelPalette {
  readonly id: string;
  readonly name: string;
  readonly colourOne: string;
  readonly colourTwo: string;
  /** Extra enamels between the two colours (jewel palettes carry four tones). */
  readonly accents?: readonly string[];
  /** The darkest tone of the family, used for swatch grounds. */
  readonly ground: string;
}

export interface BackdropSpec {
  readonly pattern: BackdropPattern;
  readonly colourOne: string;
  readonly colourTwo: string;
  /** Optional middle enamels; band colours interpolate across colourOne → accents → colourTwo. */
  readonly accents?: readonly string[];
  /** Enamel bands per repeat, 2–4. */
  readonly bands: number;
  /** 0–1: how far the enamel is glazed toward gold. */
  readonly gilt: number;
  /** Cloison wire width in reference-grid cells (resolution independent). */
  readonly wireWidth: number;
  /** 0–1: how much gold leaf is flecked into the enamel. */
  readonly leafDensity: number;
  readonly rampId: GoldRampId;
  /** Defaults to cloisonné. */
  readonly inlay?: InlayStyle;
  /** 0–1 engine-turned texture on the enamel; defaults to 0. */
  readonly guilloche?: number;
}

export interface BackdropPreset {
  readonly id: string;
  readonly name: string;
  readonly spec: BackdropSpec;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface FieldFrame {
  /** Output edge in pixels. */
  readonly size: number;
  readonly bands: number;
}

export interface KnobRange {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export type SpecKnob = 'bands' | 'gilt' | 'wireWidth' | 'leafDensity' | 'guilloche';
