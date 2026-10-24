/**
 * ADR-103 — browser notifications for the two things worth interrupting someone over:
 * a staff announcement, and "your team plays soon" (ADR-091).
 *
 * Permission is asked for once, right after sign-in — the one moment the participant is
 * already engaging with the app, rather than ambushing them on a cold landing page.
 * Everything here is guarded: a browser without the API (or a refused permission) makes
 * every call a quiet no-op, and the in-app toast/LED remain the source of truth.
 *
 * **Two, and deliberately not three.** A match result was considered and ruled out on
 * 2026-10-03: results update the feed list in place and interrupt nobody, your own team's
 * included. The threshold for a buzz is being *needed somewhere* — a thing the participant
 * has to act on, now — and a scoreline is not that, however much they care about it. At forty
 * teams it would also be a notification every couple of minutes, which trains people to
 * ignore the one that matters. If you are here to add `notifyMatchResult`, that is the
 * conversation to reopen first.
 *
 * Dedup lives at module level, NOT in a hook: the alerts store remounts on every page
 * navigation, and a ref would re-notify on each one. A module survives navigation and
 * resets on reload, which matches how long a notification stays relevant.
 */

const notifiedAnnouncements = new Set<string>();
let upSoonAnnounced = false;

function canNotify(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

/** Ask once, after sign-in. A previous grant or denial is respected without re-prompting. */
export function requestNotificationPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') void Notification.requestPermission();
}

function push(title: string, body: string): void {
  if (!canNotify()) return;
  try {
    // Fire-and-forget: the OS owns presentation, and a failure must never break a poll.
    void new Notification(title, { body });
  } catch {
    // Some engines only allow construction from a service worker; the in-app toast remains.
  }
}

/** One notification per announcement id, however many polls or page changes see it. */
export function notifyAnnouncement(id: string, body: string): void {
  if (notifiedAnnouncements.has(id)) return;
  notifiedAnnouncements.add(id);
  push('PSD Active Day — announcement', body);
}

/** Edge-triggered: fires when "up soon" turns on, rearms when it turns off. */
export function notifyUpSoon(state: { isUpSoon: boolean }): void {
  if (!state.isUpSoon) {
    upSoonAnnounced = false;
    return;
  }
  if (upSoonAnnounced) return;
  upSoonAnnounced = true;
  push('PSD Active Day — get ready!', 'Your team plays soon. Head to your court.');
}

/** Tests own the module state; nothing else may call this. */
export function resetNotificationsForTests(): void {
  notifiedAnnouncements.clear();
  upSoonAnnounced = false;
}
