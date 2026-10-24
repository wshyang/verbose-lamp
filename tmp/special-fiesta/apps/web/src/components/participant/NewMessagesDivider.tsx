import type { Ref } from 'react';

/**
 * ADR-163 — "new messages", drawn across the room at the point this reader left off.
 *
 * A list item rather than a sibling of the list, because it lives *between* two `<li>`s and a
 * `<ul>` may only contain list items — a `<div>` here is invalid markup that some screen
 * readers drop and others announce in the wrong place.
 *
 * `role="separator"` is what it is, and the `aria-label` carries the meaning: the visible text
 * is decorative-adjacent (the rules either side are drawn in CSS), and a reader arriving on it
 * with a screen reader should hear what the line means rather than two dashes.
 *
 * One component for both rooms on purpose. The global room and the team room have drifted
 * apart more than once — ADR-153's hide frame reached one and not the other — and a boundary
 * that looked different in the two places would be read as two different features.
 */
export function NewMessagesDivider({ innerRef }: { innerRef: Ref<HTMLLIElement> }) {
  return (
    <li
      ref={innerRef}
      className="gb-new-messages"
      role="separator"
      aria-label="New messages below this line"
      data-testid="new-messages-divider__rule"
    >
      new messages
    </li>
  );
}
