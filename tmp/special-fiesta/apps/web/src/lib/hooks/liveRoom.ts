import { useCallback, useEffect, useState } from 'react';
import { describeError } from './useAsyncData.js';

/**
 * ADR-063 — the parts a live room needs whatever room it is.
 *
 * Extracted from `useChatRoom` when the team room arrived (ADR-046 wrote them for the global one).
 * Only the genuinely shared mechanics live here: the two rooms carry different message shapes and
 * different transports, so a single generic hook over both would have taken more parameters than it
 * saved lines.
 */

/**
 * ADR-104 — how long after (re)connecting a room stays audibly silent.
 *
 * Opening a room with unread history replays that backlog over the stream frame by frame —
 * which is READING, not arrival, and must not ding like arrival (the user walked in because
 * the LED told them to; blipping at them for doing so teaches them to ignore sounds). Only a
 * message landing after this window — a phone sitting open on the room — makes the blip.
 */
export const CHAT_BLIP_QUIET_MS = 2_000;

/**
 * Ids are UUIDv7, so ordering by id is ordering by time and needs no date parsing.
 *
 * ADR-064 — compared with `<`, not `localeCompare`. The server orders the same ids with SQL `>` and
 * the stream de-duplicates with `<=`, and a locale-aware collation is a different comparison that
 * merely happens to agree for fixed-format lowercase hex. Matching the server exactly is both the
 * cheaper operation and the one that cannot diverge.
 */
export function mergeById<T extends { id: string }>(
  existing: readonly T[],
  arriving: readonly T[],
): T[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of arriving) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

/**
 * Counts returns to the foreground. A backgrounded tab's stream is gone — iOS Safari closes it,
 * and ADR-041 makes that engine first-class — and a suspended page never gets to run
 * `EventSource`'s own retry, so coming back must open a fresh stream rather than leave a silently
 * dead room.
 */
export function useForegroundGeneration(): number {
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setGeneration((count) => count + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return generation;
}

/** What either room's backwards-page endpoint answers with. */
export interface OlderPage<T> {
  messages: T[];
  hasOlder: boolean;
}

export interface OlderPages {
  hasOlder: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => void;
}

/**
 * ADR-065 for the global room, ADR-087 for the team room — reaching back up a room a page at a time.
 *
 * Generic over the message type and the fetch, because the two rooms differ only in those: the
 * guards, the optimistic `hasOlder` and the error path are identical, and duplicating them was how
 * the team room came to have no walk-back at all.
 *
 * `hasOlder` starts true because a fresh room has not been told otherwise; the first backwards page
 * settles it, and the server answers exactly rather than guessing from a full page. One request at a
 * time, and none once history has run out: without both guards a sentinel still on screen — which it
 * is while the page is short — would fire a request per scroll event and then keep asking after the
 * conversation had ended.
 */
export function useOlderPages<T>(input: {
  oldest: { current: string | null };
  fetchOlder: (before: string) => Promise<OlderPage<T>>;
  absorb: (arriving: readonly T[]) => void;
  onError: (message: string) => void;
}): OlderPages {
  const [hasOlder, setHasOlder] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const { oldest, fetchOlder, absorb, onError } = input;

  const loadOlder = useCallback(() => {
    const before = oldest.current;
    if (before === null || isLoadingOlder || !hasOlder) return;
    setIsLoadingOlder(true);
    void fetchOlder(before)
      .then((page) => {
        setHasOlder(page.hasOlder);
        absorb(page.messages);
      })
      .catch((cause: unknown) => onError(describeError(cause)))
      .finally(() => setIsLoadingOlder(false));
  }, [absorb, fetchOlder, hasOlder, isLoadingOlder, oldest, onError]);

  return { hasOlder, isLoadingOlder, loadOlder };
}
