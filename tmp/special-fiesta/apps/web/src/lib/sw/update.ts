/**
 * ADR-182 — making the service worker's wait visible, without ending it early.
 *
 * `worker.ts` deliberately does not call `skipWaiting()` on install: swapping code under a
 * running page yields a half-old app the moment anything is lazily loaded, and a facilitator
 * mid-scan is the worst possible moment to discover that. That decision stands.
 *
 * What it cost was discoverability. A new build sits in the `waiting` state until every tab of
 * the app is closed, and nothing says so — a hard refresh does not evict it, because the waiting
 * worker keeps waiting while any client is still controlled. The symptom is indistinguishable
 * from a deployment that did not happen, which is a diagnosis this project has paid for more
 * than once.
 *
 * So the wait stays and becomes visible: the page notices the waiting worker, offers a reload,
 * and only an explicit press tells the worker to take over. The unsafe part of `skipWaiting()`
 * was never the call — it was calling it without asking.
 *
 * Everything here takes its container as an argument rather than reaching for
 * `navigator.serviceWorker`, which is the whole reason this file can be tested at all.
 */

/** The message `worker.ts` answers by standing down. Shared so the two cannot drift apart. */
export const SKIP_WAITING_MESSAGE = 'psd-skip-waiting';

interface WaitingWorkerLike {
  postMessage(message: unknown): void;
}

export interface RegistrationLike {
  waiting: WaitingWorkerLike | null;
  update?: () => Promise<unknown>;
}

export interface ContainerLike {
  controller: unknown;
  getRegistration: () => Promise<RegistrationLike | null | undefined>;
}

/**
 * How often to ask the network whether a newer worker exists.
 *
 * A station tab stays open for a whole shift, so a check only at page load would be a prompt
 * most devices never see — the same reasoning, and the same failure, as the policy poll in
 * `register.ts`. One minute: a redeploy mid-event should surface within a water break, and the
 * request is a conditional GET for one small file.
 */
export const UPDATE_POLL_MS = 60_000;

/**
 * Is there a new build sitting in the wings?
 *
 * Both halves matter. `waiting` says a newer worker has installed and been held back. A live
 * `controller` says this page is already being served BY a worker — without it, `waiting` is
 * just the very first install finishing, which is not an update and must not be announced as
 * one. Getting that wrong would greet every facilitator with "a new version is ready" the first
 * time they ever opened the app.
 */
export async function isUpdateWaiting(container: ContainerLike): Promise<boolean> {
  const registration = await container.getRegistration();
  if (!registration) return false;
  /*
   * Ask the network. Browsers check for a new worker on navigation and roughly daily otherwise,
   * which is far too slow for a tab that is never navigated. A rejection here is uninteresting:
   * it means offline, and offline is exactly when there is no new build to find.
   */
  try {
    await registration.update?.();
  } catch {
    // Ignored on purpose — see above.
  }
  return registration.waiting !== null && container.controller !== null;
}

/**
 * Tell the waiting worker to take over. Returns whether there was one to tell.
 *
 * This is the ONLY path to `skipWaiting()` in the app, and it runs from a button press, which
 * is what makes it safe: the page is about to be reloaded by the caller, so there is no running
 * session for the new code to appear underneath.
 */
export async function activateWaitingUpdate(container: ContainerLike): Promise<boolean> {
  const registration = await container.getRegistration();
  const waiting = registration?.waiting;
  if (!waiting) return false;
  waiting.postMessage({ type: SKIP_WAITING_MESSAGE });
  return true;
}
