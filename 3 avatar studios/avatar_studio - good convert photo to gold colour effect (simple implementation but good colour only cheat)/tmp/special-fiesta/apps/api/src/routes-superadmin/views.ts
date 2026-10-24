/** Barrel of the view builders the superadmin routes need (zero call-site churn if split). */
export { activityView, roundView, scanView } from '../views/fringe.js';
export { pointConfigView } from '../views/pointConfig.js';
export { auditView, facilitatorView, screenKeyView, superadminView } from '../views/admin.js';
export { adjustmentView, clusterView, serviceStateView, participantTotalsView, participantView } from '../views/participants.js';
export { teamSummaryView } from '../views/teams.js';
export { awardBatchDetailView, awardBatchView, teamLedgerView } from '../views/awards.js';
