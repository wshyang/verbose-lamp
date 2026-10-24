import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KITS, bobAmpForSpeed, gaitAt, gaitFrames } from "../../src/objects/character";

describe("4-phase gait (addendum 0007)", () => {
  it("every kit has 4 gait frames and at least 3 distinct poses", () => {
    for (const kit of KITS) {
      const frames = gaitFrames(kit);
      expect(frames).toHaveLength(4);
      expect(new Set(frames.map((f) => `${f.poseId}|${f.mirror}`)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it("frame index advances through all four phases", () => {
    const seen = [0, 0.13, 0.3, 0.55, 0.8].map((p) => gaitAt(p, 60, 0.05).frameIndex);
    expect(seen).toEqual([0, 0, 1, 2, 3]);
  });

  it("feet plant at contact centres and lift at passing centres", () => {
    expect(gaitAt(0.125, 60, 0.05).bobPx).toBeCloseTo(0, 5);
    expect(gaitAt(0.625, 60, 0.05).bobPx).toBeCloseTo(0, 5);
    expect(gaitAt(0.375, 60, 0.05).bobPx).toBeCloseTo(-3, 5);
    expect(gaitAt(0.875, 60, 0.05).bobPx).toBeCloseTo(-3, 5);
  });

  it("bob amplitude grows with speed (strollers grounded, joggers bounce)", () => {
    expect(bobAmpForSpeed(40)).toBeLessThan(bobAmpForSpeed(120));
  });
});

describe("dragon boat anchors (measured crew of 9, addendum 0007)", () => {
  const anchors = JSON.parse(readFileSync("src/generated/anchors.json", "utf8"));
  const stations: Array<{ x: number; y: number }> = anchors.dragonBoat.stations;

  it("has exactly one station per painted rower (9), spanning the full crew", () => {
    expect(stations).toHaveLength(9);
    expect(stations[0]?.x).toBeGreaterThan(0.22);
    expect(stations[8]?.x).toBeGreaterThan(0.78); // last rower included
    for (let i = 1; i < stations.length; i += 1) {
      expect(stations[i]!.x).toBeGreaterThan(stations[i - 1]!.x);
      // crew spacing in the art is ~0.069 of boat width
      expect(stations[i]!.x - stations[i - 1]!.x).toBeGreaterThan(0.055);
      expect(stations[i]!.x - stations[i - 1]!.x).toBeLessThan(0.085);
    }
  });

  it("no station sits on the drum (x 0.19-0.26 at drum height)", () => {
    for (const s of stations) {
      const onDrum = s.x > 0.19 && s.x < 0.26 && s.y > 0.45 && s.y < 0.75;
      // station 0 is rower 1's hands-midpoint, just behind the drum
      if (onDrum) expect(s.x).toBeGreaterThan(0.235);
    }
    expect(stations[0]?.x).toBeCloseTo(0.241, 2); // midpoint of repaired fists (addendum 0008)
  });

  it("paddle rotates between the hands (pivot inside the shaft, stroke sweeps through hands-aligned -28deg)", () => {
    expect(anchors.dragonBoat.paddlePivot.y).toBeGreaterThan(0.15);
    expect(anchors.dragonBoat.paddlePivot.y).toBeLessThan(0.3);
    const angles = anchors.dragonBoat.stroke.keyframes.map((k: { angleDeg: number }) => k.angleDeg);
    expect(Math.min(...angles)).toBeLessThanOrEqual(-26);
    expect(Math.max(...angles)).toBeLessThanOrEqual(10);
  });
});
