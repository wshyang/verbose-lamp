import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notifyAnnouncement,
  notifyUpSoon,
  requestNotificationPermission,
  resetNotificationsForTests,
} from './notify.js';

/**
 * ADR-103 — the browser-notification contract: ask once politely, notify each announcement
 * once however many polls or page changes see it, and treat "up soon" as an edge, not a level.
 * jsdom has no Notification API, which doubles as the unsupported-browser case.
 */

function stubNotification(permission: string) {
  const constructed: { title: string; body: string | undefined }[] = [];
  const requestPermission = vi.fn().mockResolvedValue('granted');
  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;
    constructor(title: string, options?: { body?: string }) {
      constructed.push({ title, body: options?.body });
    }
  }
  vi.stubGlobal('Notification', FakeNotification);
  return { constructed, requestPermission };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetNotificationsForTests();
});

describe('browser notifications (ADR-103)', () => {
  it('is a quiet no-op everywhere when the API does not exist', () => {
    expect(() => {
      requestNotificationPermission();
      notifyAnnouncement('a-1', 'hello');
      notifyUpSoon({ isUpSoon: true });
    }).not.toThrow();
  });

  it('asks for permission only while the question is still open', () => {
    const undecided = stubNotification('default');
    requestNotificationPermission();
    expect(undecided.requestPermission).toHaveBeenCalledTimes(1);

    const denied = stubNotification('denied');
    requestNotificationPermission();
    expect(denied.requestPermission).not.toHaveBeenCalled();
  });

  it('notifies an announcement once per id, across any number of polls', () => {
    const { constructed } = stubNotification('granted');
    notifyAnnouncement('a-1', 'Finals at 4pm');
    notifyAnnouncement('a-1', 'Finals at 4pm');
    notifyAnnouncement('a-2', 'BBQ tonight!');

    expect(constructed).toHaveLength(2);
    expect(constructed[0]?.body).toBe('Finals at 4pm');
    expect(constructed[1]?.body).toBe('BBQ tonight!');
  });

  it('swallows a constructor the engine refuses — the in-app toast remains', () => {
    class RefusingNotification {
      static permission = 'granted';
      static requestPermission = vi.fn();
      constructor() {
        throw new Error('page context not allowed');
      }
    }
    vi.stubGlobal('Notification', RefusingNotification);

    expect(() => notifyAnnouncement('a-1', 'hello')).not.toThrow();
  });

  it('stays silent without a granted permission', () => {
    const { constructed } = stubNotification('denied');
    notifyAnnouncement('a-1', 'hello');
    notifyUpSoon({ isUpSoon: true });
    expect(constructed).toHaveLength(0);
  });

  it('treats "up soon" as an edge: once on rising, rearmed by falling', () => {
    const { constructed } = stubNotification('granted');
    notifyUpSoon({ isUpSoon: true });
    notifyUpSoon({ isUpSoon: true });
    expect(constructed).toHaveLength(1);

    notifyUpSoon({ isUpSoon: false });
    notifyUpSoon({ isUpSoon: true });
    expect(constructed).toHaveLength(2);
  });
});
