import type { ReactNode } from 'react';
import { ConsoleShell } from '../components/console/ConsoleShell.js';

/** Superadmin chrome: dense, tabbed, text-only (fds.md §5.5). */

const TABS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/points', label: 'Points' },
  // ADR-279 — the rebuilt tournament: Control, Timetable and Simulator subtabs.
  { to: '/admin/tournament', label: 'Tournament' },
  { to: '/admin/activities', label: 'Activities' },
  // ADR-177 — the run sheet participants read in the Ball tab's Agenda segment.
  { to: '/admin/agenda', label: 'Programme' },
  { to: '/admin/swag', label: 'Swag' },
  { to: '/admin/clusters', label: 'Clusters' },
  { to: '/admin/facilitators', label: 'Facilitators' },
  { to: '/admin/scans', label: 'Scans' },
  { to: '/admin/swag-claims', label: 'Swag claims' },
  { to: '/admin/participants', label: 'Participants' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/audit', label: 'Audit' },
  // ADR-161 — the day's record, next to the audit log because both are things you reach for
  // after the event rather than during it.
  { to: '/admin/standings', label: 'Standings' },
  // ADR-074 — announcing to every participant's screen.
  { to: '/admin/announce', label: 'Announce' },
  // ADR-047 — photo moderation. The wall at /admin/wall is deliberately not a tab: it is
  // pointed at a projector, so it has no chrome to navigate from.
  { to: '/admin/photos', label: 'Photos' },
  { to: '/admin/superadmins', label: 'Superadmins' },
  // ADR-118 — last, because it is the tab nobody should need: pausing the non-essentials and
  // restarting the app are both things you reach for on a bad afternoon, not during setup.
  { to: '/admin/system', label: 'Operations' },
];

export function AdminShell(props: { title: string; children: ReactNode }) {
  return (
    <ConsoleShell title={props.title} tabs={TABS} wide>
      {props.children}
    </ConsoleShell>
  );
}
