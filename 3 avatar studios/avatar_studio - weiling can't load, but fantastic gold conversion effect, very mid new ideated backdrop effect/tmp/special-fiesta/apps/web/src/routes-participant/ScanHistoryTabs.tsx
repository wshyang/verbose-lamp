import { NavLink } from 'react-router-dom';

/**
 * ADR-239 — the two sections of Scan History: the passport and the list of scans. The same
 * segmented control as the feed and social tabs (ADR-046, ADR-089), so the pattern a participant
 * has already learned carries over unchanged. The passport leads (ADR-260): it is the section the
 * profile sends a participant to ("See my passport"), and the one that shows what is left to
 * collect.
 *
 * `end` on the Scans tab stops it from also reading as active on the passport's route.
 */
export const SCAN_HISTORY_TABS: { to: string; label: string; end: boolean }[] = [
  { to: '/me/scans/passport', label: 'Passport', end: false },
  { to: '/me/scans', label: 'Scans', end: true },
];

export function ScanHistoryTabs() {
  return (
    <nav className="gb-segments" aria-label="Scan history sections">
      {SCAN_HISTORY_TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} data-testid="scan-history-tabs__link">
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
