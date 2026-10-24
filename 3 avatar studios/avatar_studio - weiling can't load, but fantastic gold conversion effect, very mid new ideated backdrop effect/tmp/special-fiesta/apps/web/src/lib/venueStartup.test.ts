import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readItem, removeItem, writeItem } from './storage/localStore.js';
import { FIRST_VISIT_VENUE_WAIT_MS, applyVenueBeforeFirstRender } from './venueStartup.js';

const fetchVenue = vi.hoisted(() => vi.fn());
vi.mock('./api/venue.js', () => ({ fetchVenue }));

const KEY = 'psd.venue.v1';

function meta(): HTMLMetaElement {
  let element = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (element === null) {
    element = document.createElement('meta');
    element.name = 'theme-color';
    document.head.append(element);
  }
  return element;
}

describe('putting the venue on the page before the first render (ADR-299)', () => {
  beforeEach(() => {
    removeItem(KEY);
    delete document.documentElement.dataset['venue'];
    meta().content = '';
    fetchVenue.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the stored venue at once and never waits for the network', async () => {
    writeItem(KEY, 'tessensohn');
    fetchVenue.mockReturnValue(new Promise(() => undefined));

    const theme = await applyVenueBeforeFirstRender();

    expect(theme.id).toBe('tessensohn');
    expect(document.documentElement.dataset['venue']).toBe('tessensohn');
    expect(meta().content).toBe(theme.metaThemeColor);
    expect(fetchVenue).not.toHaveBeenCalled();
  });

  it('on a first visit, waits for the server and wears the venue it names, not the default', async () => {
    // The bug this exists for: a phone with nothing stored used to paint Sentosa first, fetch
    // Sentosa's assets (16 MB with ?backdrop=real), and only then switch.
    fetchVenue.mockResolvedValue({ venue: 'tessensohn' });

    const theme = await applyVenueBeforeFirstRender();

    expect(theme.id).toBe('tessensohn');
    expect(document.documentElement.dataset['venue']).toBe('tessensohn');
    expect(readItem(KEY)).toBe('tessensohn');
  });

  it('on a first visit with a slow server, gives up after the wait and wears the default', async () => {
    vi.useFakeTimers();
    fetchVenue.mockReturnValue(new Promise(() => undefined));

    const pending = applyVenueBeforeFirstRender();
    await vi.advanceTimersByTimeAsync(FIRST_VISIT_VENUE_WAIT_MS);
    const theme = await pending;

    expect(theme.id).toBe('sentosa');
    expect(document.documentElement.dataset['venue']).toBe('sentosa');
    // Nothing is stored on a guess: the hook confirms from the server later and stores THAT.
    expect(readItem(KEY)).toBeNull();
  });

  it('does not give up early: it is still waiting just before the deadline', async () => {
    vi.useFakeTimers();
    fetchVenue.mockReturnValue(new Promise(() => undefined));
    let settled = false;

    void applyVenueBeforeFirstRender().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(FIRST_VISIT_VENUE_WAIT_MS - 1);

    expect(settled).toBe(false);
  });

  it('on a first visit while offline, wears the default at once rather than waiting out the clock', async () => {
    fetchVenue.mockRejectedValue(new Error('offline'));

    const theme = await applyVenueBeforeFirstRender();

    expect(theme.id).toBe('sentosa');
    expect(document.documentElement.dataset['venue']).toBe('sentosa');
    expect(readItem(KEY)).toBeNull();
  });

  it('ignores a venue this build has no theme for, and stores nothing', async () => {
    fetchVenue.mockResolvedValue({ venue: 'atlantis' });

    const theme = await applyVenueBeforeFirstRender();

    expect(theme.id).toBe('sentosa');
    expect(readItem(KEY)).toBeNull();
  });

  it('leaves its deadline timer behind nowhere once the server has answered', async () => {
    // Counting ALL fake timers would also count jsdom's own zero-delay timer that every
    // localStorage write schedules, which is not this code's. What matters is that the 1500 ms
    // deadline it set was cleared: if it were left running it would fire later and do nothing
    // useful, and on a page that lives for hours it would keep the closure alive.
    vi.useFakeTimers();
    const cleared: unknown[] = [];
    const set = globalThis.setTimeout;
    const clear = globalThis.clearTimeout;
    const deadlines: unknown[] = [];
    globalThis.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
      const id = set(fn, ms, ...rest);
      if (ms === FIRST_VISIT_VENUE_WAIT_MS) deadlines.push(id);
      return id;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id?: Parameters<typeof clearTimeout>[0]) => {
      cleared.push(id);
      clear(id);
    }) as typeof clearTimeout;
    fetchVenue.mockResolvedValue({ venue: 'tessensohn' });

    try {
      await applyVenueBeforeFirstRender();
    } finally {
      globalThis.setTimeout = set;
      globalThis.clearTimeout = clear;
    }

    expect(deadlines).toHaveLength(1);
    expect(cleared).toContain(deadlines[0]);
  });
});
