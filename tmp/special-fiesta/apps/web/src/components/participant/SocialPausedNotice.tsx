import { messages } from '@psd/contracts';

/**
 * ADR-118 — what a participant sees where the room used to be.
 *
 * The tab stays in the bar and the panel stays on screen. Hiding the tab would be worse than
 * useless: somebody who has been chatting all morning finds the tab gone, assumes their phone
 * is broken, and signs out and back in — which is more load, applied by the people we were
 * trying to shed load from. So the surface stays exactly where it was and explains itself.
 *
 * The copy names scoring and scanning deliberately. The question in the participant's head is
 * not "why is chat down" but "is my day still being counted", and answering only the first
 * leaves them to guess at the second.
 */
export function SocialPausedNotice() {
  return (
    <section className="gb-panel" data-testid="social-paused">
      <p className="gb-hint">{messages.socialPaused}</p>
    </section>
  );
}
