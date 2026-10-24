/**
 * What the crowd actually does. Each persona is one virtual user's whole day, written as
 * the loop the real client runs: open a surface, read it, let it poll itself for a while,
 * move on. The mix and the waits matter more than the raw request count — a load test that
 * hammers one endpoint flat out measures the endpoint, not the event.
 *
 * Surfaces and their polling come straight from the app (ADR-024): S5 board and S60 feed
 * refresh themselves, the court console and the fringe scan log refresh themselves, and
 * everything else is read once per visit.
 */

import { pick, pickWeighted, pollDelay, sleepUntil, thinkTime } from './client.mjs';

const THINK_MIN_MS = 4_000;
const THINK_MAX_MS = 20_000;

/** How long a participant leaves a surface open before moving on, in polls. */
const POLLS_PER_VISIT = [1, 1, 2, 3];

/**
 * Weighted by what people do on a sports day: mostly stare at the board, check their own
 * points, look up the team, and occasionally open the feed.
 */
/**
 * ADR-046 / ADR-047 — chat and photos take a share of attention from the other surfaces rather
 * than being added on top, because the question this harness answers is what 300 phones do to
 * one laptop, and a participant looking at photos is not also looking at the board.
 *
 * `chat` is weighted low on purpose: its cost model is an open SSE socket plus one INSERT per
 * message, so the interesting load is the sends, not the reads. `gallery` is the expensive one
 * to watch — it is the surface with a real byte cost attached.
 */
// ADR-270 — the match feed's share went to the board with the old tournament; it returns with the rebuild.
const PARTICIPANT_SURFACES = [
  ['board', 47],
  ['home', 13],
  ['gallery', 12],
  ['chat', 8],
  ['scans', 8],
  ['team', 8],
  ['teams', 4],
];

async function openSurface(client, surface, world) {
  if (surface === 'board') {
    await client.call('GET', '/api/leaderboard', { label: 'GET /api/leaderboard' });
    return 'board';
  }
  if (surface === 'gallery') {
    /**
     * ADR-048 changed what this has to measure. While photos were files on disk, fetching thumbs
     * here would have measured the kernel page cache; now every cold thumb is a `bytea` read
     * through PGlite's ONE serialized connection — the same connection a facilitator's match
     * score is queued behind. So the burst the assessment worried about (R1/R2) is only
     * reproduced if the thumbs are actually fetched.
     *
     * Six per open approximates a phone's first screenful of a grid.
     */
    const listing = await client.call('GET', '/api/gallery/photos?sort=newest', {
      label: 'GET /api/gallery/photos',
    });
    const photos = listing?.payload?.photos ?? [];
    for (const photo of photos.slice(0, 6)) {
      await client.call('GET', `/api/gallery/photos/${photo.id}/thumb`, {
        label: 'GET /api/gallery/photos/:id/thumb',
        raw: true,
      });
    }
    return 'gallery';
  }
  if (surface === 'chat') {
    await client.call('GET', '/api/chat/messages', { label: 'GET /api/chat/messages' });
    // One send per visit: the rate limit is 3 deep refilling every 2 s, so this stays inside
    // what a real thumb can do and still exercises the insert-and-broadcast path.
    await client.call('POST', '/api/chat/messages', {
      label: 'POST /api/chat/messages',
      body: { body: 'stress says hello' },
      tolerate: [429],
    });
    return 'chat';
  }
  if (surface === 'home') {
    await client.call('GET', '/api/me', { label: 'GET /api/me' });
    return null;
  }
  if (surface === 'scans') {
    await client.call('GET', '/api/me/scans', { label: 'GET /api/me/scans' });
    return null;
  }
  if (surface === 'team') {
    const mine = await client.call('GET', '/api/teams/mine', { label: 'GET /api/teams/mine' });
    const teamId = mine.payload?.team?.id ?? null;
    if (teamId !== null) await client.call('GET', `/api/teams/${teamId}`, { label: 'GET /api/teams/:id (own)' });
    return null;
  }
  const browsed = await client.call('GET', '/api/teams', { label: 'GET /api/teams' });
  const teams = browsed.payload?.items ?? [];
  if (teams.length > 0) {
    await client.call('GET', `/api/teams/${pick(teams).id}`, { label: 'GET /api/teams/:id' });
  }
  world.teams = teams;
  return null;
}

async function pollSurface(client, polling) {
  if (polling === 'board') {
    await client.call('GET', '/api/leaderboard', { label: 'GET /api/leaderboard (poll)' });
    return;
  }
  if (polling === 'gallery') {
    await client.call('GET', '/api/gallery/photos?sort=newest', {
      label: 'GET /api/gallery/photos (poll)',
    });
    return;
  }
  if (polling === 'chat') {
    await client.call('GET', '/api/chat/messages', { label: 'GET /api/chat/messages (poll)' });
    return;
  }
  await client.call('GET', '/api/leaderboard', { label: 'GET /api/leaderboard (poll)' });
}

/**
 * A participant: signs in once, then walks the surfaces until the clock runs out. The
 * session check on arrival is what every reload does (ADR-015).
 */
export async function runParticipant(input) {
  const { client, account, config, deadline, world } = input;
  await client.call('POST', '/api/auth/participants/signin', {
    label: 'POST /api/auth/participants/signin',
    body: { nickname: account.nickname, pin: account.pin },
  });
  await client.call('GET', '/api/auth/session', { label: 'GET /api/auth/session' });

  while (Date.now() < deadline) {
    const polling = await openSurface(client, pickWeighted(PARTICIPANT_SURFACES), world);
    const visits = polling === null ? 0 : pick(POLLS_PER_VISIT);
    for (let visit = 0; visit < visits && Date.now() < deadline; visit += 1) {
      await sleepUntil(pollDelay(config), deadline);
      if (Date.now() >= deadline) break;
      await pollSurface(client, polling);
    }
    await sleepUntil(thinkTime(THINK_MIN_MS, THINK_MAX_MS), deadline);
  }
}

/**
 * A fringe marshal: the queue at the station is the app's only sustained write load, so
 * this one scans as fast as `--scan-rate` allows and watches its own scan log.
 */
export async function runFringeMarshal(input) {
  const { client, account, config, deadline, world } = input;
  await client.call('POST', '/api/auth/facilitators/signin', {
    label: 'POST /api/auth/facilitators/signin',
    body: { username: account.username, passcode: account.passcode },
  });
  const roundId = world.rounds.length > 0 ? pick(world.rounds) : null;
  if (roundId === null) return;

  const gapMs = 1000 / Math.max(0.01, config.scanRatePerStation);
  let sinceLog = 0;
  while (Date.now() < deadline) {
    const participant = pick(world.accounts);
    await client.call('POST', '/api/fringe/scans', {
      label: 'POST /api/fringe/scans',
      body: {
        nickname: participant.nickname,
        roundId,
        clientScanUuid: crypto.randomUUID(),
        clientTimestamp: new Date().toISOString(),
      },
      // A second scan of the same player in the same round is a 409 by design (F26).
      tolerate: [409, 422],
    });
    sinceLog += 1;
    if (sinceLog >= 10) {
      sinceLog = 0;
      await client.call('GET', `/api/fringe/rounds/${roundId}/scans`, {
        label: 'GET /api/fringe/rounds/:id/scans',
      });
    }
    await sleepUntil(gapMs, deadline);
  }
}

/** A superadmin with the console open: the dashboard and the directories, on a poll. */
export async function runSuperadmin(input) {
  const { client, account, config, deadline } = input;
  await client.call('POST', '/api/auth/superadmins/signin', {
    label: 'POST /api/auth/superadmins/signin',
    body: { username: account.username, passcode: account.passcode },
  });

  while (Date.now() < deadline) {
    await client.call('GET', '/api/admin/dashboard', { label: 'GET /api/admin/dashboard' });
    await client.call('GET', `/api/admin/participants?${new URLSearchParams({ limit: '50' })}`, {
      label: 'GET /api/admin/participants',
    });
    await client.call('GET', '/api/admin/operations', { label: 'GET /api/admin/operations' });
    await sleepUntil(pollDelay(config), deadline);
  }
}

export const PERSONAS = {
  participant: runParticipant,
  fringe: runFringeMarshal,
  superadmin: runSuperadmin,
};
