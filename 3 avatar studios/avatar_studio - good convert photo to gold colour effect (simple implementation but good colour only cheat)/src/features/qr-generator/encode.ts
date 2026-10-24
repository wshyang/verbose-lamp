import qrcode from 'qrcode-generator';
import type { QrEncodeResult, QrMatrix, QrRequest } from './types';

/** Version 40 at level L holds 2,953 bytes; anything near that is unreadable on screen. */
export const MAX_QR_TEXT_LENGTH = 1200;

const AUTO_VERSION = 0;

export const QR_EMPTY_MESSAGE = 'Inscribe a message, address, or link to engrave.';
export const QR_OVERFLOW_MESSAGE =
  'Too long for a single code at this correction level. Shorten the text or choose lighter correction.';

/**
 * The encoder treats each character of its input as one byte, so UTF-8 text must
 * first be expanded into a byte-per-character string.
 */
export function toUtf8ByteString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function freezeRows(size: number, isDark: (row: number, col: number) => boolean) {
  const rows: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const cells: boolean[] = [];
    for (let col = 0; col < size; col++) cells.push(isDark(row, col));
    rows.push(Object.freeze(cells) as boolean[]);
  }
  return Object.freeze(rows) as ReadonlyArray<ReadonlyArray<boolean>>;
}

export function versionFromSize(size: number): number {
  return (size - 17) / 4;
}

/** Throws when the text does not fit; prefer `tryEncodeQr` from UI code. */
export function encodeQr(request: QrRequest): QrMatrix {
  const symbol = qrcode(AUTO_VERSION, request.errorCorrection);
  symbol.addData(toUtf8ByteString(request.text), 'Byte');
  symbol.make();
  const size = symbol.getModuleCount();
  return Object.freeze({
    size,
    version: versionFromSize(size),
    modules: freezeRows(size, (row, col) => symbol.isDark(row, col)),
  });
}

export function tryEncodeQr(request: QrRequest): QrEncodeResult {
  if (request.text.trim().length === 0) return { ok: false, reason: QR_EMPTY_MESSAGE };
  if (request.text.length > MAX_QR_TEXT_LENGTH) return { ok: false, reason: QR_OVERFLOW_MESSAGE };
  try {
    return { ok: true, matrix: encodeQr(request) };
  } catch {
    return { ok: false, reason: QR_OVERFLOW_MESSAGE };
  }
}
