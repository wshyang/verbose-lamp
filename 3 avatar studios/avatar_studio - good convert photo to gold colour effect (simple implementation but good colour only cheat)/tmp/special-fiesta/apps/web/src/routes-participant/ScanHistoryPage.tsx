import { emptyStates } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { formatPoints, formatTime } from '../lib/format.js';
import { useMyScans } from '../lib/hooks/useParticipantHome.js';
import { ScanHistoryTabs } from './ScanHistoryTabs.js';

/** S6 — my scan history (F7). Voided scans stay visible but are struck through (F49). */
export function ScanHistoryPage() {
  const history = useMyScans();
  const isEmpty = history.scans.length === 0;

  return (
    <GameboyShell title="MY SCANS" subtitle={formatPoints(history.totalPoints)}>
      <ScanHistoryTabs />
      <section className="gb-panel">
        <StateMessage
          isLoading={history.isLoading}
          error={history.error}
          isEmpty={isEmpty}
          emptyText={emptyStates.myScanHistory}
          testId="scan-history"
        />
        <ul className="gb-list gb-list--stamped">
          {history.scans.map((scan) => (
            <li key={scan.id} data-testid="scan-history__row">
              <div className="gb-row gb-row--between">
                <span style={{ textDecoration: scan.isVoided ? 'line-through' : 'none' }}>
                  {scan.activityNameSnapshot} · R{scan.roundNumberSnapshot}
                </span>
                <strong className="gb-points">+{scan.pointsAwardedSnapshot}</strong>
              </div>
              <span className="gb-hint">{formatTime(scan.scannedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </GameboyShell>
  );
}
