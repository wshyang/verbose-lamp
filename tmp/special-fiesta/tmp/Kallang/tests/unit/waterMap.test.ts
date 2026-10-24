import { describe, expect, it } from "vitest";
import { createRng } from "../../src/lib/rng";
import { patrolAt } from "../../src/objects/character";
import { boatRectsAt, type BoatSpec } from "../../src/scene/traffic";
import { WATER_EFFECT_COUNT, layerForWaterEffect, waterEffectPlacements } from "../../src/scene/scene";
import { isOpenWater, placeWaterEffects, shorelineYAt } from "../../src/scene/waterMap";
import { SpriteStore } from "../../src/lib/sprites";
import type { SpriteEntry } from "../../src/lib/types";
import manifest from "../../src/generated/sprite-manifest.json";

describe("shorelineYAt", () => {
  it("follows the measured water edge", () => {
    expect(shorelineYAt(0)).toBe(1195);
    expect(shorelineYAt(1000)).toBeCloseTo(1261, 0);
    expect(shorelineYAt(2000)).toBeCloseTo(1301, 0); // boardwalk front edge
    expect(shorelineYAt(9999)).toBe(1312); // clamped
  });
});

describe("isOpenWater", () => {
  it("accepts bay water and rejects land, deck and dock", () => {
    expect(isOpenWater(1500, 1420)).toBe(true);
    expect(isOpenWater(200, 1400)).toBe(true);
    expect(isOpenWater(800, 1180)).toBe(false); // promenade land
    expect(isOpenWater(2000, 1280)).toBe(false); // wooden boardwalk deck
    expect(isOpenWater(750, 1240)).toBe(false); // blue floating dock
    expect(isOpenWater(100, 1205)).toBe(false); // grass bank at the left shore
    expect(isOpenWater(2700, 1500)).toBe(true);
  });
});

describe("placeWaterEffects", () => {
  it("is deterministic and keeps every point in open water, separated", () => {
    const run = () => placeWaterEffects(createRng(7), 22);
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.length).toBe(22);
    for (const point of a) expect(isOpenWater(point.x, point.y)).toBe(true);
    for (let i = 0; i < a.length; i += 1) {
      for (let j = i + 1; j < a.length; j += 1) {
        const p = a[i]!;
        const q = a[j]!;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(135);
      }
    }
  });
});

describe("patrolAt (court shuttles / boardwalk)", () => {
  const cfg = { x1: 100, x2: 300, speedPxPerSec: 50, phaseOffset: 0 };
  it("ping-pongs between the ends and reports direction", () => {
    expect(patrolAt(cfg, 0)).toEqual({ x: 100, direction: 1 });
    expect(patrolAt(cfg, 2).x).toBeCloseTo(200);
    expect(patrolAt(cfg, 4)).toEqual({ x: 300, direction: -1 });
    expect(patrolAt(cfg, 6).x).toBeCloseTo(200);
    expect(patrolAt(cfg, 6).direction).toBe(-1);
    expect(patrolAt(cfg, 8).x).toBeCloseTo(100);
  });
  it("never leaves [x1, x2]", () => {
    for (let t = 0; t < 40; t += 0.37) {
      const { x } = patrolAt(cfg, t);
      expect(x).toBeGreaterThanOrEqual(100);
      expect(x).toBeLessThanOrEqual(300);
    }
  });
});

describe("layerForWaterEffect (painter's-algorithm occlusion)", () => {
  it("places each effect just behind the boat lane in front of it", () => {
    expect(layerForWaterEffect(1250)).toBeLessThan(40); // behind far lane (layer 40)
    expect(layerForWaterEffect(1410)).toBeGreaterThan(40);
    expect(layerForWaterEffect(1410)).toBeLessThan(50); // behind mid lane (50)
    expect(layerForWaterEffect(1480)).toBeGreaterThan(50);
    expect(layerForWaterEffect(1480)).toBeLessThan(60); // behind near lane (60)
  });
});

describe("waterEffectPlacements (the actual scene layout)", () => {
  it("sprinkles many effects, all in open water", () => {
    const placements = waterEffectPlacements(20261017);
    expect(placements).toHaveLength(WATER_EFFECT_COUNT);
    expect(WATER_EFFECT_COUNT).toBeGreaterThanOrEqual(30);
    for (const point of placements) expect(isOpenWater(point.x, point.y)).toBe(true);
    expect(waterEffectPlacements(20261017)).toEqual(placements); // deterministic
  });
});

describe("boat traffic occupancy (QA overlay geometry)", () => {
  it("boat rects follow the real boat configs", () => {
    const store = new SpriteStore();
    for (const entry of manifest.sprites as SpriteEntry[]) {
      store.add(entry, { width: entry.width, height: entry.height });
    }
    const specs: BoatSpec[] = [{
      kind: "dragon",
      cfg: {
        spriteId: "dragon-boat-red", waterlineY: 1470, width: 705, speedPxPerSec: -74,
        startX: 1250, phaseOffset: 0, periodScale: 1, worldWidth: 2752, layer: 1,
      },
    }];
    const [rect] = boatRectsAt(store, specs, 0);
    expect(rect).toBeDefined();
    expect(rect!.x1).toBeLessThan(1250 - 705 / 2 + 1); // hull covered
    expect(rect!.x2).toBeGreaterThan(1250 + 705 / 2); // wake extends past stern
    expect(rect!.y2).toBeCloseTo(1482);
  });
});
