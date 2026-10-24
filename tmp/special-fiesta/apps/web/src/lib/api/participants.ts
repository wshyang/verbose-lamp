import type {
  AgendaView,
  AvatarSpriteView,
  ParticipantIdentityView,
  ClusterView,
  FixtureView,
  LeaderboardView,
  MatchFeedView,
  ParticipantTotalsView,
  ParticipantView,
  PassportView,
  ScanView,
  SessionView,
  SignUpRequest,
  TournamentBracketView,
  TournamentView,
  UpSoonView,
} from '@psd/contracts';
import { apiGet, apiPost, apiPut } from './client.js';
import { forgetLastPath } from '../session/locationStore.js';
import { forgetAnnouncementFloor } from '../storage/announcementStore.js';
import { forgetUpSoonFloor } from '../storage/upSoonStore.js';
import { forgetFeedMarks } from '../storage/feedReadStore.js';
import { resetLiveBoard } from '../live/boardLive.js';
import { clearSessionToken, writeSessionToken } from '../session/tokenStore.js';

/** Participant + session surfaces: S1–S6, S60. */

/**
 * Every sign-in answers with the session token as well as the account (ADR-016): a browser
 * that refuses the cookie can still hold the token and send it as a bearer credential.
 */
export interface AuthResult<T> {
  participant?: T;
  sessionToken: string;
}

/** One door for all four sign-ins, so the token is never captured in only three of them. */
async function authenticate<T>(path: string, body: unknown): Promise<AuthResult<T>> {
  const result = await apiPost<AuthResult<T>>(path, body);
  writeSessionToken(result.sessionToken);
  return result;
}

export function fetchSession(): Promise<SessionView> {
  return apiGet<SessionView>('/api/auth/session');
}

export function fetchClusters(): Promise<{ items: ClusterView[] }> {
  return apiGet<{ items: ClusterView[] }>('/api/clusters');
}

/**
 * ADR-164 — every nickname in one cluster, for somebody who has forgotten theirs. No session:
 * the only caller who needs it is one who cannot sign in.
 */
export function fetchClusterNicknames(clusterCode: string): Promise<{ nicknames: string[] }> {
  return apiGet<{ nicknames: string[] }>(
    `/api/participants/nicknames?clusterCode=${encodeURIComponent(clusterCode)}`,
  );
}

export function signUp(body: SignUpRequest): Promise<AuthResult<ParticipantView>> {
  return authenticate<ParticipantView>('/api/auth/participants/signup', body);
}

export function signInParticipant(body: {
  nickname: string;
  pin: string;
}): Promise<AuthResult<ParticipantView>> {
  return authenticate<ParticipantView>('/api/auth/participants/signin', body);
}

export function signInFacilitator(body: {
  username: string;
  passcode: string;
}): Promise<AuthResult<unknown>> {
  return authenticate<unknown>('/api/auth/facilitators/signin', body);
}

export function signInSuperadmin(body: {
  username: string;
  passcode: string;
}): Promise<AuthResult<unknown>> {
  return authenticate<unknown>('/api/auth/superadmins/signin', body);
}

export async function signOut(): Promise<unknown> {
  /*
   * The local forgetting happens in `finally`: before, a request that threw skipped every line
   * below it, leaving the announcement floor, the feed marks and the up-soon floor on the phone
   * for whoever signed in next. The throw still propagates — the caller has to know the server
   * never confirmed (see useSessionState.endSession) — but this device forgets either way.
   */
  try {
    return await apiPost('/api/auth/signout');
  } finally {
    clearSessionToken();
    forgetLastPath();
    /*
     * ADR-082 — the announcement floor is per sign-in, so it cannot outlive one.
     *
     * Left behind, it would hide announcements from the next participant on a borrowed phone, which is
     * ADR-064's bug one feature over: the chat cursor survived a sign-out and opened an empty room.
     */
    forgetAnnouncementFloor();
    /*
     * ADR-125 — and the social feeds' read marks, for the same reason and one worse: an inherited
     * team-chat mark belongs to a team the next participant on this phone is probably not in.
     */
    forgetFeedMarks();
    /*
     * ADR-133 — and the up-soon floor. The next participant on this phone is in a different
     * team, playing a different fixture, and must hear their own call.
     */
    forgetUpSoonFloor();
    /*
     * ADR-132 — and whatever the socket pushed. Unlike the two above this is in memory only, so
     * it dies with the tab anyway; it is cleared here for the borrowed phone that signs straight
     * back in without a reload, where a retained board would be the previous session's.
     */
    resetLiveBoard();
  }
}

export function fetchMe(): Promise<{
  participant: ParticipantView;
  totals: ParticipantTotalsView;
}> {
  return apiGet('/api/me');
}

/** S4 — redraw yourself; the server only ever lets you change your own face (ADR-021). */
export function updateAvatar(body: {
  avatarVariant: number;
  avatarLook: string;
}): Promise<{ participant: ParticipantView }> {
  return apiPut('/api/me/avatar', body);
}

export function fetchMyScans(): Promise<{ items: ScanView[]; totals: ParticipantTotalsView }> {
  return apiGet('/api/me/scans');
}

/** ADR-239 — the passport tab: every station, and which of them this participant has completed. */
export function fetchMyPassport(): Promise<PassportView> {
  return apiGet<PassportView>('/api/me/passport');
}

export function fetchLeaderboard(): Promise<LeaderboardView> {
  return apiGet<LeaderboardView>('/api/leaderboard');
}

export function fetchMatchFeed(): Promise<MatchFeedView> {
  return apiGet('/api/tournament/matches/feed');
}

/** ADR-035 — the sprite bodies for ids a browser has not seen before. */
export async function fetchAvatarSprites(ids: readonly string[]): Promise<AvatarSpriteView[]> {
  const query = new URLSearchParams({ ids: ids.join(',') });
  const body = await apiGet<{ items: AvatarSpriteView[] }>(`/api/avatars?${query.toString()}`)
    .catch(() => ({ items: [] }));
  return body.items;
}

/**
 * ADR-202 — the people behind a set of participant ids, for a surface that holds only ids.
 *
 * Fails to an empty list like `fetchAvatarSprites` above: a directory lookup is an
 * enhancement to a room that already renders without it, so a dropped request costs a face
 * and never a message.
 */
export async function fetchParticipantIdentities(
  ids: readonly string[],
): Promise<ParticipantIdentityView[]> {
  const query = new URLSearchParams({ ids: ids.join(',') });
  const body = await apiGet<{ items: ParticipantIdentityView[] }>(
    `/api/participants/identities?${query.toString()}`,
  ).catch(() => ({ items: [] }));
  return body.items;
}

/** ADR-089 — the Line-ups tab: every unresolved fixture, in play order. */
/**
 * ADR-150 — the day's shape for the hall screen: groups and the road to the final, at
 * whatever stage the day has reached. One read; the server decides whether it is a plan or
 * a draw, so the wall never has to.
 */
export function fetchBracket(): Promise<{ bracket: TournamentBracketView }> {
  return apiGet('/api/tournament/bracket');
}

/** ADR-177 — the day's programme. A guest read: the run sheet is not behind a session. */
export function fetchAgenda(): Promise<AgendaView> {
  return apiGet('/api/agenda');
}

export function fetchLineups(): Promise<{
  tournament: TournamentView | null;
  items: FixtureView[];
  /** ADR-091 — the viewer's own next fixture when it is inside the capacity window. */
  viewerUpSoon: UpSoonView | null;
  /** ADR-321 — 'dumb' while dumb courts operate: there are no line-ups, and the tab says so. */
  mode: 'matches' | 'dumb';
}> {
  return apiGet('/api/tournament/lineups');
}
