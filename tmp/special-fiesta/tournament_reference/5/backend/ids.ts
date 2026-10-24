const HEX = '0123456789abcdef';

/** UUIDv7 (timestamp-ordered, GREENFIELD s4), minted only here. */
export function newId(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const timestamp = now;
  bytes[0] = Math.floor(timestamp / 2 ** 40) % 256;
  bytes[1] = Math.floor(timestamp / 2 ** 32) % 256;
  bytes[2] = Math.floor(timestamp / 2 ** 24) % 256;
  bytes[3] = Math.floor(timestamp / 2 ** 16) % 256;
  bytes[4] = Math.floor(timestamp / 2 ** 8) % 256;
  bytes[5] = timestamp % 256;
  bytes[6] = (bytes[6] % 16) + 0x70;
  bytes[8] = (bytes[8] % 64) + 0x80;
  const hex = [...bytes].map((byte) => HEX[byte >> 4] + HEX[byte % 16]).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
