import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  PULL_SETTLE_MS,
  PULL_THRESHOLD_PX,
  pullHintFor,
  usePullToRefresh,
} from './usePullToRefresh.js';

/**
 * ADR-096 — the gesture contract: arms only at the top of the page, resists, refreshes
 * only past the threshold, and never fires twice for one release. jsdom has no real
 * TouchEvent plumbing, so events are built by hand with a `touches` list attached.
 */

function PullHost({ onRefresh }: { onRefresh: () => void }) {
  const pull = usePullToRefresh<HTMLDivElement>(onRefresh);
  return (
    <div
      ref={pull.ref}
      data-testid="host"
      data-pull={pull.state.pullPx}
      data-armed={pull.state.isArmed}
      data-refreshing={pull.state.isRefreshing}
    >
      {pullHintFor(pull.state)}
    </div>
  );
}

/** ADR-098 — the same host, but scrolling inside its own container like `.gb-main`. */
function ContainedPullHost({ onRefresh }: { onRefresh: () => void }) {
  const pull = usePullToRefresh<HTMLDivElement>(onRefresh);
  return (
    <div data-testid="container" style={{ overflowY: 'auto' }}>
      <div
        ref={pull.ref}
        data-testid="host"
        data-pull={pull.state.pullPx}
        data-armed={pull.state.isArmed}
        data-refreshing={pull.state.isRefreshing}
      >
        {pullHintFor(pull.state)}
      </div>
    </div>
  );
}

function touch(el: Element, type: string, clientY: number | null): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: clientY === null ? [] : [{ clientY }],
  });
  act(() => {
    el.dispatchEvent(event);
  });
  return event;
}

/** A full drag: down from `from` by `by` pixels of finger travel, then release. */
function drag(el: Element, by: number) {
  touch(el, 'touchstart', 100);
  touch(el, 'touchmove', 100 + by);
  touch(el, 'touchend', null);
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'scrollY');
  vi.useRealTimers();
});

describe('usePullToRefresh (ADR-096)', () => {
  it('refreshes once when the pull is released past the threshold', () => {
    const onRefresh = vi.fn();
    render(<PullHost onRefresh={onRefresh} />);
    const host = screen.getByTestId('host');

    // Finger travel is dampened 2:1, so twice the threshold is comfortably past it.
    drag(host, PULL_THRESHOLD_PX * 2 + 20);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(host.dataset['refreshing']).toBe('true');
    expect(host.textContent).toBe('Refreshing…');
    // The panel pins at the threshold while refreshing, then settles home.
    expect(host.dataset['pull']).toBe(String(PULL_THRESHOLD_PX));
    act(() => {
      vi.advanceTimersByTime(PULL_SETTLE_MS);
    });
    expect(host.dataset['refreshing']).toBe('false');
    expect(host.dataset['pull']).toBe('0');
  });

  it('snaps back without refreshing when released early', () => {
    const onRefresh = vi.fn();
    render(<PullHost onRefresh={onRefresh} />);
    const host = screen.getByTestId('host');

    touch(host, 'touchstart', 100);
    touch(host, 'touchmove', 140); // 40px of travel → 20px of pull, under the threshold
    expect(host.dataset['pull']).toBe('20');
    expect(host.textContent).toBe('Pull to refresh');
    touch(host, 'touchend', null);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(host.dataset['pull']).toBe('0');
  });

  it('says "Release to refresh" the moment the pull crosses the threshold', () => {
    render(<PullHost onRefresh={vi.fn()} />);
    const host = screen.getByTestId('host');

    touch(host, 'touchstart', 100);
    touch(host, 'touchmove', 100 + PULL_THRESHOLD_PX * 2);

    expect(host.dataset['armed']).toBe('true');
    expect(host.textContent).toBe('Release to refresh');
  });

  it('prevents the page rubber-band only while actually pulling', () => {
    render(<PullHost onRefresh={vi.fn()} />);
    const host = screen.getByTestId('host');

    touch(host, 'touchstart', 100);
    const pulling = touch(host, 'touchmove', 180);
    expect(pulling.defaultPrevented).toBe(true);

    // Dragging upward is scrolling; the browser keeps it.
    const scrolling = touch(host, 'touchmove', 40);
    expect(scrolling.defaultPrevented).toBe(false);
  });

  it('never arms while the page is scrolled away from the top', () => {
    const onRefresh = vi.fn();
    render(<PullHost onRefresh={onRefresh} />);
    const host = screen.getByTestId('host');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });

    drag(host, 400);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(host.dataset['pull']).toBe('0');
  });

  it('ADR-098: arms against the scroll container when the list scrolls in one', () => {
    const onRefresh = vi.fn();
    render(<ContainedPullHost onRefresh={onRefresh} />);
    const host = screen.getByTestId('host');
    // The window claims "scrolled"; the container is at its top — the container wins.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
    Object.defineProperty(screen.getByTestId('container'), 'scrollTop', {
      configurable: true,
      value: 0,
    });

    drag(host, PULL_THRESHOLD_PX * 2 + 20);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('ADR-098: a scrolled container keeps the gesture as scrolling', () => {
    const onRefresh = vi.fn();
    render(<ContainedPullHost onRefresh={onRefresh} />);
    const host = screen.getByTestId('host');
    Object.defineProperty(screen.getByTestId('container'), 'scrollTop', {
      configurable: true,
      value: 80,
    });

    drag(host, 400);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(host.dataset['pull']).toBe('0');
  });

  it('ignores a second gesture while the first refresh is settling', () => {
    const onRefresh = vi.fn();
    render(<PullHost onRefresh={onRefresh} />);
    const host = screen.getByTestId('host');

    drag(host, 400);
    drag(host, 400);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('lets go cleanly on touchcancel and on a touch list that went empty', () => {
    render(<PullHost onRefresh={vi.fn()} />);
    const host = screen.getByTestId('host');

    touch(host, 'touchstart', 100);
    touch(host, 'touchmove', 200);
    touch(host, 'touchcancel', null);
    expect(host.dataset['pull']).toBe('0');

    // A move whose touches list is empty reads as zero travel, not a crash.
    touch(host, 'touchstart', 100);
    touch(host, 'touchmove', null);
    expect(host.dataset['pull']).toBe('0');
  });
});
