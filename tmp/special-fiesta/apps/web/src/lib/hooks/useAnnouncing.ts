import { useCallback, useState } from 'react';
import type { AnnouncementView } from '@psd/contracts';
import {
  createAnnouncement,
  listAnnouncements,
  retractAnnouncement,
} from '../api/announcements.js';
import { describeError, useAsyncData } from './useAsyncData.js';

/**
 * ADR-074 — composing and retracting announcements, for the superadmin console.
 *
 * The list is re-read after every write rather than patched locally: there is one console, the list is
 * short, and the server's answer is the one that includes another superadmin's announcement made a
 * moment ago. Optimism buys nothing here and would hide that.
 */
export interface Announcing {
  announcements: AnnouncementView[];
  isLoading: boolean;
  loadError: string | null;
  isSending: boolean;
  error: string | null;
  send: (body: string) => void;
  retract: (id: string) => void;
}

export function useAnnouncing(): Announcing {
  const list = useAsyncData(listAnnouncements);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = list.reload;

  const run = useCallback(
    (work: () => Promise<unknown>) => {
      setIsSending(true);
      setError(null);
      void work()
        .then(() => reload())
        .catch((cause: unknown) => setError(describeError(cause)))
        .finally(() => setIsSending(false));
    },
    [reload],
  );

  const send = useCallback((body: string) => run(() => createAnnouncement(body)), [run]);
  const retract = useCallback((id: string) => run(() => retractAnnouncement(id)), [run]);

  return {
    announcements: list.data?.announcements ?? [],
    isLoading: list.isLoading,
    loadError: list.error,
    isSending,
    error,
    send,
    retract,
  };
}
