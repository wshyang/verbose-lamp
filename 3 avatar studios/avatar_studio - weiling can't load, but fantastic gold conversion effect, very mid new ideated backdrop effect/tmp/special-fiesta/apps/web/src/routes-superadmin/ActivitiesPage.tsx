import { emptyStates } from '@psd/contracts';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { AdminShell } from './AdminShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useAdminActivities } from '../lib/hooks/useAdminConfig.js';
import type { ActivityDraft, TierDraft } from '../lib/hooks/useAdminConfig.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';

/**
 * S37–S40 — fringe activities (F36–F38). Deactivating an activity closes its open round, and
 * renaming one never rewrites the names already snapshotted onto past scans.
 */
export function ActivitiesPage() {
  const confirm = useConfirm();
  const admin = useAdminActivities();
  const submitLabel = admin.editingId ? 'Save changes' : 'Create activity';

  return (
    <AdminShell title="Fringe activities">
      <ConfirmDialog confirm={confirm} isBusy={admin.isBusy} />
      <section className="console-panel">
        <h2>{admin.editingId ? 'Edit activity' : 'New activity'}</h2>
        <form
          data-testid="activities__form"
          onSubmit={(event) => {
            event.preventDefault();
            void admin.submitDraft();
          }}
        >
          <div className="console-grid">
            <div>
              <ConsoleField id="activity-name" label="Activity name" topic="activityName">
              <input
                id="activity-name"
                className="console-input"
                data-testid="activities__name"
                value={admin.draft.activityName}
                maxLength={50}
                onChange={(event) =>
                  admin.setDraft({ ...admin.draft, activityName: event.target.value })
                }
              />
          </ConsoleField>
            </div>
            <TierRowsEditor draft={admin.draft} setDraft={admin.setDraft} />
          </div>
          {admin.error ? (
            <p className="console-danger" role="alert" data-testid="activities__error">
              {admin.error}
            </p>
          ) : null}
          <div className="console-row" style={{ marginTop: 16 }}>
            <button
              type="submit"
              className="console-button console-button--primary"
              data-testid="activities__submit"
              disabled={admin.isBusy}
            >
              {submitLabel}
            </button>
            {admin.editingId ? (
              <button
                type="button"
                className="console-button console-button--ghost"
                data-testid="activities__cancel"
                onClick={admin.cancelEdit}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="console-panel">
        <h2>All activities</h2>
        <StateMessage
          isLoading={admin.isLoading}
          error={null}
          isEmpty={admin.activities.length === 0}
          emptyText={emptyStates.activityList}
          testId="activities"
        />
        <table className="console-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Points</th>
              <th>Round</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admin.activities.map((activity) => (
              <tr key={activity.id} data-testid="activities__row">
                <td>{activity.activityName}</td>
                <td>{activity.awardTiers.map((tier) => `${tier.label} +${tier.points}`).join(' · ')}</td>
                <td>
                  {activity.currentRound
                    ? `R${activity.currentRound.roundNumber} (${activity.currentRound.status})`
                    : '—'}
                </td>
                <td className={activity.isActive ? 'console-ok' : 'console-muted'}>
                  {activity.isActive ? 'Active' : 'Inactive'}
                </td>
                <td>
                  <div className="console-row">
                    <button
                      type="button"
                      className="console-button"
                      data-testid="activities__edit"
                      onClick={() => admin.beginEdit(activity.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="console-button"
                      data-testid="activities__toggle"
                      disabled={admin.isBusy}
                      onClick={() => confirm.ask({
                        title: activity.isActive
                          ? `Deactivate ${activity.activityName}?`
                          : `Activate ${activity.activityName}?`,
                        body: activity.isActive
                          ? 'Any open round at that station closes immediately and no more scans are accepted.'
                          : 'The station can open rounds and award points again.',
                        confirmLabel: activity.isActive ? 'Deactivate it' : 'Activate it',
                        isDanger: activity.isActive,
                        run: () => admin.setActive({ activityId: activity.id, isEnabled: !activity.isActive }),
                      })}
                    >
                      {activity.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="console-muted">Deactivating closes any open round at that station.</p>
      </section>
    </AdminShell>
  );
}

/**
 * ADR-092 — the award tier editor: one to four labelled tiers ("First place" +10), the
 * first tier is the station's pre-armed default. A flat-rate activity is simply a single
 * tier, so the one control covers every station.
 */
function TierRowsEditor(props: {
  draft: ActivityDraft;
  setDraft: (draft: ActivityDraft) => void;
}) {
  const { draft, setDraft } = props;
  const help = useFieldHelp();
  const setTier = (index: number, tier: TierDraft) =>
    setDraft({ ...draft, tiers: draft.tiers.map((entry, at) => (at === index ? tier : entry)) });
  const removeTier = (index: number) =>
    setDraft({ ...draft, tiers: draft.tiers.filter((_, at) => at !== index) });
  const addTier = () =>
    setDraft({ ...draft, tiers: [...draft.tiers, { label: '', points: '5' }] });
  return (
    <div>
      <div className="console-field__head">
        <span className="console-label">Award tiers — the first is the default</span>
        <FieldHelp label="Award tiers" topic="activityTiers" help={help} />
      </div>
      {draft.tiers.map((tier, index) => (
        <div className="console-row" key={index} style={{ marginBottom: 8 }}>
          <input
            className="console-input"
            aria-describedby={help.tooltipId}
            data-testid="activities__tier-label"
            aria-label={`Tier ${index + 1} label`}
            maxLength={20}
            value={tier.label}
            onChange={(event) => setTier(index, { ...tier, label: event.target.value })}
          />
          <input
            className="console-input"
            aria-describedby={help.tooltipId}
            data-testid="activities__tier-points"
            aria-label={`Tier ${index + 1} points`}
            inputMode="numeric"
            style={{ maxWidth: 96 }}
            value={tier.points}
            onChange={(event) =>
              setTier(index, { ...tier, points: event.target.value.replace(/\D/g, '') })
            }
          />
          {draft.tiers.length > 1 ? (
            <button
              type="button"
              className="console-button console-button--ghost"
              data-testid="activities__tier-remove"
              aria-label={`Remove tier ${index + 1}`}
              onClick={() => removeTier(index)}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {draft.tiers.length < 4 ? (
        <button
          type="button"
          className="console-button"
          data-testid="activities__tier-add"
          onClick={addTier}
        >
          Add tier
        </button>
      ) : null}
    </div>
  );
}
