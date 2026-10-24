/**
 * Framework-neutral raster contracts shared by every image feature (ADDENDUM-017 §3.0).
 *
 * They live here, not in a feature, so face detection, background removal, the enamel
 * backdrop and the gilded portrait can all speak the same pixel language without one
 * feature importing another just for a type.
 */

export interface RasterDimensions {
  readonly width: number;
  readonly height: number;
}

/** Straight (non-premultiplied) RGBA, row-major, 4 bytes per pixel. */
export interface RgbaImage extends RasterDimensions {
  readonly data: Readonly<Uint8ClampedArray>;
}

/** One byte of coverage per pixel: 0 transparent, 255 opaque. */
export interface AlphaMask extends RasterDimensions {
  readonly data: Uint8ClampedArray;
}

/** A square region of a raster, in that raster's pixel units. */
export interface SquareBox {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}
