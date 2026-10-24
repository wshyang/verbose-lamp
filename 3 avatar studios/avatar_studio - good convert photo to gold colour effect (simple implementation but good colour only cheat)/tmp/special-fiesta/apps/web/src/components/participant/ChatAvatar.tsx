import { AvatarPeek } from './AvatarPeek.js';
import { usePerson } from './PeopleProvider.js';

/**
 * ADR-202 — the face beside a name in a chat room.
 *
 * A room holds an id, not a person (ADR-046), so this resolves one and hands it to the same
 * `AvatarPeek` the team roster and the leaderboard use. Reusing that component rather than
 * writing a chat-flavoured one is the point: hover-to-peek on a mouse and tap-to-peek on a
 * phone are decided once, in one place, and a room cannot drift away from a roster.
 *
 * The slot is always the same width whatever is in it. A list in which some rows are indented
 * by a face and others are not reads as broken rather than as varied, and the three things
 * that can occupy it — a participant, a staff announcement, a person not yet fetched — are
 * all momentary or mixed in with each other down a single scroll.
 */

/** 32 px: the art is 64×64 (ADR-026), so a half multiple keeps every cell on a pixel boundary. */
const CHAT_AVATAR_SIZE = 32;

export function ChatAvatar({ participantId }: { participantId: string | null }) {
  const person = usePerson(participantId);

  /*
   * A facilitator or superadmin speaking in the global room. They have no participant and no
   * avatar, and inventing one for them would be a lie about who is in the room — but the slot
   * still holds its width, and a mark that is visibly not a face says "this is the organisers"
   * before the STAFF badge at the other end of the row has been read.
   */
  if (participantId === null) {
    return (
      <span
        className="gb-chat-avatar gb-chat-avatar--staff"
        data-testid="chat-avatar__staff"
        aria-hidden="true"
      />
    );
  }

  /*
   * Known id, person not here yet — or never arriving, if the directory could not place them.
   * An empty slot of the right size, because the alternative is a room whose every line jumps
   * sideways a moment after it is read.
   */
  if (person === null) {
    return (
      <span
        className="gb-chat-avatar gb-chat-avatar--pending"
        data-testid="chat-avatar__pending"
        aria-hidden="true"
      />
    );
  }

  return (
    <span className="gb-chat-avatar" data-testid="chat-avatar">
      <AvatarPeek person={person} size={CHAT_AVATAR_SIZE} />
    </span>
  );
}
