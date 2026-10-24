import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAvatarSprites } from '../api/participants.js';
import {
  cacheSprites,
  forgetCachedSprite,
  readAllCachedSprites,
  readCachedSprites,
} from '../avatar/spriteCache.js';

/**
 * ADR-035 — turns sprite ids into sprites, once per device.
 *
 * Rows carry an id, not a picture. Components ask for one; anything this device has seen
 * before comes straight out of the on-device cache, and everything else is collected and
 * asked for in a single request on the next tick. Thirty faces on a leaderboard are one
 * fetch the first time and none at all thereafter.
 */
export interface SpriteStore {
  spriteFor: (id: string | null) => string | null;
  request: (id: string) => void;
  /** ADR-228 — a face taken off: dropped from memory and from this device's cache. */
  forget: (id: string) => void;
}

export function useSpriteStore(): SpriteStore {
  // ADR-238 — start from what this device already holds, so the first paint has every known face and the
  // stand-in is drawn only for a face that is genuinely on its way.
  const [known, setKnown] = useState<Record<string, string>>(readAllCachedSprites);
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
    for (const id of missing) asked.current.add(id);

    const cached = readCachedSprites(missing);
    if (cached.size > 0) setKnown((current) => ({ ...current, ...Object.fromEntries(cached) }));

    const absent = missing.filter((id) => !cached.has(id));
    if (absent.length === 0) return;
    void fetchAvatarSprites(absent).then((items) => {
      const arriving = new Map(items.map((item) => [item.id, item.sprite]));
      cacheSprites(arriving);
      setKnown((current) => ({ ...current, ...Object.fromEntries(arriving) }));
    });
  }, [round]);

  const forget = useCallback((id: string) => {
    forgetCachedSprite(id);
    asked.current.delete(id);
    wanted.current.delete(id);
    setKnown((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const spriteFor = useCallback((id: string | null) => (id === null ? null : known[id] ?? null), [known]);
  return { request, spriteFor, forget };
}
