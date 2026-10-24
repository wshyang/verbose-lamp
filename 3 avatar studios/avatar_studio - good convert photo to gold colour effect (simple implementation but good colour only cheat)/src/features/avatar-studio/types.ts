import type { GoldRampId, RgbaImage } from '@/features/gilded-portrait';

/**
 * ADDENDUM-017 — the contracts the Gold Avatar Studio speaks.
 *
 * Everything here is plain data so that the engine modules stay pure: a photo, a face
 * reading, a matte and a grid of cells are all values, and the browser adapters
 * (`faceDetection.ts`, `subjectSegmentation.ts`) are the only places that touch a
 * network or a DOM.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A square window over the source photograph, in source pixels. */
export interface CropBox {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** One byte of subject-ness per pixel. */
export interface AlphaMask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/**
 * What a face detector found. Keypoints are normalised (0–1) against the image they
 * came from; the box is in the image's own pixels.
 */
export interface FaceReading {
  readonly keypoints: readonly Point[];
  readonly box?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** An indexed sprite: a grid of palette keys and the colours they mean. */
export interface IndexedSprite {
  readonly size: number;
  readonly palette: readonly string[];
  readonly rows: readonly string[];
}

/**
 * The four backdrop artworks, ported from the beach app's avatar studio and renamed
 * for the gold house. Each is a different way of deciding which band a cell is in.
 */
export type BackdropPatternKind = 'rays' | 'chevron' | 'rings' | 'kaleidoscope';

export interface BackdropPattern {
  readonly kind: BackdropPatternKind;
  readonly bands: number;
  /** Rays: how many rays the spiral lays down. */
  readonly rays: number;
  /** Rays: how far the spiral drags each ray round, per cell of radius. */
  readonly twist: number;
  /** Chevron: how far the bands swing sideways, as a fraction of the period. */
  readonly amplitude: number;
  readonly period: number;
  readonly bandHeight: number;
  /** Rings: the Minkowski exponent — 1 diamond, 2 circle, 4 squircle, ∞ square. */
  readonly exponent: number;
  /** Rings: how many petals the rose term makes. */
  readonly lobes: number;
  /** Rings: how deep the petals cut. */
  readonly depth: number;
  readonly ringWidth: number;
  /** Kaleidoscope: how fast the warp cycles. */
  readonly frequency: number;
  /** Kaleidoscope: how hard the warp bends. */
  readonly ripple: number;
  readonly swirl: number;
  readonly scale: number;
}

/**
 * A portrait reduced to a grid: one colour per cell, and a flag saying whether that
 * cell is the sitter or the ground behind them.
 */
export interface PortraitGrid {
  readonly size: number;
  /** 1 means backdrop. */
  readonly background: Uint8Array;
  /** Three bytes per cell: red, green, blue. */
  readonly colours: Uint8Array;
}

/** Where the studio's subject came from. */
export type StudioSource = 'none' | 'photograph' | 'wei-ling';

/** What the face detector is doing, and how it went. */
export type FaceStatus = 'idle' | 'searching' | 'found' | 'none';

export interface ArtPalette {
  readonly id: string;
  readonly name: string;
  readonly colours: readonly string[];
}

export interface GoldStudioOptions {
  readonly pattern: BackdropPattern;
  readonly artColours: readonly string[];
  readonly rampId: GoldRampId;
  /** How much of the backdrop becomes gold rather than enamel, 0–1. */
  readonly goldShare: number;
  /** How hard the plate catches the light, 0–1. */
  readonly sheen: number;
  /** Whether the sitter is gilded too, or left in their own colours. */
  readonly gildSubject: boolean;
  /** Whether the plate carries a raised gold rim. */
  readonly rim: boolean;
  /** Where the specular highlight sits, 0–1. */
  readonly shimmerPhase: number;
}

export type { GoldRampId, RgbaImage };
