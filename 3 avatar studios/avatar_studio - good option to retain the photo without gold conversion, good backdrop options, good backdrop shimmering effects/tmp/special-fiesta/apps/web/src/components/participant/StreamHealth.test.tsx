import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StreamHealth, STREAM_GRACE_MS } from './StreamHealth.js';
import * as alerts from './AlertsProvider.js';
import type { AlertsStore } from '../../lib/hooks/useAlertsStore.js';

/* Only `isLive` is read; the rest of the store is scenery for the type. */
function stubAlerts(isLive: boolean) {
  const base = alerts.useAlerts;
  vi.spyOn(alerts, 'useAlerts').mockImplementation(
    (): AlertsStore => ({ ...base(), isLive }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('StreamHealth', () => {
  it('draws nothing at all while the stream is carrying', () => {
    stubAlerts(true);
    render(<StreamHealth />);
    expect(screen.queryByTestId('stream-health')).toBeNull();
  });

  it('stays silent through a normal connect rather than flashing on every page load', () => {
    vi.useFakeTimers();
    stubAlerts(false);
    render(<StreamHealth />);
    act(() => {
      vi.advanceTimersByTime(STREAM_GRACE_MS - 1);
    });
    expect(screen.queryByTestId('stream-health')).toBeNull();
  });

  it('warns once the socket has been down longer than any healthy connect', () => {
    vi.useFakeTimers();
    stubAlerts(false);
    render(<StreamHealth />);
    act(() => {
      vi.advanceTimersByTime(STREAM_GRACE_MS);
    });
    expect(screen.getByTestId('stream-health')).toHaveTextContent(
      'updates may be up to a minute behind',
    );
  });

  it('clears the warning the moment the stream comes back', () => {
    vi.useFakeTimers();
    stubAlerts(false);
    const view = render(<StreamHealth />);
    act(() => {
      vi.advanceTimersByTime(STREAM_GRACE_MS);
    });
    expect(screen.getByTestId('stream-health')).toBeTruthy();
    stubAlerts(true);
    view.rerender(<StreamHealth />);
    expect(screen.queryByTestId('stream-health')).toBeNull();
  });
});
