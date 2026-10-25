import { messages } from '@psd/contracts';

/**
 * ADR-118 — how a participant surface recognises that it has been paused.
 *
 * The pause reaches the phone as the 503 on the read the panel was already making, so there is
 * no extra request and nothing to poll: a paused room learns it is paused by asking for
 * messages, which is what it does anyway.
 *
 * Matched on the message rather than the status because that is what survives the client's
 * error handling — by the time a hook sees it the response is already a string. The string is a
 * contract constant shared with the server, not prose typed twice on both sides.
 */
export function isSocialPausedError(error: string | null): boolean {
  return error === messages.socialPaused;
}
