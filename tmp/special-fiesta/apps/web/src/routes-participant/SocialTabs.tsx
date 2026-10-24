import { NavLink } from 'react-router-dom';
import { AlertLed } from '../components/participant/AlertLed.js';
import { useAlerts } from '../components/participant/AlertsProvider.js';

/**
 * The Social tab's segmented control (ADR-046).
 *
 * Both chat and the photo gallery live under one bottom-bar tab rather than two, because the
 * bar was already five tabs wide: at 320 px a sixth leaves 53 px per target, which the 26 px
 * icon and the 8 px pixel label still fit, and a seventh does not.
 *
 * The control hides itself while there is only one segment, so a half-built Social tab shows
 * the room rather than a switch with nothing to switch to.
 *
 * ADR-125 — each segment carries its own LED. The bottom bar's Social dot is the OR of the two,
 * which tells a participant to come here but not which half to look in; without a dot per
 * segment the gallery's new photo would send people into the chat room and back out again.
 */

export const SOCIAL_TABS: { to: string; label: string; feed: 'chat' | 'gallery' }[] = [
  { to: '/social/chat', label: 'Chat', feed: 'chat' },
  { to: '/social/photos', label: 'Photos', feed: 'gallery' },
];

const LED_LABELS = {
  chat: 'Unread chat messages',
  gallery: 'New photos',
} as const;

export function SocialTabs() {
  const { chatUnread, galleryUnread } = useAlerts();
  if (SOCIAL_TABS.length < 2) return null;
  const unread = { chat: chatUnread, gallery: galleryUnread };

  return (
    <nav className="gb-segments" aria-label="Social sections">
      {SOCIAL_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} data-testid="social-tabs__link">
          {tab.label}
          <AlertLed show={unread[tab.feed]} label={LED_LABELS[tab.feed]} />
        </NavLink>
      ))}
    </nav>
  );
}
