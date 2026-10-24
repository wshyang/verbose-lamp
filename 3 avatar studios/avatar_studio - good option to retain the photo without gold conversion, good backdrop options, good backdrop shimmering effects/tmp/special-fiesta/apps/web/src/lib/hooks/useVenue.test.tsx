import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { removeItem, writeItem } from '../storage/localStore.js';
import { useVenue } from './useVenue.js';

const fetchVenue = vi.hoisted(() => vi.fn());
vi.mock('../api/venue.js', () => ({ fetchVenue }));

const KEY = 'psd.venue.v1';

function metaThemeColor(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta === null) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  return meta;
}

describe('useVenue (ADR-295)', () => {
  beforeEach(() => {
    removeItem(KEY);
    delete document.documentElement.dataset['venue'];
    metaThemeColor().content = '';
    fetchVenue.mockReset();
  });

  it('wears the default venue before the server has answered', () => {
    fetchVenue.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useVenue());

    expect(result.current.id).toBe('sentosa');
    expect(document.documentElement.dataset['venue']).toBe('sentosa');
  });

  it('sets the browser chrome colour from the theme', () => {
    fetchVenue.mockReturnValue(new Promise(() => undefined));

    renderHook(() => useVenue());

    expect(metaThemeColor().content).toBe('#2f7dd1');
  });

  it('keeps what the server says, so the next load paints right first time', async () => {
    fetchVenue.mockResolvedValue({ venue: 'sentosa' });

    renderHook(() => useVenue());

    await waitFor(() => expect(localStorage.getItem(KEY)).toBe('sentosa'));
  });

  it('ignores a venue this build has no theme for, and keeps what it was wearing', async () => {
    // A newer server than this client build: the id is real to the server and unknown here.
    writeItem(KEY, 'sentosa');
    fetchVenue.mockResolvedValue({ venue: 'atlantis' });

    const { result } = renderHook(() => useVenue());
    await waitFor(() => expect(fetchVenue).toHaveBeenCalled());

    expect(result.current.id).toBe('sentosa');
    expect(localStorage.getItem(KEY)).toBe('sentosa');
  });

  it('stays on the cached venue when the phone is offline', async () => {
    writeItem(KEY, 'sentosa');
    fetchVenue.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useVenue());
    await waitFor(() => expect(fetchVenue).toHaveBeenCalled());

    expect(result.current.id).toBe('sentosa');
    expect(document.documentElement.dataset['venue']).toBe('sentosa');
  });

  it('asks the server once per mount, not on every render', async () => {
    fetchVenue.mockResolvedValue({ venue: 'sentosa' });

    const { rerender } = renderHook(() => useVenue());
    rerender();
    rerender();
    await waitFor(() => expect(fetchVenue).toHaveBeenCalledTimes(1));
  });
});
