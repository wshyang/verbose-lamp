import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParticipantIdentityView } from '@psd/contracts';
import { fetchParticipantIdentities } from '../api/participants.js';

/**
 * ADR-202 — turns participant ids into people, once per device.
 *
 * The same shape as `useSpriteStore` (ADR-035) and for the same reason: a surface holds ids,
 * components ask for one, and everything asked for on a tick is collected into a single
 * request. A chat room where forty people have said three hundred things is forty rows on the
 * wire, not three hundred — which is the whole argument ADR-046 made when it chose to send a
 * bare `authorParticipantId` in the first place.
 *
 * Unlike a sprite this is NOT written to the on-device cache. A sprite id is a hash of its
 * own body, so a cached sprite can never be stale; a participant id is a stable handle to a
 * mutable person, and somebody who restyles their avatar should look different the next time
 * the app opens. Holding it for the life of the tab is as long as it may safely be held.
 */
export interface PeopleStore {
  personFor: (id: string | null) => ParticipantIdentityView | null;
  request: (id: string) => void;
}

export function usePeopleStore(): PeopleStore {
  const [known, setKnown] = useState<Record<string, ParticipantIdentityView>>({});
  const wanted = useRef(new Set<string>());
  const asked = useRef(new Set<string>());
  const [round, setRound] = useState(0);

  const request = useCallback((id: string) => {
    if (asked.current.has(id) || wanted.current.has(id)) return;
    wanted.current.add(id);
    setRound((value) => value + 1);
  }, []);

  useEffect(() => {
    const missing = [...wanted.current];
    if (missing.length === 0) return;
    wanted.current.clear();
    /*
     * Marked as asked BEFORE the request resolves, and never unmarked. An id the directory
     * cannot place — somebody who has left, or a room read by an actor who may not see them —
     * must not be re-requested on every render; the row draws its fallback and stops asking.
     */
    for (const id of missing) asked.current.add(id);

    void fetchParticipantIdentities(missing).then((items) => {
      if (items.length === 0) return;
      const arriving = Object.fromEntries(items.map((item) => [item.participantId, item]));
      setKnown((current) => ({ ...current, ...arriving }));
    });
  }, [round]);

  const personFor = useCallback(
    (id: string | null) => (id === null ? null : known[id] ?? null),
    [known],
  );
  return { request, personFor };
}
