import { useCallback, useRef, useState } from 'react';
import { useSpectacle, type EffectHandle, type EffectId, type EffectParamsMap } from '@/features/spectacle';

export type EffectRun = <K extends EffectId>(key: string, id: K, params: EffectParamsMap[K]) => void;

/** Plays effects under a key, tracks which keys are live, and lets a key be stopped. */
export function useEffectRunner() {
  const { play, stopAll } = useSpectacle();
  const [playing, setPlaying] = useState<ReadonlySet<string>>(new Set());
  const handles = useRef(new Map<string, EffectHandle>());

  const run = useCallback<EffectRun>(
    (key, id, params) => {
      const handle = play(id, params);
      handles.current.get(key)?.stop();
      handles.current.set(key, handle);
      setPlaying((prev) => new Set(prev).add(key));
      void handle.finished.then(() => {
        if (handles.current.get(key) !== handle) return;
        handles.current.delete(key);
        setPlaying((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
    },
    [play],
  );

  const stopKey = useCallback((key: string) => handles.current.get(key)?.stop(), []);
  const isLive = useCallback((key: string) => handles.current.has(key), []);

  const toggle = useCallback<EffectRun>(
    (key, id, params) => {
      if (isLive(key)) stopKey(key);
      else run(key, id, params);
    },
    [run, stopKey, isLive],
  );

  return { playing, run, toggle, stopKey, stopAll };
}

export type EffectRunner = ReturnType<typeof useEffectRunner>;
