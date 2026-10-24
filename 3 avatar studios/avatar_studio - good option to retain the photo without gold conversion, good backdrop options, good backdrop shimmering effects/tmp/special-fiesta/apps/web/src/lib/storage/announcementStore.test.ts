import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceAnnouncementFloor,
  forgetAnnouncementFloor,
  hasAnnouncementFloor,
  readAnnouncementFloor,
  seedAnnouncementFloor,
} from './announcementStore.js';

/**
 * ADR-082 — the announcement floor.
 *
 * One stored id meaning "ignore everything at or before this". Seeded at sign-in to the
 * SECOND-newest announcement, which is what makes the newest one stick, and advanced by each
 * dismissal. Ids are UUIDv7, so a plain string comparison is the server's own ordering and no device
 * clock takes part.
 */

const KEY = 'psd.announcements.floor.v1';

/** UUIDv7s in ascending order — the shape the server actually mints, lowercase hex. */
const A = '01a0f000-0000-7000-8000-0000000000a1';
const B = '01a0f000-0000-7000-8000-0000000000a2';
const C = '01a0f000-0000-7000-8000-0000000000a3';
const D = '01a0f000-0000-7000-8000-0000000000a4';

/** The server sends announcements oldest first, so a list is written in that order here too. */
function listOf(...ids: string[]) {
  return ids.map((id) => ({ id }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('reading the floor', () => {
  it('is absent on a browser that has never been seeded', () => {
    expect(hasAnnouncementFloor()).toBe(false);
    expect(readAnnouncementFloor()).toBeNull();
  });

  it('treats a malformed value as absent rather than trusting it', () => {
    // The key is hand-editable, and a bad value must not hide every announcement for the day.
    window.localStorage.setItem(KEY, 'not json at all');

    expect(readAnnouncementFloor()).toBeNull();
  });

  it('treats a value of the wrong shape as absent', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ floorId: 42 }));

    expect(readAnnouncementFloor()).toBeNull();
  });
});

describe('seeding at sign-in', () => {
  it('keeps the newest announcement and ignores everything older', () => {
    // Three live at sign-in: the floor is the second-newest, so only C is still above it.
    expect(seedAnnouncementFloor(listOf(A, B, C))).toBe(B);
    expect(readAnnouncementFloor()).toBe(B);
  });

  it('ignores nothing when only one announcement exists', () => {
    // That one IS the final announcement before sign-in, so it must stick.
    expect(seedAnnouncementFloor(listOf(A))).toBeNull();
    expect(hasAnnouncementFloor()).toBe(true);
  });

  it('ignores nothing when the event has not announced anything yet', () => {
    expect(seedAnnouncementFloor([])).toBeNull();
    /*
     * Seeded with no floor is a different state from never seeded, and the difference is load-bearing:
     * without the key, every poll would seed again and an announcement made after sign-in would be
     * treated as one made before it.
     */
    expect(hasAnnouncementFloor()).toBe(true);
  });
});

describe('advancing past a dismissal', () => {
  it('moves the floor to the announcement just dismissed', () => {
    expect(advanceAnnouncementFloor(B, A)).toBe(B);
    expect(readAnnouncementFloor()).toBe(B);
  });

  it('moves forward from no floor at all', () => {
    expect(advanceAnnouncementFloor(A, null)).toBe(A);
  });

  it('never moves backwards', () => {
    /*
     * A high-water mark only ever rises. Two tabs polling the same event can report positions out of
     * order, and winding the floor back would resurrect announcements this reader has already cleared.
     */
    expect(advanceAnnouncementFloor(B, D)).toBe(D);
    expect(readAnnouncementFloor()).toBe(D);
  });

  it('is idempotent on the floor it already holds', () => {
    expect(advanceAnnouncementFloor(C, C)).toBe(C);
  });
});

describe('signing out', () => {
  it('forgets the floor, so the next participant on a shared phone re-seeds', () => {
    seedAnnouncementFloor(listOf(A, B, C));

    forgetAnnouncementFloor();

    /*
     * The bug this prevents is ADR-064's, one feature over: the chat cursor was not cleared at
     * sign-out, so the next participant on a borrowed phone opened an empty room. Here an inherited
     * floor would hide announcements the new reader has never seen.
     */
    expect(hasAnnouncementFloor()).toBe(false);
    expect(readAnnouncementFloor()).toBeNull();
  });
});
