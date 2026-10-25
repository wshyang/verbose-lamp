import { ChatAvatar } from '../components/participant/ChatAvatar.js';
import { Fragment, useCallback } from 'react';
import { CHAT_BODY_MAX_LENGTH } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { useAlerts } from '../components/participant/AlertsProvider.js';
import { SocialPausedNotice } from '../components/participant/SocialPausedNotice.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { SocialTabs } from './SocialTabs.js';
import { formatTime } from '../lib/format.js';
import { NewMessagesDivider } from '../components/participant/NewMessagesDivider.js';
import { useChatRoom } from '../lib/hooks/useChatRoom.js';
import { useNewMessageBoundary } from '../lib/hooks/useNewMessageBoundary.js';
import { useLiveList } from '../lib/hooks/useLiveList.js';
import { useLoadOlder } from '../lib/hooks/useLoadOlder.js';
import { useSubmitOnEnter } from '../lib/hooks/useSubmitOnEnter.js';

/**
 * The chat room (ADR-046). Everything here is presentation: the hook decides what is in the
 * list, whether the connection is live, and what happens on send.
 *
 * Message bodies are rendered as text and nothing else. React escapes by default, so a
 * participant typing markup sees their own markup rather than the room running it — which is
 * the whole of the XSS story for v1, and the reason there is no rich text.
 */
export function ChatPanel() {
  // ADR-083/125 — opening the room marks the feed read, which is what clears the Social dot.
  const { markFeedRead } = useAlerts();
  const onRead = useCallback(() => markFeedRead('chat'), [markFeedRead]);
  const room = useChatRoom(onRead);
  /*
   * ADR-163 — read BEFORE `onRead` has had a chance to fire. `useChatRoom` clears the dot as
   * the room absorbs, which advances the very mark this needs, so the hook freezes it on the
   * first render and holds it for the visit.
   *
   * ADR-267 — `settled` hands the hook the moment the entry load has landed: only then does
   * it pin the horizon its line is drawn against, so a line absorbed during the visit —
   * above all the reader's own just-sent one — can never draw a "new messages" rule.
   */
  const boundary = useNewMessageBoundary('chat', room.messages, room.entrySettled);
  const isEmpty = room.messages.length === 0;
  const roomList = useLiveList<HTMLUListElement>();
  // ADR-065 — the room opens on the newest fifty; this reaches further back as the reader scrolls.
  const olderSentinel = useLoadOlder({
    oldestId: room.messages[0]?.id,
    canLoad: room.hasOlder && !room.isLoadingOlder && !room.isLoading,
    load: room.loadOlder,
  });
  // ADR-085 — the keyboard and the button ask the same question, so neither can bypass the
  // other. The hook answers it once; neither caller gets to form its own opinion.
  const sendOnEnter = useSubmitOnEnter({ canSend: room.canSend, send: room.submit });

  /*
   * ADR-118 — the tabs stay, the room does not. Returning early rather than threading a flag
   * through the list, the composer and the load-older button: when the room is closed there is
   * nothing below this line worth rendering, and a composer behind a notice invites typing into
   * a void.
   */
  if (room.isPaused) {
    return (
      <GameboyShell title="CHAT" subtitle="One room, everyone">
        <SocialTabs />
        <SocialPausedNotice />
      </GameboyShell>
    );
  }

  return (
    <GameboyShell title="CHAT" subtitle="One room, everyone">
      <SocialTabs />
      <section className="gb-panel">
        {room.isLive ? null : (
          <p className="gb-hint" data-testid="chat-panel__catching-up">
            Catching up every minute — live updates are off.
          </p>
        )}
        <StateMessage
          isLoading={room.isLoading}
          error={room.error}
          isEmpty={isEmpty}
          emptyText={room.emptyText}
          testId="chat-panel"
        />
        {/*
          ADR-065 — above the list, so it enters view first. The button is not decoration: an
          `IntersectionObserver` is an optimisation, and a reader on a browser without one, or using
          a keyboard rather than a scroll gesture, still needs a way back through the history.
        */}
        {room.hasOlder && !isEmpty ? (
          <div ref={olderSentinel} className="gb-row">
            <button
              type="button"
              className="gb-button gb-button--small gb-button--secondary"
              onClick={room.loadOlder}
              disabled={room.isLoadingOlder}
              data-testid="chat-panel__load-older"
            >
              {room.isLoadingOlder ? 'Loading earlier messages…' : 'Earlier messages'}
            </button>
          </div>
        ) : null}
        <ul className="gb-list gb-chat-list" ref={roomList}>
          {room.messages.map((message) => (
            <Fragment key={message.id}>
              {message.id === boundary.boundaryId ? (
                <NewMessagesDivider innerRef={boundary.boundaryRef} />
              ) : null}
            <li
              data-testid="chat-panel__message"
              data-live-key={message.id}
              data-live-signature={message.body}
            >
              <div className="gb-row gb-row--between">
                <span className="gb-chat-author">
                  {/*
                    ADR-202 — the id the room has always carried, finally spent on something.
                    Null for a facilitator or superadmin, which is the whole of how the slot
                    knows to draw a staff mark rather than a face.
                  */}
                  <ChatAvatar participantId={message.authorParticipantId} />
                  <strong>{message.authorLabel}</strong>
                </span>
                {message.authorType === 'participant' ? (
                  <span className="gb-badge">{message.clusterCode}</span>
                ) : (
                  <span className="gb-badge gb-badge--staff">STAFF</span>
                )}
              </div>
              <p className="gb-chat-body">{message.body}</p>
              <span className="gb-hint">{formatTime(message.createdAt)}</span>
            </li>
            </Fragment>
          ))}
        </ul>
      </section>

      <section className="gb-panel gb-chat-composer">
        <label className="gb-label" htmlFor="chat-body">
          Say something
        </label>
        <textarea
          id="chat-body"
          className="gb-input"
          rows={2}
          maxLength={CHAT_BODY_MAX_LENGTH}
          value={room.draft}
          onChange={(event) => room.setDraft(event.target.value)}
          // ADR-085 — the phone keyboard's send key posts the line; Shift+Enter breaks it instead.
          onKeyDown={sendOnEnter}
          enterKeyHint="send"
          data-testid="chat-panel__draft"
        />
        {room.sendError ? (
          <span className="gb-inline-error" role="alert" data-testid="chat-panel__send-error">
            {room.sendError}
          </span>
        ) : null}
        <button
          type="button"
          className="gb-button"
          disabled={!room.canSend}
          onClick={room.submit}
          data-testid="chat-panel__send"
        >
          {room.isSending ? 'Sending…' : 'Send'}
        </button>
      </section>
    </GameboyShell>
  );
}
