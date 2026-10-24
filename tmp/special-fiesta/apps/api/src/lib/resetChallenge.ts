import { randomInt } from 'node:crypto';

/**
 * ADR-307 — the reset's typed challenge. The server mints a random ten-character
 * alphanumeric string; the console displays `DELETE` followed by it, and the operator
 * must type the whole thing back. The challenge lives only in this process's memory:
 * it is single-use, bound to the superadmin who asked for it, and expires five minutes
 * after issue, so a photographed or shoulder-surfed code is worthless almost at once.
 *
 * Every reset attempt consumes the challenge — right or wrong — so the endpoint cannot
 * be used to grind through either the confirmation or the four-digit passcode: each
 * guess costs a fresh, visibly different code on the operator's own screen.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CHALLENGE_LENGTH = 10;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface PendingChallenge {
  confirmation: string;
  expiresAt: number;
}

const pending = new Map<string, PendingChallenge>();

export interface IssuedChallenge {
  /** The full text the operator must type, `DELETE` prefix included. */
  confirmation: string;
  expiresAt: string;
}

export function issueResetChallenge(superadminId: string, now = Date.now()): IssuedChallenge {
  let suffix = '';
  for (let index = 0; index < CHALLENGE_LENGTH; index += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  const entry: PendingChallenge = {
    confirmation: `DELETE${suffix}`,
    expiresAt: now + CHALLENGE_TTL_MS,
  };
  pending.set(superadminId, entry);
  return { confirmation: entry.confirmation, expiresAt: new Date(entry.expiresAt).toISOString() };
}

/**
 * Take this superadmin's challenge out of the store and say what it was, or null when
 * there is none live (never issued, already spent, or expired). Consumption is
 * unconditional: the caller compares the returned text and treats a mismatch as a
 * spent challenge, never as a retry against the same code.
 */
export function consumeResetChallenge(superadminId: string, now = Date.now()): string | null {
  const entry = pending.get(superadminId);
  if (!entry) return null;
  pending.delete(superadminId);
  return entry.expiresAt > now ? entry.confirmation : null;
}

/** Test hygiene: a spent-or-live challenge must never leak into the next case. */
export function clearResetChallengesForTests(): void {
  pending.clear();
}
