import { EventEmitter } from 'node:events';
import type {
  AnnouncementView,
  FeedActivityView,
  FeedRetractionView,
  LeaderboardView,
  MatchView,
  TeamUpSoonView,
} from '@psd/contracts';

/**
 * ADR-121 — the fan-out behind the one status stream.
 *
 * A second emitter rather than a second topic on `chatBus`, because the two have different
 * audiences and different lifetimes: a chat topic exists while a room is open, these exist for
 * as long as the phone is signed in. Sharing an emitter would also mean one `removeAllListeners`
 * in a test tearing down the other's subscriptions. The reasoning in `chatBus` about why this is
 * an `EventEmitter` and not a broker applies here unchanged: one process, so there is nothing
 * for a broker to carry.
 *
 * `setMaxListeners(0)` for the same reason: one listener is one phone, and three hundred of them
 * is ordinary rather than a leak.
 */

const GLOBAL_EVENT = 'status.global';

/**
 * The frames every phone gets, in one topic so their order is the order they were published in.
 * An announcement and the retraction that unsays it can be published in the same tick, and a
 * retraction that overtakes its announcement leaves it on screen for good.
 */
export type StatusFrame =
  | { kind: 'announcement'; announcement: AnnouncementView }
  | { kind: 'announcement.retracted'; announcementId: string }
  | { kind: 'chat.activity'; activity: FeedActivityView }
  | { kind: 'gallery.activity'; activity: FeedActivityView }
  | { kind: 'chat.retracted'; retraction: FeedRetractionView }
  | { kind: 'gallery.retracted'; retraction: FeedRetractionView }
  | { kind: 'feed.match'; match: MatchView }
  | { kind: 'leaderboard'; leaderboard: LeaderboardView };

export type StatusListener = (frame: StatusFrame) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publishAnnouncement(announcement: AnnouncementView): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'announcement', announcement });
}

export function publishAnnouncementRetracted(announcementId: string): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'announcement.retracted', announcementId });
}

/**
 * ADR-083/125 — a message landed in the global room; every phone whose last-read mark is older
 * than `at` lights a dot.
 *
 * `at` is the message's own `created_at`, passed in by the writer rather than read back here.
 * Taking a fresh `new Date()` at this point would publish a time the database never recorded,
 * and a frame a few milliseconds ahead of the row would survive a reload as a dot the snapshot
 * then disagrees with.
 */
export function publishChatActivity(at: Date): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'chat.activity', activity: { at: at.toISOString() } });
}

/**
 * ADR-153 — a message was hidden, so the room's latest moment may have moved BACKWARDS.
 *
 * `publishChatActivity` cannot carry this. The client merges activity monotonically, on
 * purpose: a frame that arrives after a reconnect must not drag the mark below the snapshot
 * it just loaded. A hide is the one event that legitimately lowers the mark, so it is its own
 * frame and the client assigns rather than compares.
 *
 * Ordering is safe for the same reason ADR-066 gave: this shares one topic with the messages
 * it retracts, and an `EventEmitter` dispatches a topic synchronously in publish order, so a
 * retraction can never overtake a line posted after it.
 *
 * `at` is the latest VISIBLE message's time, read after the hide committed — null when the
 * room has nothing left to show.
 */
export function publishChatRetracted(at: Date | null): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'chat.retracted', retraction: retractionOf(at) });
}

/** One decision, not two: both walls answer "what is left" the same way, including nothing. */
function retractionOf(at: Date | null): FeedRetractionView {
  return { at: at === null ? null : at.toISOString() };
}

/** ADR-153 — the same, one wall over: hiding a photo can lower the gallery's latest too. */
export function publishGalleryRetracted(at: Date | null): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'gallery.retracted', retraction: retractionOf(at) });
}

/** ADR-125 — a photo became visible. One wall, so one global topic. */
export function publishGalleryActivity(at: Date): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'gallery.activity', activity: { at: at.toISOString() } });
}

/**
 * ADR-131 (B6) — a match the feed renders changed.
 *
 * The caller passes the `MatchView` it has already built for its own HTTP response, which is
 * what makes this free: every mutating handler ends by re-reading the record to answer the
 * marshal, so the frame costs no database read of its own — and the frame and the response can
 * never disagree, because they are the same object.
 */
export function publishFeedMatch(match: MatchView): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'feed.match', match });
}

/**
 * ADR-131 (B6) — the board, after a result changed.
 *
 * Global rather than per-team: cluster standings are the same list for everybody, so one frame
 * serves three hundred phones. Unlike `publishFeedMatch` this one cannot be free — standings are
 * an aggregate and somebody has to compute them — which is why its caller is gated on
 * `hasStatusSubscribers()`.
 */
export function publishLeaderboard(leaderboard: LeaderboardView): void {
  emitter.emit(GLOBAL_EVENT, { kind: 'leaderboard', leaderboard });
}

export function subscribeToStatus(listener: StatusListener): () => void {
  emitter.on(GLOBAL_EVENT, listener);
  return () => {
    emitter.off(GLOBAL_EVENT, listener);
  };
}

/**
 * ADR-091 — one topic per team, exactly as the team rooms do it.
 *
 * A team's up-soon transition is interesting to about five people. Publishing it globally and
 * filtering on the client would put every team's fixture movements on every phone's socket, and
 * would hand each phone a map of the whole draw it has no business holding.
 */
function teamTopic(teamId: string): string {
  return `status.team.${teamId}`;
}

export type TeamStatusFrame =
  | { kind: 'team.upsoon'; upSoon: TeamUpSoonView }
  | { kind: 'team.chat.activity'; activity: FeedActivityView }
  | { kind: 'team.chat.retracted'; retraction: FeedRetractionView };

export type TeamStatusListener = (frame: TeamStatusFrame) => void;

export function publishTeamUpSoon(teamId: string, upSoon: TeamUpSoonView): void {
  emitter.emit(teamTopic(teamId), { kind: 'team.upsoon', upSoon });
}

export function publishTeamChatActivity(teamId: string, at: Date): void {
  emitter.emit(teamTopic(teamId), {
    kind: 'team.chat.activity',
    activity: { at: at.toISOString() },
  });
}

/**
 * ADR-153's rule, applied to the room it did not reach: a hide may LOWER a watermark, and the
 * client's activity merge is monotonic on purpose, so the lowering needs a frame the client
 * assigns rather than compares. Per team, because a team room's dot belongs to five people.
 *
 * `at` is the latest VISIBLE line's time, read after the hide committed — null when the hidden
 * line was the only thing in the room, which is a real state and must put the dot out.
 */
export function publishTeamChatRetracted(teamId: string, at: Date | null): void {
  emitter.emit(teamTopic(teamId), {
    kind: 'team.chat.retracted',
    retraction: retractionOf(at),
  });
}

export function subscribeToTeamStatus(teamId: string, listener: TeamStatusListener): () => void {
  const topic = teamTopic(teamId);
  emitter.on(topic, listener);
  return () => {
    emitter.off(topic, listener);
  };
}

/**
 * Is anybody listening to anything on this bus?
 *
 * Design §6 trap 3 — work done for an absent audience is pure waste, and this process has two
 * long stretches of exactly that: the hours before the event and the hours after it, when the
 * up-soon watcher would otherwise tick every five seconds forever. `EventEmitter` already makes
 * a publish with no listeners free; what is not free is *computing* the thing to publish, so the
 * question has to be askable before the work, not after it.
 *
 * Counts every topic rather than one: a connected phone is always on the global topic, so a zero
 * here means no participant has a socket open at all.
 */
export function hasStatusSubscribers(): boolean {
  return emitter.eventNames().some((name) => emitter.listenerCount(name) > 0);
}

/** Test seam: no listener, and no remembered picture, may cross from one test into the next. */
export function resetStatusBusForTests(): void {
  emitter.removeAllListeners();
}
