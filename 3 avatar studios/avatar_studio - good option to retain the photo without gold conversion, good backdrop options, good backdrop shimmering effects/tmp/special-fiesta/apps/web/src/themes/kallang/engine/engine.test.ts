import { describe, expect, it } from 'vitest';
import { bladeTip, bobAt, cyclePhase, polylineYAt, strokePoseAt, wrap } from './anim.js';
import { loadAnchors } from './anchors.js';
import { bobAmpForSpeed, gaitAt, gaitFrames, patrolAt, createCheerer, createIdler, createWalker } from './character.js';
import { drawSprite } from './draw.js';
import { createDragonBoat } from './dragonBoat.js';
import { createKayak } from './kayak.js';
import { createHanging, createProp } from './prop.js';
import { createRng } from './rng.js';
import { buildScene, computeSceneView, FULL_VIEW, layerForWaterEffect, renderScene, SCENE_SEED, waterEffectPlacements } from './scene.js';
import { buildStore, SpriteStore } from './sprites.js';
import { isOpenWater } from './waterMap.js';
import type { Ctx, Entity, SpriteImage } from './types.js';
import { KALLANG_SPRITE_IDS } from '../spriteManifest.js';

/**
 * ADR-306 — the ported engine, tested the way the reference project tests it:
 * fake images only (construction must not need real pixels), a recording 2D
 * context for draw behaviour, and the source's own geometry pinned numerically
 * — most importantly the dragon-boat catch splashes, whose CSS mistranslation
 * (three large synchronised blobs over the rowers) is the bug this port fixes.
 */

interface FakeImage extends SpriteImage {
  readonly id: string;
}

const DIMS: Record<string, { width: number; height: number }> = {
  'dragon-boat-red': { width: 1150, height: 189 },
  'paddle-wood-07': { width: 36, height: 182 },
  'splash-v1-02': { width: 102, height: 69 },
  'wake-v1-04': { width: 915, height: 120 },
  'kayak-yellow-k1-b': { width: 340, height: 92 },
  'paddle-double-01': { width: 210, height: 44 },
  'splash-02': { width: 96, height: 64 },
  'wake-v1-01': { width: 880, height: 110 },
};

function fakeStore(): SpriteStore {
  const store = new SpriteStore();
  for (const id of KALLANG_SPRITE_IDS) {
    const dims = DIMS[id] ?? { width: 120, height: 80 };
    const image: FakeImage = { id, width: dims.width, height: dims.height };
    store.add({ id, width: dims.width, height: dims.height }, image);
  }
  return store;
}

interface DrawCall {
  image: FakeImage;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
  /** Effective horizontal flip: the sign of the accumulated x-scale. */
  flip: boolean;
}

/** A 2D context that records drawImage calls with their effective translation/alpha. */
class RecordingCtx {
  readonly calls: DrawCall[] = [];
  imageSmoothingEnabled = true;
  strokeStyle = '';
  lineWidth = 1;
  private cur = { x: 0, y: 0, alpha: 1, sx: 1 };
  private readonly stack: Array<{ x: number; y: number; alpha: number; sx: number }> = [];

  save(): void {
    this.stack.push({ ...this.cur });
  }
  restore(): void {
    this.cur = this.stack.pop() ?? this.cur;
  }
  translate(x: number, y: number): void {
    this.cur.x += x;
    this.cur.y += y;
  }
  scale(x: number): void {
    this.cur.sx *= x;
  }
  rotate(): void {}
  beginPath(): void {}
  arc(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  set globalAlpha(value: number) {
    this.cur.alpha = value;
  }
  get globalAlpha(): number {
    return this.cur.alpha;
  }
  drawImage(...args: [FakeImage, number, number, number, number]): void {
    const [image, dx, dy, w, h] = args;
    this.calls.push({
      image,
      x: this.cur.x + dx,
      y: this.cur.y + dy,
      w,
      h,
      alpha: this.cur.alpha,
      flip: this.cur.sx < 0,
    });
  }
  asCtx(): Ctx {
    return this as unknown as Ctx;
  }
  byId(id: string): DrawCall[] {
    return this.calls.filter((call) => call.image.id === id);
  }
}

describe('cyclePhase / wrap / createRng (ported anim math)', () => {
  it('cyclePhase is periodic and within [0,1)', () => {
    expect(cyclePhase(0, 2)).toBe(0);
    expect(cyclePhase(3, 2)).toBeCloseTo(0.5);
    expect(cyclePhase(2, 2, 0.25)).toBeCloseTo(0.25);
  });

  it('wrap wraps both directions', () => {
    expect(wrap(15, 0, 10)).toBe(5);
    expect(wrap(-3, 0, 10)).toBe(7);
  });

  it('createRng is deterministic per seed', () => {
    const draw = (seed: number) => {
      const rng = createRng(seed);
      return [rng.next(), rng.next(), rng.range(2, 3)];
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(7));
    expect(createRng(1).pick(['a'])).toBe('a');
  });
});

describe('ported engine edge cases', () => {
  it('rejects empty stroke and polyline inputs', () => {
    expect(() => strokePoseAt([], 0.5)).toThrow('stroke needs keyframes');
    expect(() => polylineYAt([], 10)).toThrow('polyline needs points');
    const { keyframes } = loadAnchors().dragonBoat.stroke;
    expect(strokePoseAt(keyframes, 2)).toEqual({ angleDeg: 4, lift: 0 });
  });

  it('bobAt and bobAmpForSpeed follow the source curves', () => {
    expect(bobAt(0.25, 1, 4)).toBeCloseTo(4);
    expect(bobAmpForSpeed(20)).toBe(0.03);
    expect(bobAmpForSpeed(60)).toBe(0.045);
    expect(bobAmpForSpeed(100)).toBe(0.06);
  });

  it('createRng handles a zero seed and refuses an empty pick', () => {
    const a = createRng(0);
    const b = createRng(0);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(() => createRng(1).pick([])).toThrow('pick() from empty list');
  });

  it('the sprite store reports unknown ids and loads entries asynchronously', async () => {
    const store = await buildStore(['one', 'two'], (id) =>
      Promise.resolve({ width: id.length, height: 2 }),
    );
    expect(store.image('one')).toEqual({ width: 3, height: 2 });
    expect(store.idsWithPrefix('t')).toEqual(['two']);
    expect(() => store.get('missing')).toThrow('Unknown sprite id: missing');
  });

  it('renderScene draws the plate then entities inside the camera window', () => {
    const ctx = new RecordingCtx();
    const backdrop: FakeImage = { id: 'backdrop-day', width: 1920, height: 1072 };
    let drawnTime = -1;
    const entity: Entity = {
      layer: 1,
      draw: (_ctx, env) => {
        drawnTime = env.timeSec;
      },
    };
    renderScene(ctx.asCtx(), {
      backdrop,
      entities: [entity],
      env: { timeSec: 3, showAnchors: false },
      view: { x: 366, width: 768 },
    });
    expect(ctx.calls).toEqual([
      { image: backdrop, x: -366, y: 0, w: 2752, h: 1536, alpha: 1, flip: false },
    ]);
    expect(drawnTime).toBe(3);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  it('prop helpers draw static, swaying and hanging sprites', () => {
    const store = fakeStore();
    const ctx = new RecordingCtx();
    createProp(store, { spriteId: 'podium-v2', x: 10, baselineY: 20, width: 100, layer: 1 }).draw(
      ctx.asCtx(),
      { timeSec: 1, showAnchors: false },
    );
    createProp(store, { spriteId: 'flag-rainbow-v2', x: 10, baselineY: 20, width: 52, layer: 1, swayDeg: 3 }).draw(
      ctx.asCtx(),
      { timeSec: 1, showAnchors: false },
    );
    createHanging(store, { spriteId: 'bunting-v2-a', x: 10, baselineY: 20, width: 100, layer: 1 }).draw(
      ctx.asCtx(),
      { timeSec: 1, showAnchors: false },
    );
    expect(ctx.calls.map((call) => call.image.id)).toEqual(['podium-v2', 'flag-rainbow-v2', 'bunting-v2-a']);
  });

  it('a walker without a sloped path walks on its fixed feet line', () => {
    const store = fakeStore();
    const ctx = new RecordingCtx();
    createWalker(store, {
      kit: 'red',
      feetY: 1200,
      height: 54,
      startX: 100,
      speedPxPerSec: 40,
      stridePeriodSec: 0.5,
      worldWidth: 2752,
      layer: 1,
      phaseOffset: 0,
    }).draw(ctx.asCtx(), { timeSec: 0, showAnchors: false });
    expect(ctx.calls.map((call) => call.image.id)).toEqual(['char-red-run-right']);
  });

  it('drawSprite defaults to a centre-bottom pivot at full opacity', () => {
    const ctx = new RecordingCtx();
    const image: FakeImage = { id: 'podium-v2', width: 100, height: 50 };
    drawSprite(ctx.asCtx(), image, { x: 100, y: 200, w: 40, h: 20 });
    expect(ctx.calls).toEqual([{ image, x: 80, y: 180, w: 40, h: 20, alpha: 1, flip: false }]);
  });

  it('anchor overlays draw without changing the boat sprites', () => {
    const store = fakeStore();
    const dragonCtx = new RecordingCtx();
    createDragonBoat(store, loadAnchors().dragonBoat, {
      spriteId: 'dragon-boat-red',
      waterlineY: 1470,
      width: 705,
      speedPxPerSec: 74,
      startX: 500,
      phaseOffset: 0.05,
      periodScale: 1,
      worldWidth: 2752,
      layer: 60,
    }).draw(dragonCtx.asCtx(), { timeSec: 0, showAnchors: true });
    expect(dragonCtx.byId('paddle-wood-07')).toHaveLength(9);
    expect(dragonCtx.byId('splash-v1-02')).toHaveLength(9);

    const kayakCtx = new RecordingCtx();
    createKayak(store, loadAnchors().kayak, {
      spriteId: 'kayak-yellow-k1-b',
      kind: 'k1',
      waterlineY: 1514,
      width: 310,
      speedPxPerSec: 88,
      startX: 120,
      phaseOffset: 0,
      periodScale: 1,
      worldWidth: 2752,
      layer: 60,
    }).draw(kayakCtx.asCtx(), { timeSec: 0, showAnchors: true });
    expect(kayakCtx.byId('paddle-double-01')).toHaveLength(1);
    expect(kayakCtx.byId('splash-02')).toHaveLength(1);
  });
});

describe('strokePoseAt with the real dragon-boat anchors', () => {
  const { keyframes } = loadAnchors().dragonBoat.stroke;

  it('starts at the catch keyframe', () => {
    const first = keyframes[0] as (typeof keyframes)[number];
    expect(strokePoseAt(keyframes, 0)).toEqual({ angleDeg: first.angleDeg, lift: first.lift });
    expect(first.angleDeg).toBeGreaterThan(0); // catch: blade toward the bow
  });

  it('lifts the blade during recovery', () => {
    expect(strokePoseAt(keyframes, 0.72).lift).toBeGreaterThan(0.07);
  });

  it('interpolates between keyframes', () => {
    const mid = strokePoseAt(keyframes, 0.19);
    expect(mid.angleDeg).toBeLessThan(4);
    expect(mid.angleDeg).toBeGreaterThan(-12);
  });

  it('bladeTip points down at 0 degrees and toward the bow when positive', () => {
    expect(bladeTip(0, 10).x).toBeCloseTo(0);
    expect(bladeTip(0, 10).y).toBeCloseTo(10);
    expect(bladeTip(30, 10).x).toBeCloseTo(-5); // bow is -x in boat space
  });
});

describe('gait (ported character math)', () => {
  it('plants feet at contact centres and lifts at passing centres', () => {
    expect(gaitAt(0.125, 60, 0.03).bobPx).toBeCloseTo(0);
    expect(gaitAt(0.375, 60, 0.03).bobPx).toBeCloseTo(-1.8);
    expect(gaitAt(0.625, 60, 0.03).bobPx).toBeCloseTo(0);
    expect(gaitAt(0.875, 60, 0.03).bobPx).toBeCloseTo(-1.8);
    expect([0.125, 0.375, 0.625, 0.875].map((p) => gaitAt(p, 60, 0.03).frameIndex)).toEqual([0, 1, 2, 3]);
  });

  it('rich kits gait through run-side passing poses, plain kits reuse side-right', () => {
    expect(gaitFrames('orange').map((f) => f.poseId)).toEqual([
      'char-orange-run-right-a',
      'char-orange-run-side-right',
      'char-orange-run-right-b',
      'char-orange-run-side-left',
    ]);
    expect(gaitFrames('blue').map((f) => f.poseId)).toEqual([
      'char-blue-run-right',
      'char-blue-side-right',
      'char-blue-run-left',
      'char-blue-side-right',
    ]);
    // ADR-308 — the plain kits' run-left faces right ("left" is the contact foot),
    // so no plain frame is mirrored; the rich kits' run-side-left truly faces
    // left and stays mirrored.
    expect(gaitFrames('blue')[2]?.mirror).toBe(false);
    expect(gaitFrames('orange')[3]?.mirror).toBe(true);
  });

  it('a plain-kit runner faces travel direction on every gait frame (ADR-308)', () => {
    const store = fakeStore();
    const frameFlips = (speedPxPerSec: number) => {
      const walker = createWalker(store, {
        kit: 'yellow',
        feetY: 200,
        height: 54,
        startX: 300,
        speedPxPerSec,
        stridePeriodSec: 0.4,
        worldWidth: 2752,
        layer: 1,
        phaseOffset: 0,
      });
      // One sample at each frame's centre: phases .125/.375/.625/.875.
      return [0.05, 0.15, 0.25, 0.35].map((timeSec) => {
        const ctx = new RecordingCtx();
        walker.draw(ctx.asCtx(), { timeSec, showAnchors: false });
        return ctx.calls.map((call) => ({ id: call.image.id, flip: call.flip }));
      });
    };

    const rightward = frameFlips(60);
    expect(rightward.map((frame) => frame[0]?.id)).toEqual([
      'char-yellow-run-right',
      'char-yellow-side-right',
      'char-yellow-run-left',
      'char-yellow-side-right',
    ]);
    // The bug this pins: run-left used to be flipped, so the runner faced
    // backwards for the third quarter of every stride.
    expect(rightward.flatMap((frame) => frame.map((call) => call.flip))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(frameFlips(-60).flatMap((frame) => frame.map((call) => call.flip))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('patrolAt ping-pongs at constant speed and holds still on a zero span', () => {
    const cfg = { x1: 0, x2: 100, speedPxPerSec: 50, phaseOffset: 0 };
    expect(patrolAt(cfg, 1)).toEqual({ x: 50, direction: 1 });
    expect(patrolAt(cfg, 3)).toEqual({ x: 50, direction: -1 });
    expect(patrolAt({ ...cfg, x2: 0 }, 3)).toEqual({ x: 0, direction: 1 });
  });

  it('a plain-kit idler gestures with reach-right before settling to idle', () => {
    const store = fakeStore();
    const idler = createIdler(store, { kit: 'blue', x: 100, feetY: 200, height: 54, layer: 1, periodSec: 4, phaseOffset: 0 });
    const gestureCtx = new RecordingCtx();
    idler.draw(gestureCtx.asCtx(), { timeSec: 0, showAnchors: false });
    expect(gestureCtx.calls.map((c) => c.image.id)).toEqual(['char-blue-reach-right']);
    const idleCtx = new RecordingCtx();
    idler.draw(idleCtx.asCtx(), { timeSec: 2, showAnchors: false });
    expect(idleCtx.calls.map((c) => c.image.id)).toEqual(['char-blue-idle-front']);
  });

  it('a rich-kit cheerer opens on celebrate-front', () => {
    const store = fakeStore();
    const cheerer = createCheerer(store, { kit: 'purple', x: 100, feetY: 200, height: 54, layer: 1, phaseOffset: 0 });
    const ctx = new RecordingCtx();
    cheerer.draw(ctx.asCtx(), { timeSec: 0, showAnchors: false });
    expect(ctx.calls.map((c) => c.image.id)).toEqual(['char-purple-celebrate-front']);
  });
});

describe('buildScene (ported composition)', () => {
  it('builds the full seeded population, painter-sorted by layer', () => {
    const entities = buildScene(fakeStore(), loadAnchors(), SCENE_SEED);
    // 8 clouds + 14 props + 29 promenade people + 16 court entities + 8 boats + 34 water effects.
    expect(entities).toHaveLength(109);
    const layers = entities.map((e) => e.layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
  });

  it('is deterministic in structure for a given seed', () => {
    const a = buildScene(fakeStore(), loadAnchors(), 99);
    const b = buildScene(fakeStore(), loadAnchors(), 99);
    expect(a.map((e) => e.layer)).toEqual(b.map((e) => e.layer));
  });

  it('draws the whole scene without error at composed moments', () => {
    const entities = buildScene(fakeStore(), loadAnchors(), SCENE_SEED);
    const ctx = new RecordingCtx();
    for (const t of [0, 2, 17, 40]) {
      for (const entity of entities) entity.draw(ctx.asCtx(), { timeSec: t, showAnchors: false });
    }
    expect(ctx.calls.length).toBeGreaterThan(400);
  });

  it('computeSceneView crops around the stadium only when narrower than the world', () => {
    expect(computeSceneView(2)).toEqual(FULL_VIEW);
    expect(computeSceneView(Number.NaN)).toEqual(FULL_VIEW);
    expect(computeSceneView(0.5)).toEqual({ x: 366, width: 768 });
  });
});

describe('water placement (ported waterMap + scene)', () => {
  it('places 34 effects, deterministically, all on open water, mutually separated', () => {
    const a = waterEffectPlacements(SCENE_SEED);
    expect(a).toEqual(waterEffectPlacements(SCENE_SEED));
    expect(a).toHaveLength(34);
    for (const p of a) expect(isOpenWater(p.x, p.y)).toBe(true);
    for (let i = 0; i < a.length; i += 1) {
      for (let j = i + 1; j < a.length; j += 1) {
        const pi = a[i] as (typeof a)[number];
        const pj = a[j] as (typeof a)[number];
        expect(Math.hypot(pi.x - pj.x, pi.y - pj.y)).toBeGreaterThanOrEqual(108 - 1e-9);
      }
    }
  });

  it('layers each effect just behind the boat lane in front of it', () => {
    expect(layerForWaterEffect(1300)).toBe(39);
    expect(layerForWaterEffect(1400)).toBe(49);
    expect(layerForWaterEffect(1500)).toBe(59);
  });

  it('keeps effects out of the shore, pontoon, dock, margins and bottom edge', () => {
    expect(isOpenWater(100, 1400)).toBe(true);
    expect(isOpenWater(0, 1400)).toBe(false);
    expect(isOpenWater(2750, 1400)).toBe(false);
    expect(isOpenWater(100, 1525)).toBe(false);
    expect(isOpenWater(100, 1200)).toBe(false);
    expect(isOpenWater(2000, 1280)).toBe(false);
    expect(isOpenWater(760, 1240)).toBe(false);
  });
});

describe('dragon boat splashes (regression: the three bright blobs over the rowers)', () => {
  const cfg = {
    spriteId: 'dragon-boat-red',
    waterlineY: 1470,
    width: 705,
    speedPxPerSec: -74,
    startX: 1250,
    phaseOffset: 0.05,
    periodScale: 1,
    worldWidth: 2752,
    layer: 60,
  };
  const hullHeight = (705 * 189) / 1150;

  it('splashes once per paddle station on the catch, small and on the waterline', () => {
    const boat = createDragonBoat(fakeStore(), loadAnchors().dragonBoat, cfg);
    const ctx = new RecordingCtx();
    boat.draw(ctx.asCtx(), { timeSec: 0, showAnchors: false });

    const splashes = ctx.byId('splash-v1-02');
    // All nine stations bite within their lagged catch windows — not three blobs.
    expect(splashes).toHaveLength(9);
    for (const splash of splashes) {
      // The source sizes a splash at 0.3 hull-heights (~30 world px on this boat),
      // never the 19%-of-hull-width (~134 px) the CSS approximation used.
      expect(splash.w).toBeLessThan(hullHeight * 0.3 + 1e-9);
      expect(splash.w).toBeGreaterThan(hullHeight * 0.3 * 0.6 - 1e-9);
      // Pivot (0.5, 0.65) on the waterline + 0.04 hull-heights: the splash sits
      // IN the water at the hull's base, not up over the crew.
      expect(splash.y + 0.65 * splash.h).toBeCloseTo(cfg.waterlineY + hullHeight * 0.04, 5);
      expect(splash.alpha).toBeGreaterThanOrEqual(0.3);
      expect(splash.alpha).toBeLessThanOrEqual(0.95);
    }
    // Strength (hence alpha and size) fades along the row as the lag accumulates.
    const alphas = splashes.map((s) => s.alpha);
    expect(alphas).toEqual([...alphas].sort((a, b) => b - a));
  });

  it('splashes nothing mid-stroke, when no blade is biting', () => {
    const boat = createDragonBoat(fakeStore(), loadAnchors().dragonBoat, cfg);
    const ctx = new RecordingCtx();
    boat.draw(ctx.asCtx(), { timeSec: 0.5175, showAnchors: false }); // stroke phase 0.5
    expect(ctx.byId('splash-v1-02')).toHaveLength(0);
    expect(ctx.byId('paddle-wood-07')).toHaveLength(9);
    expect(ctx.byId('dragon-boat-red')).toHaveLength(1);
    expect(ctx.byId('wake-v1-04')).toHaveLength(1);
  });
});

describe('kayak dips (ported drawDips)', () => {
  const cfg = {
    spriteId: 'kayak-yellow-k1-b',
    kind: 'k1' as const,
    waterlineY: 1514,
    width: 310,
    speedPxPerSec: 88,
    startX: 120,
    phaseOffset: 0,
    periodScale: 1,
    worldWidth: 2752,
    layer: 60,
  };

  it('splashes only while a blade is buried (|angle| >= 18 degrees)', () => {
    const kayak = createKayak(fakeStore(), loadAnchors().kayak, cfg);
    const buried = new RecordingCtx();
    kayak.draw(buried.asCtx(), { timeSec: 0, showAnchors: false }); // angle -34°
    expect(buried.byId('splash-02')).toHaveLength(1);

    const level = new RecordingCtx();
    kayak.draw(level.asCtx(), { timeSec: 0.2625, showAnchors: false }); // angle -7°
    expect(level.byId('splash-02')).toHaveLength(0);
  });
});
