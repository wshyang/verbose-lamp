import { emptyStates } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { PassportChop } from '../components/participant/PassportChop.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { usePassport } from '../lib/hooks/usePassport.js';
import { ScanHistoryTabs } from './ScanHistoryTabs.js';

/**
 * ADR-239 — the passport tab of Scan History. Every station the day has, in the order the
 * facilitators see them. A station this participant has completed carries its chop (ADR-241);
 * one they have not yet completed keeps an open slot in the same place, so the page shows what is
 * left as well as what is done.
 */
/**
 * ADR-261 — where each repeat strike lands over the one before it. The offsets cycle so a
 * station struck five times fans out instead of marching off its slot; every impression also
 * carries its own tilt and offset from its seed, so no two stacks settle the same way.
 */
const STACK_OFFSETS = [
  'translate(0px, 2px)',
  'translate(14px, -3px)',
  'translate(-8px, 6px)',
  'translate(22px, 3px)',
  'translate(-16px, -3px)',
] as const;

export function PassportPage() {
  const passport = usePassport();
  const isEmpty = passport.stations.length === 0;

  return (
    <GameboyShell title="MY SCANS" subtitle={passport.progress}>
      <ScanHistoryTabs />
      <section className="gb-panel">
        <StateMessage
          isLoading={passport.isLoading}
          error={passport.error}
          isEmpty={isEmpty}
          emptyText={emptyStates.passportStations}
          testId="passport"
        />
        <ul className="gb-passport">
          {passport.stations.map((station) => (
            <li key={station.activityId} data-testid="passport__station">
              <span className="gb-passport__name">{station.activityName}</span>
              {station.chops.length > 0 ? (
                <span className="gb-passport__chops" data-testid="passport__chops">
                  {station.chops.map((chop, index) => (
                    <span
                      key={chop.seed}
                      className="gb-passport__chop"
                      style={{ transform: STACK_OFFSETS[index % STACK_OFFSETS.length] }}
                    >
                      {/* Only the first strike speaks; a stack of "Completed"s is one fact. */}
                      <PassportChop chop={chop} decorative={index > 0} />
                    </span>
                  ))}
                  {/* ADR-262 — the strikes the cap folded away, counted where they fell. */}
                  {station.completions > station.chops.length ? (
                    <span className="gb-badge gb-badge--accent gb-passport__more" data-testid="passport__more">
                      +{station.completions - station.chops.length} more
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="gb-passport__slot" data-testid="passport__pending">
                  {emptyStates.passportNotYet}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </GameboyShell>
  );
}
