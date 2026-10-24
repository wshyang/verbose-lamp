import { formatDateTime } from '../lib/format.js';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import type { ConfirmState } from '../lib/hooks/useConfirm.js';
import type { useSystemControls } from '../lib/hooks/useSystemControls.js';

/**
 * ADR-147 — station offline mode, on the Operations page with the other two switches.
 *
 * It belongs beside the pause rather than in Config for the same reason they do: it does not
 * describe how the event scores, it describes what the app is doing, and an operator reaching
 * for it is having a particular kind of afternoon.
 *
 * The copy avoids the words \"service worker\" entirely. What an operator needs to decide is
 * whether facilitator phones may keep a copy of the app — and, in the other direction, how
 * fast turning it off takes effect. Everything else is implementation they should never have
 * to hold in their head at five past four.
 */

interface Props {
  system: ReturnType<typeof useSystemControls>;
  confirm: ConfirmState;
  view: { isStationOfflineEnabled: boolean; stationOfflineAt: string | null };
}

export function StationOfflinePanel(props: Props) {
  const help = useFieldHelp();
  const { system, confirm, view } = props;

  return (
    <section className="console-panel">
      <h2>
        Station offline mode <FieldHelp label="Station offline mode" topic="stationOfflineToggle" help={help} />
      </h2>
      <p className="console-hint" data-testid="system__station-offline-state">
        {view.isStationOfflineEnabled
          ? 'On — staff phones keep a copy of the app, so a reload works in a dead spot.'
          : 'Off — staff phones load the app fresh every time, as normal.'}
      </p>
      {view.stationOfflineAt ? (
        <p className="console-hint" data-testid="system__station-offline-at">
          Last changed {formatDateTime(view.stationOfflineAt)}.
        </p>
      ) : null}
      {/*
        Both halves of the honest answer. Queued scans are already safe without this — that is
        the sync queue's job and it has never depended on this switch — and the limit of the
        off position is stated where the decision is made, not in a postmortem.
      */}
      <p className="console-hint">
        Only facilitator screens are affected; participants are never given a copy. Scans
        already queue safely offline without this. Turning it off clears the copy from every
        staff phone that has a network within five minutes — a phone with no signal keeps
        working from its copy until it has one.
      </p>
      {view.isStationOfflineEnabled ? (
        <button
          type="button"
          className="console-button"
          data-testid="system__disable-station-offline"
          disabled={system.isBusy}
          onClick={() =>
            confirm.ask({
              title: 'Turn station offline mode off?',
              body:
                'Staff phones will drop their copy of the app next time they reach the ' +
                'network, and a reload with no signal will stop working again.',
              confirmLabel: 'Turn off',
              isDanger: true,
              run: system.disableStationOffline,
            })
          }
        >
          Turn off
        </button>
      ) : (
        <button
          type="button"
          className="console-button"
          data-testid="system__enable-station-offline"
          disabled={system.isBusy}
          onClick={() =>
            confirm.ask({
              title: 'Turn station offline mode on?',
              body:
                'Staff phones will keep a copy of the app from their next visit, so a reload ' +
                'works even with no signal. You can turn this off again at any time.',
              confirmLabel: 'Turn on',
              run: system.enableStationOffline,
            })
          }
        >
          Turn on
        </button>
      )}
    </section>
  );
}
