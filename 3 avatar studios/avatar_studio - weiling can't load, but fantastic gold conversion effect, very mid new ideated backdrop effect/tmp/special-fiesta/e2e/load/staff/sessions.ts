import { DEFAULT_AVATAR_LOOK_CODE } from '@psd/contracts';
import { clusterForUser } from '../engine/syntheticUser.js';
import type { Transport, TransportResponse } from '../engine/syntheticUser.js';

/**
 * ADR-350 — standalone mode's staff (the plan's §5): the people a real event has and the
 * load run needs. A superadmin signs in with the passcode the local stack was seeded with;
 * a facilitator is created and scans at a seeded fringe activity's open round; and the
 * run's teams are fielded by real participant captains, so the joiners have codes to use.
 *
 * Every request goes through the same `Transport` the synthetic users use — staff are load
 * too, and their requests are recorded by whoever hands them the transport.
 */

export interface StaffSession {
  readonly token: string;
}

export interface FacilitatorSession extends StaffSession {
  readonly facilitatorId: string;
  readonly username: string;
}

export interface FringeFixture {
  readonly activityId: string;
  readonly roundId: string;
}

interface PostSpec {
  readonly path: string;
  readonly body: unknown;
  readonly token?: string;
}

async function postJson(transport: Transport, spec: PostSpec): Promise<TransportResponse> {
  const response = await transport.request({
    method: 'POST',
    path: spec.path,
    body: spec.body,
    ...(spec.token === undefined ? {} : { token: spec.token }),
  });
  if (response.status >= 400) {
    throw new Error(`${spec.path} failed with ${response.status}: ${await response.text()}`);
  }
  return response;
}

export async function signInSuperadmin(transport: Transport, passcode: string): Promise<StaffSession> {
  const response = await postJson(transport, { path: '/api/auth/superadmins/signin', body: { username: 'superadmin', passcode } });
  if (response.status !== 200) throw new Error(`superadmin signin failed with ${response.status}`);
  const payload = await response.json<{ sessionToken: string }>();
  return { token: payload.sessionToken };
}

export async function createFacilitator(transport: Transport, superadmin: StaffSession, runId: string): Promise<FacilitatorSession> {
  // Facilitator usernames are alphanumeric only (usernameSchema) — no run-tag underscores.
  const username = `ld${runId.slice(0, 6)}f1`;
  const created = await postJson(transport, {
    path: '/api/admin/facilitators',
    body: { username, passcode: '1111', defaultStationType: 'none' },
    token: superadmin.token,
  });
  if (created.status !== 201) throw new Error(`facilitator create failed with ${created.status}`);
  const signIn = await postJson(transport, { path: '/api/auth/facilitators/signin', body: { username, passcode: '1111' } });
  if (signIn.status !== 200) throw new Error(`facilitator signin failed with ${signIn.status}: ${await signIn.text()}`);
  const payload = await signIn.json<{ facilitator: { id: string }; sessionToken: string }>();
  return { token: payload.sessionToken, facilitatorId: payload.facilitator.id, username };
}

/** A fringe activity with one open round — the scans' target (§5). */
export async function seedFringeActivity(transport: Transport, superadmin: StaffSession, facilitator: FacilitatorSession): Promise<FringeFixture> {
  const created = await postJson(transport, {
    path: '/api/admin/activities',
    body: { activityName: `Load run ${Date.now().toString(36)}`, awardTiers: [{ label: 'Award', points: 15 }] },
    token: superadmin.token,
  });
  if (created.status !== 201) throw new Error(`activity create failed with ${created.status}`);
  const activity = await created.json<{ activity: { id: string } }>();
  const round = await postJson(transport, { path: `/api/fringe/activities/${activity.activity.id}/rounds`, body: {}, token: facilitator.token });
  if (round.status !== 201) throw new Error(`round open failed with ${round.status}`);
  const roundPayload = await round.json<{ round: { id: string } }>();
  return { activityId: activity.activity.id, roundId: roundPayload.round.id };
}

/**
 * What fielding the run's teams produced. The join CODES are the joiners' half; the captain's
 * session token and the team NAMES are cast mode's half — the up-soon expectation reads the
 * line-up (whose seats are named `ld_{runId6}_t{i}`) and the read-back reads the chat through
 * a session the run owns.
 */
export interface TeamFielding {
  readonly joinCodes: readonly string[];
  /** Captain 0's session token — a viewer the CLI can read line-ups and the room with. */
  readonly captainToken: string;
  readonly teamNames: readonly string[];
}

/**
 * Fields the run's teams through real captains: `spread` extra participant accounts, each
 * creating one team. The captains are participants like any other (the tier's population is
 * users + captains + staff, which is also what a real event is).
 */
export async function fieldTeams(transport: Transport, runId: string, spread: number): Promise<TeamFielding> {
  const codes: string[] = [];
  const names: string[] = [];
  let captainToken = '';
  for (let index = 0; index < spread; index += 1) {
    const nickname = captainNickname(runId, index);
    const signup = await postJson(transport, {
      path: '/api/auth/participants/signup',
      body: {
        nickname,
        pin: '1234',
        clusterCode: clusterForUser(index + 1),
        gender: 'female',
        avatarVariant: 3,
        avatarLook: DEFAULT_AVATAR_LOOK_CODE,
      },
    });
    if (signup.status !== 201) throw new Error(`captain signup failed with ${signup.status}`);
    const session = await signup.json<{ sessionToken: string }>();
    const teamName = `ld_${runId.slice(0, 6)}_t${index}`;
    const made = await postJson(transport, { path: '/api/teams', body: { teamName }, token: session.sessionToken });
    if (made.status !== 201) throw new Error(`team create failed with ${made.status}`);
    const team = await made.json<{ team: { joinCode: string } }>();
    codes.push(team.team.joinCode);
    names.push(teamName);
    if (index === 0) captainToken = session.sessionToken;
  }
  return { joinCodes: codes, captainToken, teamNames: names };
}

/** `ld_{runId6}_c{n}` — inside the 20-character nickname limit beside the users' own. */
export function captainNickname(runId: string, index: number): string {
  return `ld_${runId.slice(0, 6)}_c${index}`;
}
