/**
 * Typed contracts for the Golden QR module.
 *
 * The module is layered: `encode` (text → module matrix), `geometry` (matrix →
 * SVG path data), `useQrGenerator` (state and decisions), and thin React renderers.
 * Only the pure layers are unit-tested; see ADDENDUM-013.
 */

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

/** How individual dark modules are drawn. Finder marks always stay square-ish. */
export type QrModuleShape = 'plaque' | 'diamond' | 'dot';

export interface QrRequest {
  readonly text: string;
  readonly errorCorrection: QrErrorCorrection;
}

export interface QrMatrix {
  /** Modules per side (21 for version 1, +4 per version). */
  readonly size: number;
  /** Symbol version 1–40, derived from size. */
  readonly version: number;
  /** `modules[row][col]` is true when the module is dark. */
  readonly modules: ReadonlyArray<ReadonlyArray<boolean>>;
}

export type QrEncodeResult =
  | { readonly ok: true; readonly matrix: QrMatrix }
  | { readonly ok: false; readonly reason: string };

/** Top-left module coordinate of a 7×7 finder pattern. */
export interface QrFinder {
  readonly row: number;
  readonly col: number;
}

export interface QrStyle {
  readonly shape: QrModuleShape;
  /** Light border, in modules, on every side. Spec minimum is 4. */
  readonly quietZone: number;
  /** Fraction (0–0.4) shaved from each side of a module so cells read as tiles. */
  readonly inset: number;
  /** Corner chamfer, in modules, applied to finder rings for the Art Deco cut. */
  readonly finderChamfer: number;
}

export interface QrFinderPaths {
  /** Even-odd path for the three 7×7 outer rings. */
  readonly ring: string;
  /** Path for the three 3×3 solid cores. */
  readonly core: string;
}

export interface QrRenderPlan {
  readonly size: number;
  readonly version: number;
  readonly quietZone: number;
  /** Width/height of the square SVG viewBox in module units. */
  readonly viewBox: number;
  readonly finders: readonly QrFinder[];
  readonly finderPaths: QrFinderPaths;
  /** Single SVG path covering every dark module outside the finder zones. */
  readonly modulePath: string;
  readonly darkModuleCount: number;
}

export interface QrPreset {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly caption: string;
  readonly errorCorrection: QrErrorCorrection;
}
