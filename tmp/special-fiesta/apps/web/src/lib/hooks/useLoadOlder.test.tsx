import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoadOlder } from './useLoadOlder.js';

/**
 * ADR-065 — fetch older messages before the reader reaches the top, without moving the page.
 *
 * Both halves need browser behaviour jsdom does not have, so both are stubbed rather than mocked
 * away: a fake `IntersectionObserver` whose callback this file keeps hold of, and a settable
 * `scrollHeight` so a prepend can be simulated. What is asserted is what the ADR promises — it
 * triggers early, it gives the reader their place back, and it never scrolls when nothing grew.
 *
 * A harness component rather than `renderHook`, because the hook returns a ref that must be on a real
 * node before its effect runs; assigning `result.current.current` afterwards is too late.
 */

interface Captured {
  callback: (entries: { isIntersecting: boolean }[]) => void;
  options: { root?: Element | null; rootMargin?: string } | undefined;
  disconnect: () => void;
  observe: () => void;
}

let observers: Captured[] = [];

function Harness(props: { oldestId: string | undefined; canLoad: boolean; load: () => void }) {
  const sentinelRef = useLoadOlder(props);
  return <div ref={sentinelRef} data-testid="sentinel" />;
}

/** ADR-098 — the list scrolling inside its own container, the participant-shell way. */
function ContainedHarness(props: {
  oldestId: string | undefined;
  canLoad: boolean;
  load: () => void;
}) {
  const sentinelRef = useLoadOlder(props);
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <div ref={sentinelRef} data-testid="sentinel" />
    </div>
  );
}

function setHeight(height: number): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: height,
    configurable: true,
  });
}

beforeEach(() => {
  observers = [];
  setHeight(1000);
  vi.stubGlobal(
    'IntersectionObserver',
    class FakeObserver {
      disconnect: () => void;
      observe: () => void;
      unobserve = vi.fn();
      takeRecords = vi.fn();

      constructor(
        callback: (entries: { isIntersecting: boolean }[]) => void,
        options?: { rootMargin?: string },
      ) {
        const entry: Captured = {
          callback,
          options,
          disconnect: vi.fn(),
          observe: vi.fn(),
        };
        observers.push(entry);
        this.disconnect = entry.disconnect;
        this.observe = entry.observe;
      }
    },
  );
  vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const intersect = () => observers[0]?.callback([{ isIntersecting: true }]);

describe('useLoadOlder', () => {
  it('watches with a generous margin, so it fires before the sentinel is on screen', () => {
    render(<Harness oldestId="m9" canLoad load={vi.fn()} />);

    expect(observers).toHaveLength(1);
    expect(observers[0]?.options?.rootMargin).toBe('400px 0px 0px 0px');
    expect(observers[0]?.observe).toHaveBeenCalledTimes(1);
  });

  it('asks for more when the sentinel comes into range', () => {
    const load = vi.fn();
    render(<Harness oldestId="m9" canLoad load={load} />);

    intersect();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when there is nothing more to load', () => {
    const load = vi.fn();
    render(<Harness oldestId="m9" canLoad={false} load={load} />);

    intersect();

    expect(load).not.toHaveBeenCalled();
  });

  it('stays quiet while the sentinel is out of range', () => {
    const load = vi.fn();
    render(<Harness oldestId="m9" canLoad load={load} />);

    observers[0]?.callback([{ isIntersecting: false }]);

    expect(load).not.toHaveBeenCalled();
  });

  /*
   * The anchor. Without it, prepending a page pushes content down while the browser keeps `scrollY`,
   * so what the reader was looking at appears to jump by the height of the new page.
   */
  it('gives the reader their place back once the older page lands', () => {
    const load = vi.fn();
    const view = render(<Harness oldestId="m9" canLoad load={load} />);

    intersect();
    // The prepend: a taller document, and a new oldest message at the top.
    setHeight(1600);
    view.rerender(<Harness oldestId="m1" canLoad load={load} />);

    expect(window.scrollBy).toHaveBeenCalledWith(0, 600);
  });

  it('does not move the page when the prepend added no height', () => {
    const load = vi.fn();
    const view = render(<Harness oldestId="m9" canLoad load={load} />);

    intersect();
    view.rerender(<Harness oldestId="m1" canLoad load={load} />);

    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('holds the anchor until the request actually lands', () => {
    const load = vi.fn();
    const view = render(<Harness oldestId="m9" canLoad load={load} />);

    intersect();
    setHeight(1600);
    // Same oldest id: nothing has arrived yet, so the anchor must be held rather than spent.
    view.rerender(<Harness oldestId="m9" canLoad load={load} />);

    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('spends the anchor once, not on every later render', () => {
    const load = vi.fn();
    const view = render(<Harness oldestId="m9" canLoad load={load} />);

    intersect();
    setHeight(1600);
    view.rerender(<Harness oldestId="m1" canLoad load={load} />);
    setHeight(2200);
    view.rerender(<Harness oldestId="m0" canLoad load={load} />);

    expect(window.scrollBy).toHaveBeenCalledTimes(1);
  });

  it('ADR-098: anchors inside the scroll container when the list scrolls in one', () => {
    const load = vi.fn();
    const view = render(<ContainedHarness oldestId="m9" canLoad load={load} />);
    const scroller = view.getByTestId('scroller');
    let top = 40;
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = value;
      },
    });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });

    // The observer watches within the container, not the viewport.
    expect(observers[0]?.options?.root).toBe(scroller);

    intersect();
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1600 });
    view.rerender(<ContainedHarness oldestId="m1" canLoad load={load} />);

    // The place restore moved the container, and never touched the window.
    expect(top).toBe(640);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('lets go of the observer when the list goes away', () => {
    const view = render(<Harness oldestId="m9" canLoad load={vi.fn()} />);
    const [first] = observers;

    view.unmount();

    expect(first?.disconnect).toHaveBeenCalled();
  });

  it('degrades quietly where IntersectionObserver does not exist', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const load = vi.fn();

    expect(() => render(<Harness oldestId="m9" canLoad load={load} />)).not.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});
