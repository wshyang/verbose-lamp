import { useCallback, useMemo, useRef } from 'react';
import { readFeedMarks, type FeedName } from '../storage/feedReadStore.js';

/**
 * ADR-163 — where this reader left off, and getting them back to it.
 *
 * A room that opens on its newest line asks the reader to work out for themselves which part
 * of it they have already seen. In a quiet room that is no work at all; in the room after a
 * match it is thirty lines of guessing, and the usual outcome is that somebody scrolls up too
 * far, re-reads what they had, and misses the one line addressed to them.
 *
 * So the boundary is drawn, and the room opens on it rather than on the tail.
 *
 * **The mark is a timestamp, not an id.** ADR-125 moved the read marker onto the device, and
 * every value it stores is a string the *server* produced — the watermark it reported for that
 * feed. Both sides of this comparison are therefore on the server's clock, and a phone set two
 * hours fast still draws the line in the right place. Comparing ids would be comparing UUIDv7s,
 * which happens to sort correctly today and is not a promise anybody made.
 *
 * **Frozen at mount, and that is the whole subtlety.** Opening the room is what clears the dot:
 * the surface calls `markFeedRead`, which advances the very mark this hook needs. Read it a
 * moment later and it says "you have read everything", which is true and useless. So the mark
 * is captured on the first render — before any effect has run — and held for the life of the
 * mount. The line therefore stays where the reader found it while they are reading, and moves
 * to the new boundary the next time they come in, which is what every chat application does
 * and what people already expect.
 *
 * **A null mark draws no line.** It means nothing is known to have been read — a device seeded
 * while the feed was empty (ADR-125's first-sight rule). A divider above the first message of a
 * room nobody has ever opened separates nothing from everything.
 *
 * The boundary IS allowed to be the first loaded message, which is a different case and a real
 * one: the room opens on the newest fifty, and if all fifty are new then the line belongs at
 * the top with the older, already-read history reachable behind `Earlier messages`.
 *
 * **ADR-267 — the line is drawn over the entry list, not over everything that ever arrives.**
 * The mark is frozen at entry, but the list is not: it grows all visit. The first version
 * compared the frozen mark against the live list, so anything absorbed after entry that
 * postdated the mark could *create* the line where entry had found none — most visibly the
 * reader's own just-sent message, which arrived under a "new messages" rule in the very
 * act of being written. ADR-083 already ruled the principle: absorbing is reading, so
 * nothing that lands in an open room is unread, the sender's own line above all. So the
 * hook also freezes a **horizon** — the newest `createdAt` the entry load brought, pinned
 * the moment the caller says the load has settled (`settled`) — and only messages at or
 * under the horizon can sit below the line. Arrivals during the visit, whoever wrote
 * them, are below no line; earlier history loaded behind `Earlier messages` is under the
 * horizon by construction, so the line can still climb to cover it.
 */

interface Datable {
  id: string;
  createdAt: string;
}

export interface NewMessageBoundary {
  /** The id of the first unread message, or null when there is no line to draw. */
  boundaryId: string | null;
  /** Attach to the divider. Scrolls it to the top of the view, once per visit. */
  boundaryRef: (node: HTMLElement | null) => void;
}

export function useNewMessageBoundary(
  feed: FeedName,
  messages: readonly Datable[],
  settled = true,
): NewMessageBoundary {
  /*
   * `undefined` means "not captured yet" and `null` means "captured, and there was no mark".
   * Collapsing the two would re-read storage on every render and pick up this visit's own
   * `markFeedRead`, which is precisely the value that must not be used.
   */
  const captured = useRef<string | null | undefined>(undefined);
  if (captured.current === undefined) captured.current = readFeedMarks()[feed];
  const mark = captured.current;

  /*
   * ADR-267 — the horizon, with the same undefined/null discipline as the mark. Undefined
   * until the entry load settles: pinning it at the seeded cache's newest line, before the
   * catch-up delta lands, would fence out exactly the messages that arrived while the
   * reader was away. Pinned null means the room settled empty — everything that ever
   * arrives in it arrives in the reader's presence and is read by landing (ADR-083).
   */
  const horizonRef = useRef<string | null | undefined>(undefined);
  if (horizonRef.current === undefined && settled) {
    horizonRef.current = messages.at(-1)?.createdAt ?? null;
  }
  const horizon = horizonRef.current;

  const boundaryId = useMemo(() => {
    if (mark === null || horizon === undefined || horizon === null) return null;
    return (
      messages.find((message) => message.createdAt > mark && message.createdAt <= horizon)?.id ??
      null
    );
  }, [mark, horizon, messages]);

  // Once per mount: the reader asked to land here, not to be dragged back every time a new
  // line arrives while they are reading.
  const scrolled = useRef(false);
  const boundaryRef = useCallback((node: HTMLElement | null) => {
    if (node === null || scrolled.current) return;
    scrolled.current = true;
    // Guarded because jsdom has no layout and therefore no `scrollIntoView`; the divider is
    // still rendered and still correct without it.
    if (typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'start' });
  }, []);

  return { boundaryId, boundaryRef };
}
