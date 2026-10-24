/** Shared raster primitives: framework-neutral pixel contracts, resampling, morphology. */
export type { AlphaMask, RasterDimensions, RgbaImage, SquareBox } from './types';
export { cropSquare, resampleAlpha, solidAlpha } from './resample';
export { dilateAlpha, erodeAlpha } from './morphology';
