import { afterEach, describe, expect, it } from 'vitest';
import { adoptScreenKey, clearScreenKey, readScreenKey, writeScreenKey } from './screenKeyStore.js';
import { writeSessionCarrier } from './tokenStore.js';
import { screenKeyCarrier } from './screenKeyStore.js';

afterEach(() => {
  clearScreenKey();
  writeSessionCarrier('header');
  window.localStorage.clear();
});

describe('the hall screen key', () => {
  it('takes the key out of the URL and keeps it, so a reload needs no URL', () => {
    expect(adoptScreenKey('?key=scr-abc')).toBe('scr-abc');
    expect(readScreenKey()).toBe('scr-abc');
    // The projector reloads at three o'clock with a bare URL and is still a screen.
    expect(adoptScreenKey('')).toBe('scr-abc');
  });

  it('lets a freshly minted URL replace a revoked key — the whole recovery procedure', () => {
    writeScreenKey('scr-old');
    expect(adoptScreenKey('?key=scr-new')).toBe('scr-new');
  });

  it('ignores an empty or whitespace key rather than storing a credential that is not one', () => {
    writeScreenKey('scr-abc');
    expect(adoptScreenKey('?key=')).toBe('scr-abc');
    expect(adoptScreenKey('?key=%20%20')).toBe('scr-abc');
  });

  it('has no key before anyone gives it one', () => {
    expect(adoptScreenKey('?other=1')).toBeNull();
  });

  it('rides whichever carrier the deployment already proved works (ADR-016)', () => {
    expect(screenKeyCarrier()).toBe('header');
    writeSessionCarrier('query');
    expect(screenKeyCarrier()).toBe('query');
  });
});
