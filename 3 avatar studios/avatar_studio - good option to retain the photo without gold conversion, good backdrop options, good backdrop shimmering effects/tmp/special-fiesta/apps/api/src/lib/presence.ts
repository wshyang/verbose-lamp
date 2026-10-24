import type { Executor } from '../db/client.js';
import { touchFacilitatorsSeen } from '../db/entities/accounts.js';
import { touchParticipantsSeen } from '../db/entities/participants.js';
import { touchScreenKeysSeen } from '../db/entities/screenKeys.js';
import { touchSessionsSeen } from '../db/entities/sessions.js';

/**
 * ADR-082 — presence is a note in memory, not a write on the request path.
 *
 * Before this module, every authenticated request paid two awaited UPDATEs before its
 * handler ran (`last_seen_at` on the session row and, for participants, on the participant
 * row) — the app's largest write source, scaling with traffic rather than with anything a
 * reader wanted, and all of it queueing on the database's single serialized connection
 * ahead of match scores (ADR-003). Nothing consumes these timestamps at per-request
 * precision; "who has gone quiet" is a question about minutes.
 *
 * So requests now record ids in two Sets — deduplication for free: forty requests from one
 * phone in an interval are one entry — and a single flusher stamps everyone it saw with one
 * statement per table. Traffic no longer sets the write rate; the flush interval does.
 *
 * This is process memory doing the job usually outsourced to Redis, legitimate here for
 * the same reason as the chat bus and the rate limiter: there is exactly one API process
 * (ADR-003/043). A crash or restart loses at most one interval of presence, which the
 * "within a minute" contract absorbs. The interval itself is started by `index.ts` — the
 * only file that opens a port is also the only file that starts background clocks — so
 * `createApp()` stays pure for the tests that exercise it via `app.request()`.
 */

export const PRESENCE_FLUSH_MS = 30_000;

const pendingParticipants = new Set<string>();
const pendingSessions = new Set<string>();
const pendingScreenKeys = new Set<string>();
const pendingFacilitators = new Set<string>();
let flushing = false;

export function noteParticipantSeen(participantId: string): void {
  pendingParticipants.add(participantId);
}

export function noteSessionSeen(sessionId: string): void {
  pendingSessions.add(sessionId);
}

/**
 * ADR-145 — a projector polls six endpoints for eight hours, so this is the highest-volume
 * note of the three and the one that benefits most from being a Set: a whole interval of one
 * hall screen's traffic collapses to a single id, and the flush to a single UPDATE.
 */
export function noteScreenKeySeen(screenKeyId: string): void {
  pendingScreenKeys.add(screenKeyId);
}

/**
 * ADR-151 — the marshals, added last and for the opposite reason to the others. The first
 * three notes exist to make a WRITE cheap; this one exists because nothing was recording the
 * fact at all, so the projector had better observability than the people running the event.
 */
export function noteFacilitatorSeen(facilitatorId: string): void {
  pendingFacilitators.add(facilitatorId);
}

/** Test seam — module state would otherwise leak between tests in a file. */
export function resetPresence(): void {
  pendingParticipants.clear();
  pendingSessions.clear();
  pendingScreenKeys.clear();
  pendingFacilitators.clear();
  flushing = false;
}

/** Ids drain before the write so notes arriving mid-flush land in the NEXT interval. */
function drain(pending: Set<string>): string[] {
  const ids = [...pending];
  pending.clear();
  return ids;
}

function restore(pending: Set<string>, ids: readonly string[]): void {
  for (const id of ids) pending.add(id);
}

/**
 * One statement per table for everyone seen since the last flush. Never throws: the only
 * production caller is a timer with nobody above it, so a failed flush logs, puts its ids
 * back (re-adding is idempotent against notes that arrived meanwhile), and lets the next
 * tick retry — presence written a little late is exactly as useful.
 */
export async function flushPresence(db: Executor): Promise<void> {
  if (flushing) return;
  flushing = true;
  const participantIds = drain(pendingParticipants);
  const sessionIds = drain(pendingSessions);
  const screenKeyIds = drain(pendingScreenKeys);
  const facilitatorIds = drain(pendingFacilitators);
  try {
    await touchParticipantsSeen(db, participantIds);
    await touchSessionsSeen(db, sessionIds);
    await touchScreenKeysSeen(db, screenKeyIds);
    await touchFacilitatorsSeen(db, facilitatorIds);
  } catch (error) {
    restore(pendingParticipants, participantIds);
    restore(pendingSessions, sessionIds);
    restore(pendingScreenKeys, screenKeyIds);
    restore(pendingFacilitators, facilitatorIds);
    console.error('[presence] flush failed; retrying next interval', error);
  } finally {
    flushing = false;
  }
}
