import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * ADR-141 — the hall screen's deck: a strip of frames laid out left to right, and a window
 * that slides along it.
 *
 * The visual model is the product decision, not a decoration on top of one. A scene change is
 * a *lateral slide*, so the audience sees the board leave and the next thing arrive, which is
 * what tells a room at ten metres that the screen is alive rather than frozen. An alert is the
 * same movement at speed — the screen dashes to the frame something happened on, holds it, and
 * comes back the way it came, resuming from the frame it abandoned.
 *
 * This hook owns the strip's *state*. It knows nothing about pixels: the page turns `index`
 * and `slideMs` into a transform, which keeps every rule below testable without a browser.
 */

/** A cruise between neighbours: slow enough to read as movement, not as a cut. */
export const SCENE_TRANSITION_MS = 700;
/** A dash scales with distance so two frames and five both read as "over there". */
export const DASH_PER_FRAME_MS = 140;
/** ...but never long enough that the room is watching the furniture move. */
export const DASH_MAX_MS = 600;
/**
 * ADR-133's lesson, applied to a projector: four courts finishing in the same minute is one
 * jump, not four. Without this the busiest minute of the event is the minute the screen
 * becomes unreadable.
 */
export const INTERRUPT_FLOOR_MS = 20_000;
/**
 * How long an alert waits for its scene to join the strip.
 *
 * A result can land while the strip is mid-slide, and a scene may only join at rest — so for
 * up to one transition the frame the alert is about does not exist yet. Holding the alert for
 * a moment closes that gap; holding it for longer would be worse than dropping it, because a
 * screen that whips across to a match four minutes after it ended is reporting news that the
 * room has already finished discussing.
 */
export const PENDING_ALERT_MS = 3_000;

export interface SceneInput {
  id: string;
  /** False when the scene has nothing to show; it leaves the strip entirely (never an empty state). */
  isReady: boolean;
  dwellMs: number;
}

/** `cruise` neighbour-to-neighbour, `dash` to an alert, `return` back from one. */
export type DeckMotion = 'rest' | 'cruise' | 'dash' | 'return';

interface DeckPosition {
  index: number;
  motion: DeckMotion;
  slideMs: number;
  /** The frame the cycle resumes from once an alert has been shown and left. */
  returnTo: number | null;
  /** True while sliding onto the trailing clone of frame 0, before the silent jump home. */
  isWrapping: boolean;
}

const AT_REST: DeckPosition = {
  index: 0,
  motion: 'rest',
  slideMs: 0,
  returnTo: null,
  isWrapping: false,
};

function dashDurationFor(distance: number): number {
  return Math.min(DASH_MAX_MS, Math.max(1, distance) * DASH_PER_FRAME_MS);
}

/**
 * The strip may only change shape while nothing is moving.
 *
 * A frame appearing or disappearing mid-slide moves the ground under an animation that is
 * already running — the window would arrive somewhere it never aimed for. So the live scene
 * list is held, and adopted at the next moment of rest; the one exception is a frame that
 * vanishes under the window, where staying put is not an option either (see `anchorFor`).
 */
function sameStrip(left: readonly SceneInput[], right: readonly SceneInput[]): boolean {
  return (
    left.length === right.length &&
    left.every((frame, slot) => frame.id === right[slot]?.id && frame.dwellMs === right[slot]?.dwellMs)
  );
}

function useSettledFrames<T extends SceneInput>(
  scenes: readonly T[],
  motion: DeckMotion,
  currentId: string | null,
) {
  const ready = useMemo(() => scenes.filter((scene) => scene.isReady), [scenes]);
  const held = useRef<readonly T[]>(ready);
  const isStill = motion === 'rest';
  const stillHasCurrent = currentId === null || ready.some((frame) => frame.id === currentId);
  /*
   * Identity is kept when the strip is unchanged, and that is load-bearing rather than an
   * optimisation: the dwell timer below is keyed on this array, so a new array for every
   * poll — a leaderboard refresh lands every forty seconds — would restart the dwell each
   * time and the screen would sit on one scene for the whole afternoon.
   */
  if ((isStill || !stillHasCurrent) && !sameStrip(held.current, ready)) held.current = ready;
  return held.current;
}

/**
 * One timer at a time: whatever the strip is doing now decides what it does next.
 *
 * Separate from the hook so the three motions read as one sequence rather than as the tail
 * of a function that is also doing bookkeeping. `hold` carries the *corrected* position —
 * the index after any re-anchoring — because a timer must fire for the frame the window is
 * actually on, not the one the last state update aimed at.
 */
function useDeckClock(deck: {
  frames: readonly SceneInput[];
  position: DeckPosition;
  hold: { current: DeckPosition };
  setPosition: Dispatch<SetStateAction<DeckPosition>>;
}): void {
  const { frames, position, hold, setPosition } = deck;
  useEffect(() => {
    const now = hold.current;

    if (now.motion !== 'rest') {
      // Mid-slide: when it lands, the strip is at rest wherever it aimed for. Deliberately
      // ahead of the dwell branches, because a wrap is mid-slide onto the cloned frame and
      // there is no real frame under that position to read a dwell from.
      const timer = setTimeout(() => {
        setPosition((current) => ({ ...current, motion: 'rest', slideMs: 0, isWrapping: false }));
      }, now.slideMs);
      return () => clearTimeout(timer);
    }

    const resting = frames[now.index];
    // An empty strip, or a position no frame answers to: there is no dwell to time.
    if (resting === undefined) return undefined;

    if (now.returnTo !== null) {
      // An alert frame has been held for its dwell; go back the way we came.
      const target = Math.min(now.returnTo, frames.length - 1);
      const timer = setTimeout(() => {
        setPosition({
          index: target,
          motion: 'return',
          slideMs: dashDurationFor(Math.abs(target - now.index)),
          returnTo: null,
          isWrapping: false,
        });
      }, resting.dwellMs);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      const isLast = now.index === frames.length - 1;
      setPosition({
        // Forward, always: the wrap slides onto a trailing clone of frame 0 rather than
        // rewinding the whole strip, so the loop never looks like a correction.
        index: isLast ? 0 : now.index + 1,
        motion: 'cruise',
        slideMs: SCENE_TRANSITION_MS,
        returnTo: null,
        isWrapping: isLast,
      });
    }, resting.dwellMs);
    return () => clearTimeout(timer);
  }, [frames, position, hold, setPosition]);
}

/**
 * ADR-141 — the interrupt: something happened on another frame, so go and look at it.
 *
 * Lifted out of the deck because it is the half with the judgement in it — the floor, the
 * held alert, the refusal to move for a frame already on screen — while the deck itself is
 * just a clock and a position.
 */
function useDeckAlert(deck: {
  frames: readonly SceneInput[];
  hold: { current: DeckPosition };
  setPosition: Dispatch<SetStateAction<DeckPosition>>;
}): (sceneId: string) => void {
  const { frames, hold, setPosition } = deck;
  const lastAlertAt = useRef(0);
  /** An alert whose scene was not on the strip yet, kept until it is (or until it is stale). */
  const pending = useRef<{ sceneId: string; at: number } | null>(null);

  /**
   * Something happened on another frame. Go and look at it — unless we are already there,
   * unless it is not on the strip, and unless we have just been somewhere (the floor).
   */
  const alert = useCallback(
    (sceneId: string) => {
      const target = frames.findIndex((frame) => frame.id === sceneId);
      if (target === -1) {
        // The scene is empty — or, far more often, it is the scene this very result is about
        // to fill, and the strip may only take it on at rest. Hold the alert, briefly.
        pending.current = { sceneId, at: Date.now() };
        return;
      }
      const from = hold.current.index;
      if (target === from) return;
      const now = Date.now();
      if (now - lastAlertAt.current < INTERRUPT_FLOOR_MS) return;
      lastAlertAt.current = now;
      setPosition({
        index: target,
        motion: 'dash',
        slideMs: dashDurationFor(Math.abs(target - from)),
        // Where to come back to — the frame the cycle was going to continue from.
        returnTo: from,
        isWrapping: false,
      });
    },
    [frames, hold, setPosition],
  );

  /** The held alert, delivered the moment its scene exists — if it is still news. */
  useEffect(() => {
    const waiting = pending.current;
    if (waiting === null || !frames.some((frame) => frame.id === waiting.sceneId)) return;
    pending.current = null;
    if (Date.now() - waiting.at <= PENDING_ALERT_MS) alert(waiting.sceneId);
  }, [frames, alert]);

  return alert;
}

export function useScreenDeck<T extends SceneInput>(scenes: readonly T[]) {
  const [position, setPosition] = useState<DeckPosition>(AT_REST);
  /** The scene the window is pointed at, remembered by name so a re-laid strip can find it. */
  const anchorId = useRef<string | null>(null);
  const frames = useSettledFrames(scenes, position.motion, anchorId.current);

  /*
   * The strip just changed shape. The window is anchored to a frame's IDENTITY, not to its
   * slot: a scene leaving must not slide a different scene under the viewer's eyes, which
   * would read as a jump that never animated. If the anchored scene is gone too, the index is
   * clamped instead — whatever took its place is the honest next thing to look at.
   *
   * Only ON a change, which is the whole subtlety: re-anchoring on every render would undo
   * each cruise the moment it started, because the frame it is leaving is still the anchor.
   */
  const lastFrames = useRef(frames);
  const clamped = Math.min(position.index, Math.max(0, frames.length - 1));
  const relaidSlot =
    lastFrames.current === frames ? -1 : frames.findIndex((frame) => frame.id === anchorId.current);
  const settled = relaidSlot === -1 ? clamped : relaidSlot;
  lastFrames.current = frames;

  const index = position.isWrapping ? frames.length : settled;
  anchorId.current = frames[position.isWrapping ? 0 : settled]?.id ?? null;

  // Write the correction back, so the next cruise counts from where the window actually is.
  useEffect(() => {
    if (settled !== position.index) setPosition((current) => ({ ...current, index: settled }));
  }, [settled, position.index]);

  const hold = useRef(position);
  hold.current = { ...position, index: settled };
  useDeckClock({ frames, position, hold, setPosition });

  const alert = useDeckAlert({ frames, hold, setPosition });

  return {
    frames,
    index,
    motion: position.motion,
    slideMs: position.slideMs,
    isWrapping: position.isWrapping,
    alert,
  };
}
