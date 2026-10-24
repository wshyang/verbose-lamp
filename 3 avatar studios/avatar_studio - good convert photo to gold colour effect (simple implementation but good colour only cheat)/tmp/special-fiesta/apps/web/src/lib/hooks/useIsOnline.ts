import { useEffect, useState } from 'react';

/**
 * ADR-074 — is the browser online, for a surface that has no sync queue.
 *
 * The facilitator shell gets this from `useSync`, but that state belongs to the offline scan queue and
 * lives behind `SyncProvider`, which only the facilitator tree mounts. The superadmin console has no
 * queue and no provider, so reaching for `useSync` there threw on render — a coupling that was wrong
 * as well as broken: "can I send an announcement right now" is a question about connectivity, not
 * about whether a station has scans waiting.
 *
 * `navigator.onLine` is a weak signal — it reports the link, not whether the server is reachable — but
 * the announcement guard only needs to catch the obvious case, and the send itself still fails loudly
 * if the link lies.
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return isOnline;
}
