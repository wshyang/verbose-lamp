import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceUpSoonFloor,
  forgetUpSoonFloor,
  readUpSoonFloor,
  shouldAnnounceUpSoon,
} from './upSoonStore.js';

/**
 * ADR-133 (B4) — the floor that stops ADR-118's restart button toasting the whole building.
 *
 * Mirrors `announcementStore.test.ts`, because the failure modes are the same ones: a malformed
 * value must not silence the day, the mark must only ever move forward, and signing out must
 * not leave one participant's state on a borrowed phone.
 */

const KEY = 'psd.upsoon.floor.v1';
const EARLY = '01a0f000-0000-7000-8000-000000000001';
const LATE = '01a0f000-0000-7000-8000-000000000009';

beforeEach(() => window.localStorage.clear());

describe('ADR-133 — the up-soon floor', () => {
  it('starts absent, so the first call is always announced', () => {
    expect(readUpSoonFloor()).toBeNull();
    expect(shouldAnnounceUpSoon(EARLY, null)).toBe(true);
  });

  it('does not announce the fixture it has already announced', () => {
    const floor = advanceUpSoonFloor(EARLY, null);
    expect(shouldAnnounceUpSoon(EARLY, floor)).toBe(false);
  });

  it('announces the next fixture', () => {
    const floor = advanceUpSoonFloor(EARLY, null);
    expect(shouldAnnounceUpSoon(LATE, floor)).toBe(true);
  });

  /** The frame that says the window was left. It moves the LED and has nothing to shout. */
  it('never announces a null fixture', () => {
    expect(shouldAnnounceUpSoon(null, null)).toBe(false);
    expect(shouldAnnounceUpSoon(null, EARLY)).toBe(false);
  });

  it('refuses to wind backwards when frames arrive out of order', () => {
    advanceUpSoonFloor(LATE, null);
    const floor = advanceUpSoonFloor(EARLY, LATE);
    expect(floor).toBe(LATE);
    expect(readUpSoonFloor()).toBe(LATE);
    // And the older fixture still does not get announced a second time.
    expect(shouldAnnounceUpSoon(EARLY, floor)).toBe(false);
  });

  it('survives the browser refusing a write by advancing in memory', () => {
    // `current` is the parameter precisely so the caller keeps the mark when storage will not.
    expect(advanceUpSoonFloor(LATE, EARLY)).toBe(LATE);
  });

  describe('a value that is not what we wrote', () => {
    /**
     * Read as a floor, a corrupt value would silence the toast for the rest of the day; read
     * as absent it costs one duplicate. Missing the call to a court is worse than hearing it
     * twice, so every one of these must come back null.
     */
    it.each([
      ['not json at all', 'wat'],
      ['the wrong shape', '{"somethingElse":1}'],
      ['a number where an id belongs', '{"fixtureId":7}'],
      ['an array', '[]'],
      ['a bare string', '"01a0f000"'],
    ])('treats %s as absent', (_name, raw) => {
      window.localStorage.setItem(KEY, raw);
      expect(readUpSoonFloor()).toBeNull();
      expect(shouldAnnounceUpSoon(EARLY, readUpSoonFloor())).toBe(true);
    });

    it('accepts an explicit null, which is a floor we do write', () => {
      window.localStorage.setItem(KEY, '{"fixtureId":null}');
      expect(readUpSoonFloor()).toBeNull();
    });
  });

  it('is forgotten at sign-out, so the next participant hears their own call', () => {
    advanceUpSoonFloor(LATE, null);
    forgetUpSoonFloor();
    expect(readUpSoonFloor()).toBeNull();
    expect(shouldAnnounceUpSoon(LATE, readUpSoonFloor())).toBe(true);
  });
});
