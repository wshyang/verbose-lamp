/**
 * Golden QR module barrel. Host code should import from here only.
 *
 * Layers (pure → DOM):
 *   encode.ts        text → immutable module matrix (wraps qrcode-generator)
 *   geometry.ts      matrix → SVG path data (modules, chamfered finders)
 *   fileStem.ts      caption -> safe download filename stem (pure)
 *   export.ts        SVG/PNG download helpers (DOM wrappers)
 *   useQrGenerator   state + decisions
 *   GoldenQrCode     thin SVG renderer with the shared gold/shimmer vocabulary
 *   QrGeneratorModal / QrGeneratorLauncher   UI shell
 */

export type {
  QrErrorCorrection,
  QrModuleShape,
  QrMatrix,
  QrRequest,
  QrRenderPlan,
  QrStyle,
  QrPreset,
} from './types';

export { encodeQr, tryEncodeQr, MAX_QR_TEXT_LENGTH } from './encode';
export { buildRenderPlan, resolveQrStyle, DEFAULT_QR_STYLE } from './geometry';
export { toSafeFileStem } from './fileStem';
export { QR_PRESETS } from './presets';
export { useQrGenerator } from './useQrGenerator';
export { GoldenQrCode } from './GoldenQrCode';
export { QrGeneratorModal } from './QrGeneratorModal';
export { QrGeneratorLauncher } from './QrGeneratorLauncher';
