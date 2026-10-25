import { describe, expect, it } from "vitest";
import { loadAnchors } from "../../src/lib/anchors";
import { SpriteStore } from "../../src/lib/sprites";
import type { SpriteEntry } from "../../src/lib/types";
import { createDragonBoat } from "../../src/objects/dragonBoat";
import { buildScene } from "../../src/scene/scene";
import manifest from "../../src/generated/sprite-manifest.json";

/** Fake images only: scene construction must not need real pixels, and every
 *  sprite id the scene references must exist in the real manifest. */
function fakeStore(): SpriteStore {
  const store = new SpriteStore();
  for (const entry of manifest.sprites as SpriteEntry[]) {
    store.add(entry, { width: entry.width, height: entry.height });
  }
  return store;
}

describe("buildScene", () => {
  it("builds a layered, non-empty scene from the real manifest + anchors", () => {
    const entities = buildScene(fakeStore(), loadAnchors(), 1234);
    expect(entities.length).toBeGreaterThan(40);
    const layers = entities.map((e) => e.layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
  });

  it("is deterministic in structure for a given seed", () => {
    const anchors = loadAnchors();
    const a = buildScene(fakeStore(), anchors, 99);
    const b = buildScene(fakeStore(), anchors, 99);
    expect(a.map((e) => e.layer)).toEqual(b.map((e) => e.layer));
  });
});

describe("createDragonBoat", () => {
  it("draws without error against a recording context at several phases", () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, {
      get: (_t, prop) => (prop === "canvas" ? {} : (..._args: unknown[]) => { calls.push(String(prop)); }),
      set: () => true,
    });
    const boat = createDragonBoat(fakeStore(), loadAnchors().dragonBoat, {
      spriteId: "dragon-boat-red", waterlineY: 100, width: 600, speedPxPerSec: -50,
      startX: 400, phaseOffset: 0, periodScale: 1, worldWidth: 2752, layer: 1,
    });
    for (const t of [0, 0.3, 0.9, 2.4]) {
      boat.draw(ctx as never, { timeSec: t, showAnchors: true });
    }
    expect(calls.filter((c) => c === "drawImage").length).toBeGreaterThan(40);
  });
});
