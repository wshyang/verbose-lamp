import { createAdjustmentRequestSchema, messages, reassignClusterRequestSchema } from '@psd/contracts';
import { Hono } from 'hono';
import {
  countActivities,
  createAdjustment,
  findActivityById,
  listAdjustmentsForParticipant,
  countFacilitators,
  countParticipants,
  countScans,
  countTeams,
  findActiveMembership,
  findParticipantById,
  findPointConfig,
  listParticipants,
  listScansForParticipant,
  listTeamMembers,
  listTeams,
  readParticipantTotals,
  reassignParticipantCluster,
} from '../db/entities/index.js';
import { SCOREBOARD_TAG, invalidateTag } from '../lib/cache.js';
import { assertCatalogueUnlocked, assertClusterUsable } from '../lib/clusterGuards.js';
import { badRequest, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import {
  adjustmentView,
  participantTotalsView,
  participantView,
  scanView,
  teamSummaryView,
} from './views.js';
import { required } from '../db/rows.js';
import { readCourtRows, readDay } from '../routes-tournament/support.js';

/** F47, F48 and the read-only directories (S52–S54), plus the two PIN-reset paths. */
export function superadminDirectoryRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  routes.get('/dashboard', async (c) => {
    requireSuperadmin(c);
    return c.json({ status: await readBootstrapStatus(c) });
  });

  routes.get('/participants', async (c) => {
    requireSuperadmin(c);
    const rows = await listParticipants(c.get('db'), {
      search: c.req.query('search'),
      clusterCode: c.req.query('clusterCode'),
    });
    const items = rows.map((row) => ({
      participant: participantView(row),
      teamName: row.teamName,
    }));
    return c.json({ items });
  });

  routes.get('/participants/:participantId', async (c) => {
    requireSuperadmin(c);
    return c.json(await readParticipantDetail(c, requireParam(c, 'participantId')));
  });

  registerAdjustmentActions(routes);
  registerClusterReassignment(routes);

  routes.get('/teams', async (c) => {
    requireSuperadmin(c);
    const teams = await listTeams(c.get('db'));
    const items = [];
    for (const team of teams) {
      const members = await listTeamMembers(c.get('db'), team.id);
      /*
       * ADR-154 — `members` carries ids now, because a repair has to name a person and a
       * nickname is not a handle: two participants may share a display name, and the console
       * would otherwise have to guess which one it was moving. `memberNicknames` stays
       * alongside it so the existing read is untouched.
       */
      items.push({
        team: teamSummaryView(team),
        memberNicknames: members.map((m) => m.nickname),
        members: members.map((m) => ({
          participantId: m.participantId,
          nickname: m.nickname,
          isCaptain: m.isCaptain,
        })),
      });
    }
    return c.json({ items });
  });

  return routes;
}

/**
 * ADR-117 — the manual correction. The operational escape hatch for the day a bug, an outage
 * or a mis-scan leaves someone's total wrong: a superadmin puts it right on the spot, signed
 * and justified, instead of the scoreboard staying wrong until Monday.
 */
/**
 * ADR-172 — correcting one participant's cluster.
 *
 * fds.md §2.1 marks a participant's cluster immutable post-signup, and this is the deliberate
 * exception: it is self-declared and unverified (§10 A2), so a mis-tap at signup is the most
 * ordinary mistake on the day and nothing else can fix it. It is held to the same freeze as a
 * bulk move, for the same reason — the leaderboard groups on this column, so a correction made
 * after scoring moves every point the participant has already earned.
 */
function registerClusterReassignment(routes: Hono<AppBindings>): void {
  routes.put('/participants/:participantId/cluster', async (c) => {
    requireSuperadmin(c);
    const participantId = requireParam(c, 'participantId');
    const participant = await findParticipantById(c.get('db'), participantId);
    if (!participant) throw notFound(messages.participantNotFound);
    const body = await readBody(c, reassignClusterRequestSchema);
    if (body.toClusterCode === participant.clusterCode) {
      throw badRequest(messages.clusterSameTarget, 'toClusterCode');
    }
    await assertClusterUsable(c, body.toClusterCode);
    await assertCatalogueUnlocked(c);

    await reassignParticipantCluster(c.get('db'), participantId, body.toClusterCode);
    // Their points are grouped by this column, so every standing is stale as of now.
    invalidateTag(SCOREBOARD_TAG);
    const updated = await findParticipantById(c.get('db'), participantId);
    return c.json({ participant: participantView(required(updated, 'Participant')) });
  });
}

function registerAdjustmentActions(routes: Hono<AppBindings>): void {
  routes.post('/participants/:participantId/adjustments', async (c) => {
    const actor = requireSuperadmin(c);
    const participantId = requireParam(c, 'participantId');
    const participant = await findParticipantById(c.get('db'), participantId);
    if (!participant) throw notFound(messages.participantNotFound);
    const body = await readBody(c, createAdjustmentRequestSchema);
    const activity = await findActivityById(c.get('db'), body.activityId);
    if (!activity) throw notFound(messages.activityNotFound);
    const written = await createAdjustment(c.get('db'), {
      participantId,
      activityId: activity.id,
      points: body.points,
      reason: body.reason,
      activityNameSnapshot: activity.activityName,
      createdBySuperadminId: actor.superadmin.id,
    });
    return c.json({ adjustment: adjustmentView(written) }, 201);
  });
}

async function readParticipantDetail(c: AppContext, participantId: string) {
  const participant = await findParticipantById(c.get('db'), participantId);
  if (!participant) throw notFound(messages.participantNotFound);
  const [totals, scans, membership, adjustments] = await Promise.all([
    readParticipantTotals(c.get('db'), participantId),
    listScansForParticipant(c.get('db'), participantId),
    findActiveMembership(c.get('db'), participantId),
    listAdjustmentsForParticipant(c.get('db'), participantId),
  ]);
  const team = membership ? await readTeamSummary(c, membership.teamId) : null;
  return {
    participant: participantView(participant),
    totals: participantTotalsView(totals),
    team,
    scans: scans.map(scanView),
    adjustments: adjustments.map(adjustmentView),
  };
}

async function readTeamSummary(c: AppContext, teamId: string) {
  const teams = await listTeams(c.get('db'));
  // An active membership implies an undisbanded team, which is what listTeams returns.
  const summary = required(
    teams.find((candidate) => candidate.id === teamId),
    'Team',
  );
  return teamSummaryView(summary);
}

/** S35 — the dashboard doubles as the bootstrap checklist (fds.md §8.1/§8.2). */
async function readBootstrapStatus(c: AppContext) {
  const db = c.get('db');
  const [pointConfig, activities, facilitators, participants, teams, scans, courts, day] = await Promise.all([
    findPointConfig(db),
    countActivities(db),
    countFacilitators(db),
    countParticipants(db),
    countTeams(db),
    countScans(db),
    readCourtRows(db),
    readDay(db),
  ]);
  // ADR-280 — the venue's courts and the day's played matches (byes are not matches).
  const played = day?.context.state.matches.filter((match) => match.status === 'completed' && match.result?.kind !== 'bye') ?? [];
  return {
    isPointConfigSet: Boolean(pointConfig),
    courtCount: courts.length,
    enabledCourtCount: courts.filter((court) => court.isEnabled).length,
    activityCount: activities.total,
    activeActivityCount: activities.active,
    facilitatorCount: facilitators,
    participantCount: participants,
    teamCount: teams,
    matchCount: played.length,
    scanCount: scans,
  };
}
