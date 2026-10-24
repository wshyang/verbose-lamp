import { screenCopy } from '@psd/contracts';
import { useHallScreen, useScreenKey } from '../lib/hooks/useHallScreen.js';
import { ScreenFrame } from './ScreenFrame.js';
import '../styles/screen.css';

/**
 * ADR-141 — the hall screen: one page, no controls, projected.
 *
 * The scenes are laid out side by side on a single track and the page slides the track; it
 * does not swap panes. That is why the frames are all mounted at once and why `index` turns
 * into a `translateX` rather than into a conditional render — a cross-fade or a cut would
 * tell the room nothing, where a slide says "the screen is still running" from the back of
 * the hall, which is the one thing a projector most needs to say between results.
 *
 * `npm run standards` rule 14 keeps this file honest: no buttons, no inputs, no handlers.
 * Nobody is standing at the projector, so anything interactive here is either dead or a
 * hazard.
 */
export function ScreenPage() {
  const screenKey = useScreenKey();

  /*
   * The deck is a separate component so that an unkeyed projector never MOUNTS it: hooks
   * cannot be skipped, and a hall screen that polls six endpoints forever with no credential
   * is a 401 every forty seconds until somebody notices the wall.
   */
  if (screenKey === null) {
    return (
      <main className="screen">
        <section className="screen__frame">
          <h1 className="screen__title">{screenCopy.noKey}</h1>
        </section>
      </main>
    );
  }
  return <ScreenDeck />;
}

/**
 * ADR-144 — there is no error state on this page, and that is a decision.
 *
 * Every other surface in the app shows the reader what went wrong, because the reader is
 * holding it and can retry, reload or give up. Nobody is holding this. A failure message
 * projected across a hall is unreadable to everyone who could act on it and alarming to
 * everyone who cannot, and it would replace the last good scores — which are still the best
 * information in the room — with a sentence about HTTP. So a failed read keeps the previous
 * answer on the wall, a scene with nothing to say leaves the strip, and the only
 * acknowledgement is the corner mark, after ninety seconds of silence.
 */
function ScreenDeck() {
  const screen = useHallScreen();

  /*
   * The track is one frame wider than the strip: the extra one is a copy of the first.
   * Cruising always travels the same direction, so the loop runs forward onto the copy and
   * then jumps home with the transition off — the alternative, a long scroll backwards across
   * the whole strip, reads to a room as a mistake rather than as a loop.
   */
  const first = screen.frames[0];
  const frameCount = screen.frames.length + 1;
  const isMoving = screen.motion !== 'rest';
  const trackClass = isMoving
    ? `screen__track screen__track--moving screen__track--${screen.motion}`
    : 'screen__track';

  return (
    <main className="screen">
      <div
        className={trackClass}
        data-motion={screen.motion}
        style={{
          width: `${frameCount * 100}vw`,
          transform: `translateX(-${screen.index * 100}vw)`,
          transitionDuration: `${screen.slideMs}ms`,
        }}
      >
        {screen.frames.map((frame, position) => (
          <ScreenFrame
            key={frame.id}
            sceneId={frame.id}
            title={frame.title}
            data={screen}
            isCurrent={position === screen.index}
          />
        ))}
        {first === undefined ? (
          <section className="screen__frame">
            <h1 className="screen__title">{screenCopy.waking}</h1>
          </section>
        ) : (
          <ScreenFrame
            key="wrap"
            sceneId={first.id}
            title={first.title}
            data={screen}
            isCurrent={screen.index === screen.frames.length}
          />
        )}
      </div>
      {screen.isStale ? <p className="screen__stale">{screenCopy.stale}</p> : null}
    </main>
  );
}
