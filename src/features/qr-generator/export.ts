/**
 * Re-exported from `@/shared/lib/svgExport`: serialisation and download are not
 * QR-specific, and the Deco Lattice frames export through the same helpers
 * (ADDENDUM-021 §3.5.4). Kept as a module so no import path changes.
 */
export {
  downloadSvgAsPng,
  downloadSvgElement,
  serializeSvg,
  toSafeFileStem,
} from '@/shared/lib/svgExport';
