import { Link } from 'react-router-dom';
import { AdminShell } from './AdminShell.js';
import { useAdminDashboard } from '../lib/hooks/useAdminConfig.js';
import { OperationsOverviewPanel } from './OperationsOverviewPanel.js';

/** S35 — event dashboard (F43): live counts plus the bootstrap checklist that is still open. */
export function DashboardPage() {
  const dashboard = useAdminDashboard();
  const status = dashboard.status;

  if (!status) {
    return (
      <AdminShell title="Dashboard">
        <p className="loading">{dashboard.error ?? 'Loading…'}</p>
      </AdminShell>
    );
  }

  const tiles = [
    { label: 'Participants', value: status.participantCount },
    { label: 'Teams', value: status.teamCount },
    { label: 'Matches', value: status.matchCount },
    { label: 'Scans', value: status.scanCount },
    { label: 'Courts enabled', value: `${status.enabledCourtCount}/${status.courtCount}` },
    { label: 'Activities active', value: `${status.activeActivityCount}/${status.activityCount}` },
    { label: 'Facilitators', value: status.facilitatorCount },
    { label: 'Point config', value: status.isPointConfigSet ? 'Set' : 'Not set' },
  ];

  return (
    <AdminShell title="Dashboard">
      {dashboard.blockers.length > 0 ? (
        <section className="console-panel">
          <h2>Before the event starts</h2>
          <ul data-testid="dashboard__blockers">
            {dashboard.blockers.map((blocker) => (
              <li key={blocker} className="console-warning" style={{ marginBottom: 8 }}>
                {blocker}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <OperationsOverviewPanel />

      <section className="console-panel">
        {/*
         * ADR-151 — renamed. Every tile below is a count since the database was created, so
         * "Right now" was the one piece of prose on this page that was simply untrue; the
         * panel above is the part that answers it.
         */}
        <h2>Totals so far</h2>
        <div className="console-grid">
          {tiles.map((tile) => (
            <div key={tile.label} className="console-panel" data-testid="dashboard__tile">
              <span className="console-muted">{tile.label}</span>
              <p style={{ fontSize: 30, margin: '8px 0 0' }}>{tile.value}</p>
            </div>
          ))}
        </div>
        <div className="console-row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="console-button"
            data-testid="dashboard__refresh"
            onClick={dashboard.reload}
          >
            Refresh
          </button>
          <Link className="console-button" to="/admin/points" data-testid="dashboard__points">
            Set point values
          </Link>
        </div>
      </section>
    </AdminShell>
  );
}
