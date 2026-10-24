import { randomBytes } from 'node:crypto';
import { uuidv7 } from 'uuidv7';

/**
 * The ONLY place this repository mints identifiers (AGENTS-database.md §2).
 * UUIDv7 is timestamp-ordered, which gives index locality on the high-insert tables
 * (fringe_scan, session, void_audit_entry).
 */
export function newId(): string {
  return uuidv7();
}

/** Opaque 256-bit session token (ADR-004) — never a JWT, never carries the PIN. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 6;
/** ADR-107 — the largest multiple of the alphabet size below 256; bytes past it alias A–H. */
const JOIN_CODE_BYTE_CEILING = 256 - (256 % JOIN_CODE_ALPHABET.length);

/**
 * fds.md §2.3 — uppercase alphanumeric excluding 0/O/1/I/L.
 *
 * ADR-107 — rejection sampling, not bare modulo: 256 % 31 ≠ 0, so `byte % 31` would map
 * the eight top byte values back onto the first eight letters and skew the draw ~12.5%
 * towards them. Negligible against guessing (≈2⁻³⁰ either way), fixed because uniform
 * costs three lines. The byte source is injectable so a test can force the rejection path.
 */
export function newJoinCode(random: (size: number) => Buffer = randomBytes): string {
  const letters: string[] = [];
  while (letters.length < JOIN_CODE_LENGTH) {
    for (const byte of random(JOIN_CODE_LENGTH)) {
      if (byte >= JOIN_CODE_BYTE_CEILING) continue;
      letters.push(JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length] as string);
      if (letters.length === JOIN_CODE_LENGTH) break;
    }
  }
  return letters.join('');
}
