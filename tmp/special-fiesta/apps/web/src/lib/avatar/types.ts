/**
 * The shapes the whole avatar pipeline passes around, in a module that imports nothing.
 *
 * ADR-072 — these lived in `photoSprite.ts` until the cut-out grew its own module. `cutOut.ts`
 * needs `SubjectMask` and `CropBox`; `photoSprite.ts` needs `tunedMask` back from `cutOut.ts`.
 * Left as they were that is a circular import, which `check-standards.mjs` fails outright — so
 * the types moved down to a leaf and both modules import from here. `photoSprite.ts` re-exports
 * all three, so every existing importer is untouched.
 */

/** Where the head is in the photo, as a square in photo coordinates. */
export interface CropBox {
  x: number;
  y: number;
  size: number;
}

/** ADR-033 — what the segmentation model hands back: 0 background, 255 subject. */
export interface SubjectMask {
  width: number;
  height: number;
  alpha: Uint8Array;
}

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, as `CanvasRenderingContext2D.getImageData` returns. */
  pixels: Uint8ClampedArray;
}
