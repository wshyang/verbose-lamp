import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ParticipantIdentityView } from '@psd/contracts';
import { usePeopleStore, type PeopleStore } from '../../lib/hooks/usePeopleStore.js';

/**
 * ADR-202 — hands any surface holding a participant id the person behind it. The work is in
 * `usePeopleStore`; this is the wire that reaches the whole participant tree, exactly as
 * `SpriteProvider` does for sprite bodies.
 */

const PeopleContext = createContext<PeopleStore | null>(null);

export function PeopleProvider(props: { children: ReactNode }) {
  const store = usePeopleStore();
  const value = useMemo(
    () => ({ request: store.request, personFor: store.personFor }),
    [store.request, store.personFor],
  );
  return <PeopleContext.Provider value={value}>{props.children}</PeopleContext.Provider>;
}

/**
 * The person behind an id, or null while they are on their way — and null for good if the
 * directory cannot place them. Every caller must be able to draw something without one:
 * a chat room must not grow a hole where a face is still loading.
 *
 * Returns null rather than throwing when there is no provider above it, which is what lets a
 * component be tested without one (the same contract `useSprite` has).
 */
export function usePerson(id: string | null): ParticipantIdentityView | null {
  const store = useContext(PeopleContext);
  const person = store === null ? null : store.personFor(id);
  useEffect(() => {
    if (store !== null && id !== null && person === null) store.request(id);
  }, [id, person, store]);
  return person;
}
