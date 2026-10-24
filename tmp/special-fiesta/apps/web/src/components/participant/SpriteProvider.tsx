import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSpriteStore, type SpriteStore } from '../../lib/hooks/useSpriteStore.js';

/**
 * ADR-035 — hands every `<Avatar>` the sprite behind its id. The work is in
 * `useSpriteStore`; this is the wire that reaches the whole participant tree.
 */

const SpriteContext = createContext<SpriteStore | null>(null);

export function SpriteProvider(props: { children: ReactNode }) {
  const store = useSpriteStore();
  const value = useMemo(
    () => ({ request: store.request, spriteFor: store.spriteFor, forget: store.forget }),
    [store.request, store.spriteFor, store.forget],
  );
  return <SpriteContext.Provider value={value}>{props.children}</SpriteContext.Provider>;
}

/**
 * ADR-228 — the way to forget a face on this device once the participant has taken it off. Without a
 * provider there is nothing to forget, so the call does nothing.
 */
export function useSpriteForget(): (id: string) => void {
  const store = useContext(SpriteContext);
  return store === null ? () => undefined : store.forget;
}

/**
 * The sprite for an id, or null while it is on its way — an avatar draws its character in
 * the meantime, so a face never leaves a hole in a list.
 */
export function useSprite(id: string | null): string | null {
  const store = useContext(SpriteContext);
  const sprite = store === null ? null : store.spriteFor(id);
  useEffect(() => {
    if (store !== null && id !== null && sprite === null) store.request(id);
  }, [id, sprite, store]);
  return sprite;
}
