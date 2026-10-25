import { afterEach, describe, expect, it } from 'vitest';
import { statusStreamUrl } from './statusStream.js';
import { clearSessionToken, writeSessionToken } from '../session/tokenStore.js';
import { clearScreenKey, writeScreenKey } from '../session/screenKeyStore.js';

/**
 * ADR-016/140 — who the live socket says it is.
 *
 * `EventSource` cannot set a request header, so this URL is the *only* place a credential can
 * ride on the stream. Nothing else in the app proves it: the hall screen's whole claim to be
 * live rests on the key reaching the server down this one string.
 */

afterEach(() => {
  clearSessionToken();
  clearScreenKey();
  window.localStorage.clear();
});

describe('the status stream URL', () => {
  it('is bare when nobody is signed in and no screen is keyed', () => {
    expect(statusStreamUrl()).toBe('/api/status/stream');
  });

  it('carries a participant session', () => {
    writeSessionToken('tok-1');
    expect(statusStreamUrl()).toBe('/api/status/stream?session_token=tok-1');
  });

  it('carries a hall screen key — the one way a projector can be live', () => {
    writeScreenKey('scr-1');
    expect(statusStreamUrl()).toBe('/api/status/stream?screen_key=scr-1');
  });

  it('carries both when an organiser previews the screen in their own browser', () => {
    writeSessionToken('tok-1');
    writeScreenKey('scr-1');
    expect(statusStreamUrl()).toBe('/api/status/stream?session_token=tok-1&screen_key=scr-1');
  });
});
