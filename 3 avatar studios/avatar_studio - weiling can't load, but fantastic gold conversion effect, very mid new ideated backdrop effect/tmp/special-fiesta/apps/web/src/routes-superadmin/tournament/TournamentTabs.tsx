import { NavLink } from 'react-router-dom';

/**
 * ADR-279 — the Tournament tab's three subtabs: Control (run the day), Timetable (every court across
 * the day), Simulator (rehearse a day before it exists). The strip reuses the console's tab styling.
 */
const SUBTABS = [
  { to: '/admin/tournament', label: 'Control', end: true },
  { to: '/admin/tournament/timetable', label: 'Timetable', end: false },
  { to: '/admin/tournament/simulator', label: 'Simulator', end: false },
];

export function TournamentTabs() {
  return (
    <nav className="console-tabs" aria-label="Tournament sections" data-testid="tournament-tabs">
      {SUBTABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} data-testid="tournament-tabs__tab">
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
