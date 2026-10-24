import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner.js';
import { SKIP_WAITING_MESSAGE, type ContainerLike } from '../../lib/sw/update.js';

/** ADR-182 — the prompt that makes the service worker's deliberate wait escapable. */

const reload = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
  reload.mockReset();
});

function containerWith(waiting: { postMessage: () => void } | null): ContainerLike {
  return { controller: {}, getRegistration: () => Promise.resolve({ waiting }) };
}

describe('UpdateBanner', () => {
  it('finds the browser container when one exists, and ignores it otherwise', async () => {
    // The `container` prop exists for the tests; in the app the component reaches for
    // `navigator.serviceWorker`, which is absent in jsdom and on older browsers alike.
    const waiting = { postMessage: vi.fn() };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {}, getRegistration: () => Promise.resolve({ waiting }) },
    });
    const { unmount } = render(<UpdateBanner />);
    expect(await screen.findByTestId('update-banner')).toBeVisible();
    unmount();

    // @ts-expect-error — removing a property jsdom does not normally define at all.
    delete navigator.serviceWorker;
    render(<UpdateBanner />);
    await waitFor(() => expect(screen.queryByTestId('update-banner')).toBeNull());
  });

  it('shows nothing when there is no service worker at all', () => {
    // Every page in the app mounts this. On a participant's phone, and in every other test in
    // this suite, it must be exactly as if it were not there.
    render(<UpdateBanner container={undefined} />);
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });

  it('shows nothing while the installed worker is the current one', async () => {
    render(<UpdateBanner container={containerWith(null)} />);
    await waitFor(() => expect(screen.queryByTestId('update-banner')).toBeNull());
  });

  it('offers a reload once a newer build is waiting, and takes it', async () => {
    const postMessage = vi.fn();
    render(<UpdateBanner container={containerWith({ postMessage })} reload={reload} />);

    const button = await screen.findByTestId('update-banner__reload');
    expect(screen.getByTestId('update-banner')).toHaveTextContent('A new version is ready.');

    await userEvent.click(button);

    // The worker is told to stand down, and only then is the page thrown away.
    expect(postMessage).toHaveBeenCalledWith({ type: SKIP_WAITING_MESSAGE });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('reloads even when the waiting worker has already gone', async () => {
    /*
     * Two station tabs, one worker: whichever presses Reload first activates it, and the second
     * finds nothing to message. Waiting for a `controllerchange` that will never arrive would
     * hang that tab on "Reloading…" forever, so the reload is unconditional.
     */
    let waiting: { postMessage: () => void } | null = { postMessage: vi.fn() };
    const container: ContainerLike = {
      controller: {},
      getRegistration: () => Promise.resolve({ waiting }),
    };
    render(<UpdateBanner container={container} reload={reload} />);

    const button = await screen.findByTestId('update-banner__reload');
    waiting = null;
    await userEvent.click(button);

    expect(button).toBeDisabled();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
