import { describe, expect, it, vi } from 'vitest';
import {
  activateWaitingUpdate,
  isUpdateWaiting,
  SKIP_WAITING_MESSAGE,
  type ContainerLike,
  type RegistrationLike,
} from './update.js';

/**
 * ADR-182 — the worker's wait, made visible without being shortened.
 *
 * A real service worker cannot be exercised in jsdom at all, which is why every judgement here
 * is made against an injected container rather than `navigator.serviceWorker`.
 */

function containerOf(
  registration: RegistrationLike | null,
  controller: unknown = {},
): ContainerLike {
  return { controller, getRegistration: () => Promise.resolve(registration) };
}

describe('isUpdateWaiting', () => {
  it('is false when no worker is registered at all', async () => {
    expect(await isUpdateWaiting(containerOf(null))).toBe(false);
  });

  it('is false when the registered worker is the only one', async () => {
    expect(await isUpdateWaiting(containerOf({ waiting: null }))).toBe(false);
  });

  it('is true when a newer worker is held back on a controlled page', async () => {
    expect(await isUpdateWaiting(containerOf({ waiting: { postMessage: vi.fn() } }))).toBe(true);
  });

  it('is false on the very first install, which is not an update', async () => {
    /*
     * The trap this exists to stop: `waiting` is also set while the first worker a device ever
     * installs finishes up. With no `controller` there is nothing it could be newer THAN, and
     * announcing "a new version is ready" to someone opening the app for the first time is
     * both wrong and alarming.
     */
    const container = containerOf({ waiting: { postMessage: vi.fn() } }, null);
    expect(await isUpdateWaiting(container)).toBe(false);
  });

  it('asks the network before answering, and shrugs off being offline', async () => {
    const update = vi.fn(() => Promise.resolve());
    expect(await isUpdateWaiting(containerOf({ waiting: null, update }))).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);

    // A station in a dead spot is the normal case, not an error: there is no new build to find.
    const offline = vi.fn(() => Promise.reject(new Error('offline')));
    const waiting = { waiting: { postMessage: vi.fn() }, update: offline };
    await expect(isUpdateWaiting(containerOf(waiting))).resolves.toBe(true);
  });
});

describe('activateWaitingUpdate', () => {
  it('asks the waiting worker to stand down, and says it did', async () => {
    const postMessage = vi.fn();
    expect(await activateWaitingUpdate(containerOf({ waiting: { postMessage } }))).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE });
  });

  it('reports having nobody to tell, rather than throwing', async () => {
    // Another tab can press Reload first, which leaves this one holding a stale registration.
    expect(await activateWaitingUpdate(containerOf({ waiting: null }))).toBe(false);
    expect(await activateWaitingUpdate(containerOf(null))).toBe(false);
  });
});
