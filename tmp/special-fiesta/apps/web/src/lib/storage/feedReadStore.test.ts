import { beforeEach, describe, expect, it } from 'vitest';
import {
  NO_MARKS,
  advanceFeedMark,
  forgetFeedMarks,
  hasFeedMarks,
  isFeedUnread,
  readFeedMarks,
  seedFeedMarks,
} from './feedReadStore.js';

/**
 * ADR-125 — the device's own record of how far it has read each social feed.
 *
 * This module is the half of the LED the server cannot see, so the cases that matter are the
 * ones where a wrong answer is silent: a mark that winds backwards relights a dot somebody
 * already cleared, a mark that re-seeds swallows the next message, and a stored value somebody
 * has hand-edited must not blind every LED for the rest of the day.
 */

const KEY = 'psd.feeds.read.v1';
const EARLIER = '2026-09-30T02:00:00.000Z';
const LATER = '2026-09-30T02:05:00.000Z';

beforeEach(() => {
  window.localStorage.clear();
});

describe('the feed read marks', () => {
  it('starts with nothing read and nothing seeded', () => {
    expect(readFeedMarks()).toEqual(NO_MARKS);
    expect(hasFeedMarks()).toBe(false);
  });

  it('seeds every feed from the current watermarks, once', () => {
    const seeded = seedFeedMarks({ chat: LATER, teamChat: EARLIER, gallery: null });

    expect(seeded).toEqual({ chat: LATER, teamChat: EARLIER, gallery: null });
    expect(hasFeedMarks()).toBe(true);

    // A second snapshot must not re-seed, or every message would be mistaken for history.
    expect(seedFeedMarks({ chat: LATER, teamChat: LATER, gallery: LATER })).toEqual({
      chat: LATER,
      teamChat: EARLIER,
      gallery: null,
    });
  });

  /*
   * The empty-feed case is why seeding is tracked by a flag rather than by "is the mark null".
   * A device that arrived before anybody had spoken holds three nulls, and if that counted as
   * unseeded it would re-seed on the next snapshot — swallowing the first message ever sent.
   */
  it('counts as seeded even when every feed was empty', () => {
    seedFeedMarks(NO_MARKS);

    expect(hasFeedMarks()).toBe(true);
    expect(seedFeedMarks({ chat: LATER, teamChat: null, gallery: null })).toEqual(NO_MARKS);
  });

  it('advances a mark forward and writes it down', () => {
    const marks = advanceFeedMark('chat', LATER, NO_MARKS);

    expect(marks.chat).toBe(LATER);
    expect(readFeedMarks().chat).toBe(LATER);
    // One feed at a time: reading chat says nothing about the gallery.
    expect(marks.gallery).toBeNull();
  });

  it('never winds a mark backwards, because two tabs can report out of order', () => {
    const read = advanceFeedMark('chat', LATER, NO_MARKS);

    expect(advanceFeedMark('chat', EARLIER, read).chat).toBe(LATER);
    expect(readFeedMarks().chat).toBe(LATER);
  });

  it('treats an empty feed as no position at all', () => {
    const read = advanceFeedMark('chat', LATER, NO_MARKS);

    expect(advanceFeedMark('chat', null, read).chat).toBe(LATER);
  });

  it('ignores a hand-edited value rather than trusting it', () => {
    window.localStorage.setItem(KEY, '{ not json');

    expect(readFeedMarks()).toEqual(NO_MARKS);
    expect(hasFeedMarks()).toBe(false);
  });

  it('forgets everything at sign-out, so a borrowed phone does not inherit a mark', () => {
    advanceFeedMark('teamChat', LATER, NO_MARKS);

    forgetFeedMarks();

    expect(hasFeedMarks()).toBe(false);
    expect(readFeedMarks()).toEqual(NO_MARKS);
  });

  describe('the comparison itself', () => {
    it('is dark for an empty feed, whatever the reader has stored', () => {
      expect(isFeedUnread(null, null)).toBe(false);
      expect(isFeedUnread(null, EARLIER)).toBe(false);
    });

    it('is lit only when the feed is strictly newer than the mark', () => {
      expect(isFeedUnread(LATER, EARLIER)).toBe(true);
      expect(isFeedUnread(LATER, LATER)).toBe(false);
      expect(isFeedUnread(EARLIER, LATER)).toBe(false);
    });
  });
});
