import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsyncData } from './useAsyncData.js';
import { describeError } from './useAsyncData.js';
import { readCached, writeCached } from '../storage/cacheStore.js';
import { useSessionOrNull } from '../session/context.js';

/**
 * ADR-112 — useAsyncData with a device memory.
 *
 * Policy per surface:
 *   - `ttlMs` — while the cached answer is younger, serve it and make NO request at all
 *     (the aggressive mode; used where the poll floor already tolerates that staleness);
 *   - `ttlMs: 0` — warm-start: render the cached answer instantly, revalidate always.
 * `reload()` always bypasses the cache — pull-to-refresh and polls keep their promises.
 *
 * Only participants get the cache (actor = participant id); any other session shape
 * bypasses storage entirely rather than risk a shared namespace.
 */

const CACHE_HORIZON_MS = 6 * 60 * 60 * 1000;

interface CachedValue<T> {
  data: T | null;
  at: number | null;
}

function cacheKey(name: string, actorId: string | null): string {
  return `${actorId ?? 'anonymous'}:${name}`;
}

function cachedValue<T>(name: string, actorId: string | null): CachedValue<T> {
  if (actorId === null) return { data: null, at: null };
  const cached = readCached<T>(name, actorId, CACHE_HORIZON_MS);
  return { data: cached?.data ?? null, at: cached?.at ?? null };
}

function shouldSkip(cached: CachedValue<unknown>, ttlMs: number): boolean {
  return cached.at !== null && ttlMs > 0 && Date.now() - cached.at < ttlMs;
}

function useInitialCachedValue<T>(name: string, actorId: string | null, key: string): CachedValue<T> {
  const initial = useRef<{ key: string; value: CachedValue<T> } | null>(null);
  if (initial.current === null) initial.current = { key, value: cachedValue<T>(name, actorId) };
  return initial.current.value;
}

function useMountedFlag() {
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  return isMountedRef;
}

interface DataIdentity {
  name: string;
  actorId: string | null;
}

function useDataIdentity(name: string, actorId: string | null) {
  const bootedWithoutActor = useRef(actorId === null).current;
  const [identity, setIdentity] = useState<DataIdentity>({ name, actorId });
  const adoptsBootRead = bootedWithoutActor && identity.actorId === null && actorId !== null;
  const isCurrent = identity.name === name && (identity.actorId === actorId || adoptsBootRead);
  return { isCurrent, setIdentity };
}

export function useLocalCachedData<T>(input: {
  name: string;
  loader: () => Promise<T>;
  ttlMs: number;
}): AsyncData<T> {
  const { name, loader, ttlMs } = input;
  const actorId = useSessionOrNull()?.participant?.id ?? null;
  const key = cacheKey(name, actorId);
  const initialValue = useInitialCachedValue<T>(name, actorId, key);
  const [data, setData] = useState<T | null>(initialValue.data);
  // The boot request may resolve before the actor; any later actor or route switch hides old data.
  const { isCurrent: isCurrentIdentity, setIdentity } = useDataIdentity(name, actorId);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(initialValue.data === null);
  const activeKey = useRef(key);
  activeKey.current = key;
  const isMountedRef = useMountedFlag();

  const run = useCallback(async () => {
    try {
      const result = await loader();
      if (!isMountedRef.current || activeKey.current !== key) return;
      setData(result);
      setIdentity({ name, actorId });
      setError(null);
      if (actorId !== null) writeCached(name, actorId, result);
    } catch (caught) {
      if (isMountedRef.current && activeKey.current === key) setError(describeError(caught));
    } finally {
      if (isMountedRef.current && activeKey.current === key) setIsLoading(false);
    }
  }, [actorId, isMountedRef, key, loader, name, setIdentity]);

  useEffect(() => {
    const cached = cachedValue<T>(name, actorId);
    setData(cached.data);
    setIdentity({ name, actorId });
    setError(null);
    setIsLoading(cached.data === null);
    if (shouldSkip(cached, ttlMs)) return;
    void run();
  }, [actorId, key, name, run, setIdentity, ttlMs]);

  // A parameter or real actor change is unknown until its own cache/read lands.
  return {
    data: isCurrentIdentity ? data : null,
    error: isCurrentIdentity ? error : null,
    isLoading: !isCurrentIdentity || isLoading,
    reload: () => void run(),
  };
}
