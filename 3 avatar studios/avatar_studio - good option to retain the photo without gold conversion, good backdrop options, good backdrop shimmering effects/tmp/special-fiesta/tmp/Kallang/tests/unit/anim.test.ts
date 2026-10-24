import { describe, expect, it } from "vitest";
import { bladeTip, cyclePhase, strokePoseAt, wrap } from "../../src/lib/anim";
import { loadAnchors } from "../../src/lib/anchors";
import { createRng } from "../../src/lib/rng";

describe("cyclePhase", () => {
  it("is periodic and within [0,1)", () => {
    expect(cyclePhase(0, 2)).toBe(0);
    expect(cyclePhase(3, 2)).toBeCloseTo(0.5);
    expect(cyclePhase(2, 2, 0.25)).toBeCloseTo(0.25);
  });
});

describe("wrap", () => {
  it("wraps both directions", () => {
    expect(wrap(15, 0, 10)).toBe(5);
    expect(wrap(-3, 0, 10)).toBe(7);
  });
});

describe("strokePoseAt with the real dragon-boat anchors", () => {
  const { keyframes } = loadAnchors().dragonBoat.stroke;
  it("starts at the catch keyframe", () => {
    const first = keyframes[0]!;
    expect(strokePoseAt(keyframes, 0)).toEqual({ angleDeg: first.angleDeg, lift: first.lift });
    expect(first.angleDeg).toBeGreaterThan(0); // catch: blade toward the bow (addendum 0007 hands geometry caps this)
  });
  it("lifts the blade during recovery", () => {
    expect(strokePoseAt(keyframes, 0.72).lift).toBeGreaterThan(0.07);
  });
  it("interpolates between keyframes", () => {
    const mid = strokePoseAt(keyframes, 0.19);
    expect(mid.angleDeg).toBeLessThan(keyframes[0]!.angleDeg);
    expect(mid.angleDeg).toBeGreaterThan(-12);
  });
});

describe("bladeTip", () => {
  it("points down at 0 degrees and toward the bow when positive", () => {
    expect(bladeTip(0, 10).x).toBeCloseTo(0);
    expect(bladeTip(0, 10).y).toBeCloseTo(10);
    expect(bladeTip(30, 10).x).toBeCloseTo(-5); // bow is -x in boat space
  });
});

describe("createRng", () => {
  it("is deterministic per seed", () => {
    const draw = (seed: number) => {
      const rng = createRng(seed);
      return [rng.next(), rng.next(), rng.range(2, 3)];
    };
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(7));
  });
  it("pick never returns undefined for non-empty input", () => {
    expect(createRng(1).pick(["a"])).toBe("a");
  });
});

import { pathYAt } from "../../src/objects/character";

describe("pathYAt (sloped promenade)", () => {
  const path = [[0, 1200], [100, 1240], [300, 1250]] as const;
  it("clamps outside and interpolates inside", () => {
    expect(pathYAt(path, -10)).toBe(1200);
    expect(pathYAt(path, 50)).toBeCloseTo(1220);
    expect(pathYAt(path, 400)).toBe(1250);
  });
});
