import { NavLink } from 'react-router-dom';

/**
 * The ball tab's segmented control (ADR-089), same pattern as SOCIAL_TABS (ADR-046): one
 * bottom-bar icon, now three rooms. Results is what happened; Line-ups is who plays next — the
 * question every bench is asking once a schedule is live. Unlike the Social tab it was
 * born with both segments, so there is no single-segment hiding rule here.
 *
 * ADR-177 — Agenda is the third. It arrived here rather than as a seventh bottom-bar tab for
 * the reason ADR-046 declined a seventh in the first place: at 320 px a seventh column is
 * 45.7 px, which caps every nav label at five characters, and "Social" is six on purpose. The
 * three segments are also genuinely the same question asked at three ranges — what happened,
 * what is next, and what the whole afternoon is doing.
 *
 * Three fits: `gb-segments` divides the row evenly, and the widest label ("Line-ups", eight
 * characters of 9 px pixel type) is 72 px inside a ~96 px column at the 320 px floor.
 */

export const FEED_TABS: { to: string; label: string }[] = [
  { to: '/feed/results', label: 'Results' },
  { to: '/feed/lineups', label: 'Line-ups' },
  { to: '/feed/agenda', label: 'Agenda' },
];

export function FeedTabs() {
  return (
    <nav className="gb-segments" aria-label="Match feed sections">
      {FEED_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} data-testid="feed-tabs__link">
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
