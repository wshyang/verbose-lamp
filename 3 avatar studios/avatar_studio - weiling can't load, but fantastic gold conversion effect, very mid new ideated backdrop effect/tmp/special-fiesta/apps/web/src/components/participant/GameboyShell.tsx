import type { ReactNode } from "react";
import type { AnnouncementView } from "@psd/contracts";
import { NavLink, useLocation } from "react-router-dom";
import { useVenueTheme } from "../../themes/venueContext.js";
import { SpriteProvider } from "./SpriteProvider.js";
import { PeopleProvider } from "./PeopleProvider.js";
import { useAlerts } from "./AlertsProvider.js";
import { StreamHealth } from "./StreamHealth.js";
import { AlertLed } from "./AlertLed.js";
import { PixelMotif } from "./PixelMotif.js";
import { RoleMotif } from "./RoleMotif.js";
import type { SharedMotifName } from "../../lib/motifs.js";
import type { MotifRole } from "../../themes/types.js";

/**
 * Participant chrome (fds.md §5.5 "Gameboy/Pokémon"): a pixel title plate and a persistent
 * bottom nav that keeps the QR badge one tap away from anywhere (F25 / DC-006).
 *
 * The sprites are decoration (ADR-014) — every tab still carries its text label, and the
 * images are aria-hidden so nothing depends on recognising the art.
 */

/** A tab's picture is a sprite every venue draws, or a role the active venue fills (ADR-297). */
type NavIcon = { shared: SharedMotifName } | { role: MotifRole };

const NAV_ITEMS: {
  to: string;
  icon: NavIcon;
  label: string;
  alert?: AlertKind;
  /**
   * ADR-300 — extra path prefixes that also light this tab. React Router only lights a
   * NavLink under its own `to`, but two tabs own routes outside it: Teams sends a
   * participant who already has a team from `/teams` to `/team` (ADR-103), and Social's
   * Photos segment lives at `/social/photos`, not under `/social/chat`. Without the
   * alias those tabs showed no current-page highlight at all.
   */
  activeOn?: string[];
}[] = [
  { to: "/home", icon: { shared: "badge" }, label: "QR" },
  // ADR-063 — team chat is small, targeted and worth interrupting for.
  { to: "/teams", icon: { shared: "flag" }, label: "Teams", alert: "teamChat", activeOn: ["/team"] },
  { to: "/board", icon: { shared: "trophy" }, label: "Board" },
  // ADR-091 — the same LED, borrowed for "your team plays soon": the dot means "look in
  // here", and here the thing to look at is the Line-ups tab behind the Feed icon.
  { to: "/feed", icon: { shared: "volleyball" }, label: "Feed", alert: "upSoon" },
  // ADR-046 — one Social tab holds chat and (from ADR-047) the photo gallery. Two separate
  // tabs would make seven, and at 320 px seven targets are ~45 px each, which the 8 px pixel
  // labels no longer fit. `gb-nav` is a six-column grid to match.
  // ADR-083 — the global room lights this tab too, reversing ADR-063's original exclusion by
  // product call: same dot, same clear-on-open.
  // ADR-125 — and the gallery now lights it as well. One tab holds two feeds, so its dot is the
  // OR of both and the segmented control inside says which. A separate Photos tab would have
  // made the bar seven wide, which is the thing ADR-046 declined.
  { to: "/social/chat", icon: { role: "navSocial" }, label: "Social", alert: "social", activeOn: ["/social"] },
  { to: "/me", icon: { shared: "face" }, label: "Me" },
];

type AlertKind = 'teamChat' | 'social' | 'upSoon';

interface UnreadState {
  teamChatUnread: boolean;
  chatUnread: boolean;
  galleryUnread: boolean;
  teamUpSoon: boolean;
}

/**
 * Which dot a nav item shows, and what a screen reader hears when it does.
 *
 * ADR-125 — the Social label names both feeds rather than saying "unread chat messages" when
 * the thing that lit it was a photo. A dot that lies about what is behind it is worse than no
 * dot, because the reader opens the wrong segment and concludes the LED is broken.
 */
function alertStateFor(alert: AlertKind | undefined, unread: UnreadState): {
  show: boolean;
  label: string;
} {
  if (alert === 'teamChat') return { show: unread.teamChatUnread, label: 'Unread team messages' };
  if (alert === 'social') {
    return {
      show: unread.chatUnread || unread.galleryUnread,
      label: 'New chat messages or photos',
    };
  }
  if (alert === 'upSoon') return { show: unread.teamUpSoon, label: 'Your team plays soon' };
  return { show: false, label: '' };
}

/**
 * ADR-074/183 — a staff announcement, over the banner, until it is clicked.
 *
 * Persistent rather than timed: an announcement is the one message at this event that has to be
 * read, and a toast that fades is a toast the participant can miss while their phone is in a
 * pocket.
 *
 * ADR-183 reverses the "one at a time" half of ADR-074. Showing only `announcements[0]` meant the
 * OLDEST undismissed message sat on top of every newer one, so the most recent thing the
 * organisers said was the thing a participant could not see — the exact opposite of what a
 * notification is for. They stack now; `AlertStack` owns the layout.
 *
 * It is a button, not a div with a handler: the whole thing is the dismiss control, so it has to
 * be reachable by keyboard and announced as pressable.
 */
function AnnouncementToast(props: { announcement: AnnouncementView; onDismiss: () => void }) {
  return (
    <button
      type="button"
      className="gb-announce"
      data-testid="announcement-toast"
      onClick={props.onDismiss}
    >
      {/* ADR-103 — no author line: every announcement is the organisers speaking, and the
          account name "superadmin" meant nothing to a participant. The garland says who. */}
      <span className="gb-announce__garland" aria-hidden="true" />
      <span className="gb-announce__body" data-testid="announcement-toast__body">
        {props.announcement.body}
      </span>
      <span className="gb-announce__dismiss">Tap to dismiss</span>
    </button>
  );
}

/**
 * ADR-133 (B4) — the up-soon call, over the banner, in the same stack as the announcements.
 *
 * Deliberately silent: no sound and no vibration. The browser notification (ADR-091) already
 * reaches a pocketed phone, and a noise from a tab that is already open and being looked at is
 * the thing participants ask you to turn off. This is the visible half.
 *
 * Shown only for a fixture this browser has not already announced, which is what stops ADR-118's
 * restart button toasting three hundred phones with news they read ten minutes ago.
 *
 * ADR-183 — it no longer yields to an announcement. It used to return null whenever any
 * announcement was undismissed, on the reasoning that the two shared one overlay slot; there are
 * as many slots as there are alerts now, and this is the only one with a deadline.
 */
/** One tab's picture. Kept out of the JSX so the nav stays presentation-only (AGENTS-frontend §1). */
function NavMotif(props: { icon: NavIcon }) {
  return "role" in props.icon ? (
    <RoleMotif role={props.icon.role} size={26} className="gb-nav-icon" />
  ) : (
    <PixelMotif name={props.icon.shared} size={26} className="gb-nav-icon" />
  );
}

function UpSoonToast(props: { gamesAway: number | null; onDismiss: () => void }) {
  return (
    <button
      type="button"
      className="gb-announce gb-announce--upsoon"
      data-testid="upsoon-toast"
      onClick={props.onDismiss}
    >
      <span className="gb-announce__garland" aria-hidden="true" />
      <span className="gb-announce__body" data-testid="upsoon-toast__body">
        {upSoonCall(props.gamesAway)}
      </span>
      <span className="gb-announce__dismiss">Tap to dismiss</span>
    </button>
  );
}

/**
 * ADR-183 — every live alert, stacked downwards, none hiding another.
 *
 * The up-soon call is pinned to the TOP rather than taking its turn in arrival order, because it
 * is the only alert here with a deadline: it says "walk to your court now", and it expires by
 * itself whether or not it was read. An announcement is read-and-dismiss and keeps indefinitely,
 * so it can afford to wait a row. Announcements then run oldest to newest, which is both the
 * order they were said in and the order that puts the newest nearest the content.
 *
 * `max-height` with scroll on the container is the concession to ADR-074's original worry, which
 * was real: a 320 px screen buried under full-bleed banners hides the app they are about. The
 * cap means the stack can never take the whole screen, rather than the queue meaning only one
 * could ever be seen.
 */
function AlertStack() {
  const { announcements, dismissAnnouncement, upSoonToast, dismissUpSoon } = useAlerts();
  if (announcements.length === 0 && upSoonToast === null) return null;
  return (
    <div className="gb-announce-stack" data-testid="alert-stack">
      {upSoonToast === null ? null : (
        <UpSoonToast gamesAway={upSoonToast.gamesAway} onDismiss={dismissUpSoon} />
      )}
      {announcements.map((announcement) => (
        <AnnouncementToast
          key={announcement.id}
          announcement={announcement}
          onDismiss={() => dismissAnnouncement(announcement.id)}
        />
      ))}
    </div>
  );
}

/**
 * The same three cases `LineupsPage` draws, said shorter — a toast is read at a glance and over
 * the top of whatever the participant was doing. The court is not named here on purpose: the
 * suggestion can move between this frame and the walk, and the Lineups page is where it is live.
 */
function upSoonCall(gamesAway: number | null): string {
  if (gamesAway === 0) return 'Your team is up next — head to your court!';
  if (gamesAway === 1) return 'Your team plays after one more match. Stay close!';
  return 'Your team plays soon. Stay close!';
}

function ShellChrome(props: {
  title: string;
  subtitle?: string | undefined;
  showNav?: boolean;
  children: ReactNode;
}) {
  const showNav = props.showNav !== false;
  const { teamChatUnread, chatUnread, galleryUnread, teamUpSoon } = useAlerts();
  const { Scene } = useVenueTheme();
  const { pathname } = useLocation();
  // ADR-300 — React Router sets aria-current only under a tab's own `to`; the alias
  // prefixes carry the same highlight via `is-current` (styles/gameboy.css).
  const navItems = NAV_ITEMS.map((item) => ({
    item,
    className: item.activeOn?.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
      ? "is-current"
      : "",
  }));
  return (
    <SpriteProvider>
      <PeopleProvider>
      <div className="theme-gameboy">
        <Scene />
        <AlertStack />
        <header className="gb-banner">
          <div className="gb-banner-plate">
            <PixelMotif name="psd" size={40} className="gb-banner-logo" />
            <div className="gb-banner-text">
              <h1>{props.title}</h1>
              {props.subtitle ? <p>{props.subtitle}</p> : null}
            </div>
            <RoleMotif role="bannerMark" size={32} className="" />
          </div>
        </header>
        <StreamHealth />
        <main className="gb-main">{props.children}</main>
        {showNav ? (
          <nav className="gb-nav" aria-label="Participant sections">
            {navItems.map(({ item, className }) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid="gameboy-shell__nav-link"
                className={className}
              >
                <NavMotif icon={item.icon} />
                <span>{item.label}</span>
                <AlertLed
                  {...alertStateFor(item.alert, {
                    teamChatUnread,
                    chatUnread,
                    galleryUnread,
                    teamUpSoon,
                  })}
                />
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
      </PeopleProvider>
    </SpriteProvider>
  );
}

/**
 * ADR-125 — the shell no longer owns the alerts store; `App`'s participant guard does.
 *
 * It was mounted here so the nav could draw a dot that a room several routes inside `children`
 * would clear. That worked for the nav and failed for the rooms: a surface that renders this
 * shell sits *above* the provider it creates, so `ChatPanel`'s and `PhotosPanel`'s own
 * `useAlerts()` were reading the quiet fallback and clearing nothing.
 */
export function GameboyShell(props: {
  title: string;
  subtitle?: string | undefined;
  showNav?: boolean;
  children: ReactNode;
}) {
  return <ShellChrome {...props} />;
}
