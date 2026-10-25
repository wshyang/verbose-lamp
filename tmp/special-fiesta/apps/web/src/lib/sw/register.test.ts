import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SHELL_POLICY_POLL_MS,
  applyAppShellPolicy,
  isStationPath,
  watchAppShellPolicy,
} from './register.js';

/**
 * ADR-147 — the switch, which is the only part of the service worker this repository can
 * actually test.
 *
 * The cases that matter are the ones where a worker must *not* appear and the ones where an
 * existing worker must disappear. Installing is the easy half; retiring is the half that has
 * to work on a bad afternoon.
 */

interface FakeRegistration {
  unregister: ReturnType<typeof vi.fn>;
}

let registrations: FakeRegistration[];
let register: ReturnType<typeof vi.fn>;
let cacheNames: string[];
let deleted: string[];

function installFakes(options: { supported: boolean }) {
  registrations = [{ unregister: vi.fn().mockResolvedValue(true) }];
  register = vi.fn().mockResolvedValue({});
  const container = {
    register,
    getRegistrations: vi.fn(async () => registrations),
  };
  if (options.supported) {
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }

  cacheNames = ['psd-shell-aaa111', 'psd-shell-bbb222', 'some-other-app'];
  deleted = [];
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      keys: async () => cacheNames,
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    },
  });
}

function answerPolicy(body: unknown, init?: { ok: boolean }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: init?.ok ?? true,
      json: async () => body,
    })),
  );
}

beforeEach(() => {
  installFakes({ supported: true });
  window.history.pushState({}, '', '/staff/sync');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the app shell policy', () => {
  it('installs a worker on a station page when the switch is on', async () => {
    answerPolicy({ serveFromCache: true });
    await expect(applyAppShellPolicy()).resolves.toBe('registered');
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('asks for the policy in a way no cache may answer', async () => {
    answerPolicy({ serveFromCache: true });
    await applyAppShellPolicy();
    expect(fetch).toHaveBeenCalledWith('/api/app-shell-policy', { cache: 'no-store' });
  });

  /*
   * The audience boundary. A participant on their own phone must never acquire a worker,
   * which is what keeps the blast radius at twenty known devices instead of three hundred
   * unknown ones — the finding that chose this scope in the first place.
   */
  it('installs nothing on a participant page, however the switch is set', async () => {
    window.history.pushState({}, '', '/board');
    answerPolicy({ serveFromCache: true });
    await expect(applyAppShellPolicy()).resolves.toBe('not-a-station');
    expect(register).not.toHaveBeenCalled();
  });

  it('retires an installed worker and empties our caches when the switch goes off', async () => {
    answerPolicy({ serveFromCache: false });
    await expect(applyAppShellPolicy()).resolves.toBe('retired');
    expect(registrations[0]?.unregister).toHaveBeenCalled();
    expect(deleted).toEqual(['psd-shell-aaa111', 'psd-shell-bbb222']);
  });

  /* Switched off is switched off everywhere: a station phone whose user wandered to the
   * leaderboard still hears it, because the kill switch cannot depend on where somebody is
   * standing in the app. */
  it('retires from a participant page too', async () => {
    window.history.pushState({}, '', '/board');
    answerPolicy({ serveFromCache: false });
    await expect(applyAppShellPolicy()).resolves.toBe('retired');
    expect(registrations[0]?.unregister).toHaveBeenCalled();
  });

  it('leaves a stranger\u2019s cache alone while retiring', async () => {
    answerPolicy({ serveFromCache: false });
    await applyAppShellPolicy();
    expect(deleted).not.toContain('some-other-app');
  });

  /*
   * The fail-safe direction, and it is deliberately not fail-closed. A phone that cannot
   * reach the policy is usually the phone in the dead spot this feature exists for.
   */
  it('changes nothing when the policy cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await expect(applyAppShellPolicy()).resolves.toBe('unknown');
    expect(register).not.toHaveBeenCalled();
    expect(registrations[0]?.unregister).not.toHaveBeenCalled();
  });

  it('changes nothing when the server answers an error', async () => {
    answerPolicy({ error: {} }, { ok: false });
    await expect(applyAppShellPolicy()).resolves.toBe('unknown');
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing at all in a browser without service workers', async () => {
    installFakes({ supported: false });
    answerPolicy({ serveFromCache: true });
    await expect(applyAppShellPolicy()).resolves.toBe('unsupported');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('swallows a registration that fails, because the app is correct without one', async () => {
    answerPolicy({ serveFromCache: true });
    register.mockRejectedValue(new Error('insecure context'));
    await expect(applyAppShellPolicy()).resolves.toBe('failed');
  });

  it('treats /staff and its children as stations, and nothing else', () => {
    expect(isStationPath('/staff')).toBe(true);
    expect(isStationPath('/staff/court/abc')).toBe(true);
    expect(isStationPath('/staffing')).toBe(false);
    expect(isStationPath('/')).toBe(false);
  });

  /*
   * A station tab is open for a whole shift. Without this the kill switch would only reach
   * phones that happened to reload, which is the ones that needed it least.
   */
  it('keeps asking, so a tab open all day still hears the switch', async () => {
    vi.useFakeTimers();
    answerPolicy({ serveFromCache: true });
    const stop = watchAppShellPolicy();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(APP_SHELL_POLICY_POLL_MS);
    expect(fetch).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(APP_SHELL_POLICY_POLL_MS * 2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
