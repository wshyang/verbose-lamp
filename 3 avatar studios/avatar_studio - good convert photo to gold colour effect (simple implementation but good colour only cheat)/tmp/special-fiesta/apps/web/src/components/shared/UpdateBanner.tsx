import { useEffect, useState } from 'react';
import {
  activateWaitingUpdate,
  isUpdateWaiting,
  UPDATE_POLL_MS,
  type ContainerLike,
} from '../../lib/sw/update.js';

/**
 * ADR-182 — "a new version is ready", for the one surface that can be stale.
 *
 * Renders nothing at all unless a service worker is installed, controlling this page, and
 * holding a newer build back — which is only ever true on a facilitator station with offline
 * mode switched on (ADR-147). Every other page mounts this and gets `null` for the whole
 * session, including every test that is not about this.
 *
 * The container is a prop so the component can be driven by a fake. `navigator.serviceWorker`
 * does not exist in jsdom, and a component that can only be exercised in a real browser is a
 * component with no tests.
 */
export function UpdateBanner(props: {
  container?: ContainerLike | undefined;
  /** Injected only by the tests: jsdom refuses to let `location.reload` be redefined. */
  reload?: (() => void) | undefined;
}) {
  const container = props.container ?? containerOf(navigator);
  const reload = props.reload ?? (() => window.location.reload());
  const [isReady, setIsReady] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    if (!container) return undefined;
    let isMounted = true;
    const check = () => {
      void isUpdateWaiting(container).then((waiting) => {
        if (isMounted && waiting) setIsReady(true);
      });
    };
    check();
    const timer = setInterval(check, UPDATE_POLL_MS);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [container]);

  if (!isReady || !container) return null;

  return (
    <div className="gb-update" role="status" data-testid="update-banner">
      <span>A new version is ready.</span>
      <button
        type="button"
        className="gb-button gb-button--small"
        data-testid="update-banner__reload"
        disabled={isReloading}
        onClick={() => {
          setIsReloading(true);
          /*
           * Reload whatever happens. If the worker took the message it will have stood down and
           * the reload lands on the new build; if it had already gone (another tab pressed this
           * first) the reload is still exactly what the participant asked for. Waiting for
           * `controllerchange` instead would hang forever in the second case.
           */
          void activateWaitingUpdate(container).finally(reload);
        }}
      >
        {isReloading ? 'Reloading…' : 'Reload'}
      </button>
    </div>
  );
}

/** `serviceWorker` is absent in jsdom and on older browsers; both mean "nothing to offer". */
function containerOf(nav: Navigator): ContainerLike | null {
  return 'serviceWorker' in nav ? (nav.serviceWorker as unknown as ContainerLike) : null;
}
