import { useEffect, useState } from 'react';
import { useAlerts } from './AlertsProvider.js';

/**
 * ADR-192 — how long the socket may be down before the participant is told.
 *
 * Every page load starts disconnected and connects a moment later, so a chip with no grace
 * would flash on every single navigation and teach people to ignore it. Ten seconds is longer
 * than any healthy connect and far shorter than the 45-75s fallback poll, so the chip appears
 * only in the window where the participant is genuinely seeing stale data and cannot tell.
 */
export const STREAM_GRACE_MS = 10_000;

/**
 * ADR-192 — the connection indicator, and the reason it is nearly always invisible.
 *
 * The announcement-latency hunt (ADR-187) ended without a cause because nothing recorded what
 * the socket was doing at the time. A frame that arrives sixty seconds late and a frame that
 * was sent sixty seconds late produce the same complaint from the same person, and the only
 * thing that separates them is whether the stream was carrying. That was knowable in the
 * client all along and simply never drawn.
 *
 * Drawn as an absence rather than a presence: a healthy socket renders no element at all, so
 * this costs the normal case nothing and cannot become wallpaper. When it does appear it says
 * what is actually true — the feed is still updating, just slowly — because "reconnecting"
 * alone reads as "broken" and sends people to a marshal who can do nothing about it.
 */
export function StreamHealth() {
  const { isLive } = useAlerts();
  const [showStale, setShowStale] = useState(false);

  useEffect(() => {
    if (isLive) {
      setShowStale(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowStale(true), STREAM_GRACE_MS);
    return () => clearTimeout(timer);
  }, [isLive]);

  if (!showStale) return null;
  return (
    <p className="gb-stream-health" role="status" data-testid="stream-health">
      Reconnecting — updates may be up to a minute behind.
    </p>
  );
}
