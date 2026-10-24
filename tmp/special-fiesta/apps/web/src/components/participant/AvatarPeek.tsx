import { useState } from 'react';
import type { ClusterCode } from '@psd/contracts';
import { Avatar } from './Avatar.js';

/**
 * ADR-062 — a 32 px avatar in a list, and who it belongs to.
 *
 * In a team roster or a leaderboard row the face is too small to recognise, and the nickname beside
 * it is the only thing identifying anybody. Tapping the avatar opens a card with the sprite at a size
 * worth looking at, plus the nickname, cluster and the energetic word they were given (ADR-061).
 *
 * The two input methods are handled in two different places on purpose. **Hover is CSS**, behind
 * `@media (hover: hover)`, so a mouse gets it for free and a touch screen never does — a phone that
 * synthesises hover events after a tap would otherwise open the card and immediately toggle it shut.
 * **Tap is this component's state.** The card itself dismisses on click, so the way out is the same
 * gesture as the way in, which is what a finger expects when there is no cursor to move away.
 */
export interface PeekPerson {
  nickname: string;
  clusterCode: ClusterCode;
  gender: 'male' | 'female';
  avatarVariant: number;
  avatarLook: string;
  avatarPhotoId?: string | null;
  title: string;
}

export function AvatarPeek(props: { person: PeekPerson; size: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { person } = props;

  return (
    <span className={isOpen ? 'gb-peek is-open' : 'gb-peek'}>
      <button
        type="button"
        className="gb-peek__trigger"
        data-testid="avatar-peek__open"
        aria-expanded={isOpen}
        aria-label={`Who is ${person.nickname}?`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Avatar person={person} size={props.size} />
      </button>
      <span
        className="gb-peek__card"
        data-testid="avatar-peek__card"
        role="tooltip"
        // Dismissing by tapping the card keeps the gesture symmetrical on a touch screen. It is a
        // span with a click handler rather than a button because it holds a name, a title and a
        // badge; the trigger above is the accessible control and this is its disclosure.
        onClick={() => setIsOpen(false)}
      >
        <Avatar person={person} size={96} />
        <span className="gb-peek__name" data-testid="avatar-peek__nickname">
          {person.nickname}
        </span>
        <span className="gb-peek__title" data-testid="avatar-peek__title">
          {person.title}
        </span>
        <span className="gb-badge" data-testid="avatar-peek__cluster">
          {person.clusterCode}
        </span>
      </span>
    </span>
  );
}
