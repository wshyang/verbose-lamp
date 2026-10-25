/**
 * Re-exported from `@/shared/lib/svgExport`: serialisation and download are not QR-specific,
 * and the Deco Lattice frames export through the same helpers (ADDENDUM-021 §3.5.4). Kept as a
 * module so no import path changes.
 */
export {
  downloadSvgAsPng,
  downloadSvgElement,
  serializeSvg,
} from '@/shared/lib/svgExport';

import { toSafeFileStem as toSafeStem } from '@/shared/lib/svgExport';

/** The QR code's own default: a caption with nothing printable still downloads as `golden-qr`. */
export const QR_FILE_STEM = 'golden-qr';

export function toSafeFileStem(label: string, fallback = QR_FILE_STEM): string {
  return toSafeStem(label, fallback);
}
