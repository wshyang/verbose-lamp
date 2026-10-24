import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { signOut } from './participants.js';
import { NO_MARKS, advanceFeedMark, hasFeedMarks } from '../storage/feedReadStore.js';
import { advanceAnnouncementFloor, hasAnnouncementFloor } from '../storage/announcementStore.js';
import { advanceUpSoonFloor, readUpSoonFloor } from '../storage/upSoonStore.js';

/**
 * What signing out has to let go of (ADR-064's bug, twice over).
 *
 * The event runs on borrowed phones, so everything this browser remembers about *who was
 * reading* has to end with the session. The original instance was the chat cursor surviving a
 * sign-out and opening an empty room for the next participant; ADR-082 added the announcement
 * floor; ADR-125 adds the social feeds' read marks, which are worse than either — an inherited
 * team-chat mark belongs to a team the next participant is probably not even in, and it would
 * hide that team's conversation from them for the rest of the day. ADR-133 adds the up-soon
 * floor: left behind, it would swallow the next participant's call to their own court.
 */

let stub: FetchStub;

beforeEach(() => {
  window.localStorage.clear();
  stub = installFetchStub({ 'POST /api/auth/signout': { body: {} } });
});

afterEach(() => {
  stub.restore();
});

describe('signing out', () => {
  it('forgets the read marks, the announcement floor and the up-soon floor', async () => {
    advanceFeedMark('teamChat', '2026-09-30T02:05:00.000Z', NO_MARKS);
    advanceAnnouncementFloor('01a0f000-0000-7000-8000-000000000001', null);
    advanceUpSoonFloor('01a0f000-0000-7000-8000-00000000000a', null);
    expect(hasFeedMarks()).toBe(true);
    expect(hasAnnouncementFloor()).toBe(true);
    expect(readUpSoonFloor()).not.toBeNull();

    await signOut();

    expect(hasFeedMarks()).toBe(false);
    expect(hasAnnouncementFloor()).toBe(false);
    expect(readUpSoonFloor()).toBeNull();
  });
});
