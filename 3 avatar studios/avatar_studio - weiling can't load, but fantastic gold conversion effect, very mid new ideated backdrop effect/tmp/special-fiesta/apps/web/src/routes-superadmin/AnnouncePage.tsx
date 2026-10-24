import { useState } from 'react';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { ANNOUNCEMENT_BODY_MAX_LENGTH } from '@psd/contracts';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatTime } from '../lib/format.js';
import { useAnnouncing } from '../lib/hooks/useAnnouncing.js';
import { useIsOnline } from '../lib/hooks/useIsOnline.js';
import { useSubmitOnEnter } from '../lib/hooks/useSubmitOnEnter.js';

/**
 * S — announcing to the beach (ADR-074). Superadmin only.
 *
 * **Send is disabled while offline, and that is the point rather than politeness.** The rest of the
 * staff app is deliberately offline-tolerant — a station queues its scans and syncs later (DC-004) —
 * but an announcement is the one message where late delivery is worse than none: "finals in fifteen
 * minutes" arriving an hour afterwards actively misleads people. So it is refused at the door, with the
 * reason stated in place rather than left to be guessed at.
 *
 * Connectivity comes from `useIsOnline`, not from `useSync`: the latter is the station queue's state and
 * lives behind `SyncProvider`, which the superadmin tree does not mount — reaching for it here threw on
 * render, and was the wrong question anyway.
 */
export function AnnouncePage() {
  const announcing = useAnnouncing();
  const isOnline = useIsOnline();
  const [draft, setDraft] = useState('');
  const tooLong = draft.length > ANNOUNCEMENT_BODY_MAX_LENGTH;
  const canSend = isOnline && !announcing.isSending && draft.trim() !== '' && !tooLong;
  const send = () => {
    announcing.send(draft.trim());
    setDraft('');
  };
  // ADR-085 — Enter announces, Shift+Enter breaks the line. Same guard as the button, including
  // the offline refusal: an announcement sent late is worse than none.
  const sendOnEnter = useSubmitOnEnter({ canSend, send });

  return (
    <AdminShell title="Announce">
      <section className="console-panel">
        <h2>Say something to everybody</h2>
        <p className="console-muted">
          Appears as a toast over every participant&apos;s screen and stays there until they tap it.
        </p>
        <ConsoleField id="announce-body" label="Announcement" topic="announceBody">
        <textarea
          id="announce-body"
          className="console-input"
          rows={3}
          maxLength={ANNOUNCEMENT_BODY_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={sendOnEnter}
          enterKeyHint="send"
          data-testid="announce__body"
        />
          </ConsoleField>
        {isOnline ? null : (
          <span className="console-badge console-danger" data-testid="announce__offline">
            Offline — an announcement sent late is worse than none, so this waits.
          </span>
        )}
        {announcing.error ? (
          <p className="console-danger" role="alert" data-testid="announce__error">
            {announcing.error}
          </p>
        ) : null}
        <button
          type="button"
          className="console-button"
          disabled={!canSend}
          data-testid="announce__send"
          onClick={send}
        >
          {announcing.isSending ? 'Sending…' : 'Announce'}
        </button>
      </section>

      <section className="console-panel">
        <h2>Already announced</h2>
        <StateMessage
          isLoading={announcing.isLoading}
          error={announcing.loadError}
          isEmpty={announcing.announcements.length === 0}
          emptyText="Nothing announced yet."
          testId="announce-list"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>Announcement</th>
              <th>By</th>
              <th>When</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {announcing.announcements.map((announcement) => (
              <tr key={announcement.id} data-testid="announce__row">
                <td>{announcement.body}</td>
                <td>{announcement.authorLabel}</td>
                <td>{formatTime(announcement.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="console-button console-button--ghost"
                    data-testid="announce__retract"
                    onClick={() => announcing.retract(announcement.id)}
                  >
                    Retract
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
