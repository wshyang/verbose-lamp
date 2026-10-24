import { Fragment, useCallback } from 'react';
import { CHAT_BODY_MAX_LENGTH } from '@psd/contracts';
import type { TeamChatMessageView } from '@psd/contracts';
import { StateMessage } from '../shared/StateMessage.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import { useConfirm } from '../../lib/hooks/useConfirm.js';
import { formatTime, typingLine } from '../../lib/format.js';
import { useTeamChatRoom, type TeamChatRoom } from '../../lib/hooks/useTeamChatRoom.js';
import { useLiveList } from '../../lib/hooks/useLiveList.js';
import { useLoadOlder } from '../../lib/hooks/useLoadOlder.js';
import { useSubmitOnEnter } from '../../lib/hooks/useSubmitOnEnter.js';
import { useNewMessageBoundary } from '../../lib/hooks/useNewMessageBoundary.js';
import { NewMessagesDivider } from './NewMessagesDivider.js';
import { ChatAvatar } from './ChatAvatar.js';
import { KebabMenu, type KebabOption } from './KebabMenu.js';
import { useAlerts } from './AlertsProvider.js';

/**
 * A team's room, inside the team page (ADR-063).
 *
 * A section rather than a surface of its own, because it belongs to the team the way the roster
 * does. Everything here is presentation: the hook decides what is in the list and what sending does.
 *
 * Bodies are rendered as text and nothing else. React escapes by default, so a participant typing
 * markup sees their own markup rather than the room running it — the whole of the XSS story, and the
 * reason there is no rich text.
 */

/**
 * Roster events read as history, not conversation, so they are rendered as a sentence rather than as
 * somebody speaking. The sentence is built here from the row's `kind` because the row deliberately
 * stores no body: user-facing copy stays in the app, not in the database.
 *
 * ADR-154 — a table rather than the ternary this used to be. With three staff kinds added, a
 * ternary's else-branch would have quietly labelled every one of them "left the team", which is
 * exactly the false record the new kinds exist to avoid. A missing entry here is a type error.
 */
const EVENT_SENTENCE: Record<Exclude<TeamChatMessageView['kind'], 'said'>, (who: string) => string> =
  {
    joined: (who) => `${who} joined the team`,
    left: (who) => `${who} left the team`,
    // "An organiser" rather than a name: the room is told what happened to them, and the
    // identity of the staff member is not theirs to have (see ADR-154 §8).
    staff_added: (who) => `${who} was added by an organiser`,
    staff_removed: (who) => `${who} was removed by an organiser`,
    captain_changed: (who) => `${who} is now captain`,
  };

function eventSentence(message: TeamChatMessageView): string {
  if (message.kind === 'said') return message.body ?? '';
  return EVENT_SENTENCE[message.kind](message.authorLabel);
}

/**
 * ADR-155 — the hide, offered only to the captain and only on a spoken line.
 * ADR-258 — behind the message's kebab instead of a big button under every line.
 * ADR-259 — the kebab sits one line down from the title pill, at the message's far
 * right. The rule and the confirmation are unchanged.
 *
 * Irreversible from this surface: there is no unhide, because an unhide would need a view of
 * the hidden rows and the one actor who could hold that view is barred from the room. So it
 * asks first (ADR-027), and the question names what cannot be taken back.
 */
function messageOptions(props: {
  message: TeamChatMessageView;
  room: TeamChatRoom;
  ask: Ask;
  isCaptain: boolean;
}): KebabOption[] {
  const { message, room, ask, isCaptain } = props;
  // Both conditions live here rather than at the call site: whether a line can be hidden is
  // this function's question, and asking half of it in the list would split one rule in two.
  if (!isCaptain || message.kind !== 'said') return [];
  return [
    {
      label: 'Hide',
      testId: 'team-chat__hide',
      danger: true,
      onSelect: () =>
        ask({
          title: 'Hide this message?',
          body: `It disappears for everyone on the team, and it cannot be put back. ${message.authorLabel} is not told.`,
          confirmLabel: 'Hide it',
          isDanger: true,
          run: () => room.hide(message.id),
        }),
    },
  ];
}

/**
 * One line in the room: somebody speaking, or the room's own history. Its own component since
 * ADR-155 gave it a third thing to decide — whether this reader may moderate it — and a list
 * item that answers three questions inline is the shape the complexity limit exists to catch.
 */
function MessageRow(props: {
  message: TeamChatMessageView;
  room: TeamChatRoom;
  ask: Ask;
  isCaptain: boolean;
}) {
  const { message, room, ask, isCaptain } = props;
  const options = messageOptions({ message, room, ask, isCaptain });
  return (
    <li
      data-testid="team-chat__message"
      data-live-key={message.id}
      data-live-signature={message.body ?? message.kind}
    >
      {message.kind === 'said' ? (
        <>
          <div className="gb-row gb-row--between">
            <span className="gb-chat-author">
              {/*
                ADR-202 — spoken lines only. A roster event below is the room's own history
                rather than somebody speaking, and giving "Wei_Ling joined the team" a face
                would make the team's record look like a remark.
              */}
              <ChatAvatar participantId={message.authorParticipantId} />
              <strong>{message.authorLabel}</strong>
            </span>
            <span className="gb-badge">{message.title}</span>
          </div>
          <div className="gb-row" style={{ alignItems: 'flex-start' }}>
            <p className="gb-chat-body" style={{ flex: 1 }}>{message.body}</p>
            {/* ADR-259 — one line down from the title pill, at the message's far right. */}
            <KebabMenu
              label={`Actions for the message from ${message.authorLabel}`}
              testId="team-chat__message-menu"
              options={options}
            />
          </div>
        </>
      ) : (
        <p className="gb-chat-event" data-testid="team-chat__event">
          {eventSentence(message)}
        </p>
      )}
      <span className="gb-hint">{formatTime(message.createdAt)}</span>
    </li>
  );
}

type Ask = ReturnType<typeof useConfirm>['ask'];

/**
 * A refused hide, said out loud. The two refusals a captain can actually provoke are a roster
 * line (409) and a message that has already gone (404), and both deserve a sentence: a button
 * that silently does nothing reads as a broken button, and the next thing tried is the
 * message itself.
 */
function HideError({ error }: { error: string | null }) {
  if (error === null) return null;
  return (
    <p className="gb-inline-error" role="alert" data-testid="team-chat__hide-error">
      {error}
    </p>
  );
}

export function TeamChatPanel({ teamId, isCaptain }: { teamId: string; isCaptain: boolean }) {
  // The panel is what knows about both the context and the hook: a hook may not import a component.
  const { markFeedRead } = useAlerts();
  // ADR-125 — "I have seen this room up to its watermark", which is what clears the dot.
  const onRead = useCallback(() => markFeedRead('teamChat'), [markFeedRead]);
  const room = useTeamChatRoom(onRead, teamId);
  /*
   * ADR-163 — the same line the global room draws, from the same device-side mark. Frozen on
   * the first render, because `onRead` above is about to advance it. ADR-267 — settled with
   * the entry load, as in the global room, so nothing absorbed during the visit (the
   * reader's own line included) can draw it.
   */
  const boundary = useNewMessageBoundary('teamChat', room.messages, room.entrySettled);
  const confirm = useConfirm();
  const isEmpty = room.messages.length === 0;
  const roomList = useLiveList<HTMLUListElement>();
  // ADR-087 — the room opens on the newest fifty; this reaches further back as the reader scrolls.
  const olderSentinel = useLoadOlder({
    oldestId: room.messages[0]?.id,
    canLoad: room.hasOlder && !room.isLoadingOlder && !room.isLoading,
    load: room.loadOlder,
  });
  const tooLong = room.draft.length > CHAT_BODY_MAX_LENGTH;
  const canSend = !room.isSending && room.draft.trim() !== '' && !tooLong;
  // ADR-085 — the keyboard and the button ask the same question, so neither can bypass the other.
  const sendOnEnter = useSubmitOnEnter({ canSend, send: room.submit });

  return (
    <section className="gb-panel">
      <h2>Team chat</h2>
      <ConfirmDialog confirm={confirm} />
      <HideError error={room.hideError} />
      {room.isLive ? null : (
        <p className="gb-hint" data-testid="team-chat__catching-up">
          Catching up — live updates are off.
        </p>
      )}
      <StateMessage
        isLoading={room.isLoading}
        error={room.error}
        isEmpty={isEmpty}
        emptyText={room.emptyText}
        testId="team-chat"
      />
      {/*
        A button as well as the sentinel, and not only for show: `IntersectionObserver` is an
        optimisation, and a reader on a browser without one, or using a keyboard rather than a scroll
        gesture, still needs a way back through the history.
      */}
      {room.hasOlder && !isEmpty ? (
        <div ref={olderSentinel} className="gb-row">
          <button
            type="button"
            className="gb-button gb-button--small gb-button--secondary"
            onClick={room.loadOlder}
            disabled={room.isLoadingOlder}
            data-testid="team-chat__load-older"
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
            <MessageRow
              message={message}
              room={room}
              ask={confirm.ask}
              isCaptain={isCaptain}
            />
          </Fragment>
        ))}
      </ul>

      {/*
        ADR-146 — always rendered, usually empty. A line that comes and goes would shove the
        message list up and down under the eyes of whoever is reading it, which costs the
        room more than the indicator is worth.
      */}
      <p className="gb-hint gb-typing" aria-live="polite" data-testid="team-chat__typing">
        {typingLine(room.typingLabels)}
      </p>

      <label className="gb-label" htmlFor="team-chat-body">
        Say something to your team
      </label>
      <textarea
        id="team-chat-body"
        className="gb-input"
        rows={2}
        maxLength={CHAT_BODY_MAX_LENGTH}
        value={room.draft}
        onChange={(event) => room.setDraft(event.target.value)}
        // ADR-085 — the phone keyboard's send key posts the line; Shift+Enter breaks it instead.
        onKeyDown={sendOnEnter}
        enterKeyHint="send"
        data-testid="team-chat__draft"
      />
      {room.sendError ? (
        <span className="gb-inline-error" role="alert" data-testid="team-chat__send-error">
          {room.sendError}
        </span>
      ) : null}
      <button
        type="button"
        className="gb-button"
        disabled={!canSend}
        onClick={room.submit}
        data-testid="team-chat__send"
      >
        {room.isSending ? 'Sending…' : 'Send'}
      </button>
    </section>
  );
}
