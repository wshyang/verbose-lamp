import QRCode from 'qrcode';

/**
 * F25 — a participant's QR code encodes exactly their nickname (fds.md §4.3), so a facilitator
 * scan resolves to one participant without any extra lookup table.
 *
 * Rendered as SVG rather than canvas: it stays crisp when a phone is held up in sunlight, and
 * it works anywhere a string does (no canvas dependency, so the unit tests exercise the real
 * encoder instead of a mock).
 */

export function participantQrPayload(nickname: string): string {
  return nickname;
}

export async function renderQrDataUrl(nickname: string): Promise<string> {
  const svg = await QRCode.toString(participantQrPayload(nickname), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#12243aff', light: '#ffffffff' },
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
