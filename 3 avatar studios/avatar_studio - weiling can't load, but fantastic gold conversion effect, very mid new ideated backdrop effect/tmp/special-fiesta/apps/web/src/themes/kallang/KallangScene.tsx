import { useEffect, useRef } from 'react';
import { loadAnchors } from './engine/anchors.js';
import { buildScene, renderScene, SCENE_SEED, WORLD_HEIGHT, WORLD_WIDTH } from './engine/scene.js';
import { buildStore } from './engine/sprites.js';
import type { SpriteImage } from './engine/types.js';
import { backdropUrl, KALLANG_SPRITE_IDS, spriteUrl } from './spriteManifest.js';

/**
 * The Kallang backdrop (ADR-301's plate; population ADR-302..305; engine ADR-306).
 *
 * ADR-306 — the scene is drawn by the reference project's own animation engine,
 * ported into `./engine/`, on one canvas. The CSS approximation of ADR-304/305
 * kept mistranslating the source's per-frame geometry (most visibly the dragon
 * boats' catch splashes: three large synchronised blobs over the rowers, where
 * the original draws one small fading splash per paddle station at its blade
 * tip on the waterline). The port removes the translation layer: entities are
 * the original's pure functions of time — seeded population (seed 20261017),
 * four-phase gait, anchor-stitched paddles, stroke-timed splashes, layered
 * water — composited painter-style over the served plate each animation frame.
 *
 * The stage geometry is unchanged (ADR-303): `.kallang-stage` is the world at
 * its own aspect, bottom-anchored full-width on wide screens, full-height with
 * the stadium opening centred on narrow ones; the canvas always renders the
 * full 2752 x 1536 world and the stage crops it, as the CSS layers did.
 *
 * Reduced motion (ADR-298): no travellers freeze mid-journey — the whole scene
 * is one still frame (the reference project's QA-still moment, t=17s), plate
 * and population composed, nothing moving.
 *
 * Decoration, like every backdrop (ADR-014): `aria-hidden`, pointer-events free,
 * participant-only.
 */

/** The reference project's QA-still moment: a composed, populated frame. */
const STILL_TIME_SEC = 17;

function loadImage(src: string): Promise<SpriteImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

export function KallangScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas === null || ctx === null || ctx === undefined) return;

    let cancelled = false;
    let raf = 0;
    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    void (async () => {
      const backdrop = await loadImage(backdropUrl()).catch(() => null);
      if (cancelled || backdrop === null) return;
      // The plate alone first, so the scene is composed while sprites load.
      renderScene(ctx, { backdrop, entities: [], env: { timeSec: 0, showAnchors: false } });

      const store = await buildStore(KALLANG_SPRITE_IDS, (id) => loadImage(spriteUrl(id))).catch(() => null);
      if (cancelled || store === null) return;
      const entities = buildScene(store, loadAnchors(), SCENE_SEED);

      if (reduced) {
        renderScene(ctx, { backdrop, entities, env: { timeSec: STILL_TIME_SEC, showAnchors: false } });
        return;
      }

      // The original's deterministic scene clock (its main.ts startClock):
      // time advances by real elapsed seconds, capped per frame.
      let time = 0;
      let last = performance.now();
      const tick = (now: number): void => {
        if (cancelled) return;
        const deltaSec = Math.min(0.1, (now - last) / 1000);
        last = now;
        time += deltaSec;
        renderScene(ctx, { backdrop, entities, env: { timeSec: time, showAnchors: false } });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="gb-scene venue-scene--kallang" aria-hidden="true" data-testid="kallang-scene">
      <div className="kallang-stage">
        <canvas
          ref={canvasRef}
          className="kallang-canvas"
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          data-testid="kallang-canvas"
        />
      </div>
    </div>
  );
}
