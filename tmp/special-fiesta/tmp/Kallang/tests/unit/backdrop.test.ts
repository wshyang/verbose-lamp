import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BACKDROP_THEMES, backdropTheme, renderScene } from "../../src/scene/scene";

describe("layered backdrop themes (addendum 0009)", () => {
  it("offers dawn/morning/day/evening/dusk with published layer files", () => {
    expect(BACKDROP_THEMES.map((t) => t.id)).toEqual(["dawn", "morning", "day", "evening", "dusk"]);
    for (const theme of BACKDROP_THEMES) {
      expect(theme.sceneUrl.endsWith(".png"), theme.id).toBe(true); // keyed transparent plate
      expect(theme.skyUrl.endsWith(".jpeg"), theme.id).toBe(true);
      expect(existsSync(`public${theme.sceneUrl}`), theme.sceneUrl).toBe(true);
      expect(existsSync(`public${theme.skyUrl}`), theme.skyUrl).toBe(true);
    }
    // three scene plates, five skies
    expect(new Set(BACKDROP_THEMES.map((t) => t.sceneUrl)).size).toBe(3);
    expect(new Set(BACKDROP_THEMES.map((t) => t.skyUrl)).size).toBe(5);
  });

  it("resolves unknown/missing ids to day", () => {
    expect(backdropTheme("dusk").id).toBe("dusk");
    expect(backdropTheme("midnight").id).toBe("day");
    expect(backdropTheme(null).id).toBe("day");
    expect(backdropTheme(undefined).id).toBe("day");
  });

  it("renderScene draws sky first, then the scene plate, then entities", () => {
    const drawn: unknown[] = [];
    const ctx = new Proxy({}, {
      get: (_t, prop) => (prop === "drawImage"
        ? (img: unknown) => { drawn.push(img); }
        : () => undefined),
      set: () => true,
    });
    const sky = { tag: "sky" };
    const scene = { tag: "scene" };
    renderScene(ctx as never, { sky: sky as never, scene: scene as never }, [],
      { timeSec: 0, showAnchors: false });
    expect(drawn).toEqual([sky, scene]);
  });
});

import manifestDawn from "../../src/generated/sprite-manifest-dawn.json";
import manifestDay from "../../src/generated/sprite-manifest.json";
import manifestDusk from "../../src/generated/sprite-manifest-dusk.json";

describe("themed sprite variants (addendum 0010)", () => {
  it("themes map to sprite lighting sets", () => {
    const byId = Object.fromEntries(BACKDROP_THEMES.map((t) => [t.id, t.spriteVariant]));
    expect(byId).toEqual({ dawn: "dawn", morning: "day", day: "day", evening: "dusk", dusk: "dusk" });
  });

  it("dawn/dusk manifests mirror the day manifest ids and dimensions", () => {
    const day = manifestDay.sprites;
    for (const [name, themed] of [["dawn", manifestDawn.sprites], ["dusk", manifestDusk.sprites]] as const) {
      expect(themed).toHaveLength(day.length);
      themed.forEach((entry, i) => {
        const base = day[i]!;
        expect(entry.id, name).toBe(base.id);
        expect([entry.width, entry.height], name).toEqual([base.width, base.height]);
        expect(entry.url, name).toBe(base.url.replace("/sprites/", `/sprites-${name}/`));
        expect(existsSync(`public${entry.url}`), entry.url).toBe(true);
      });
    }
  });
});

import { FULL_VIEW, STADIUM_OPENING_X, WORLD_WIDTH, computeSceneView } from "../../src/scene/scene";

describe("portrait camera crop (addendum 0011)", () => {
  it("wide stages see the full world", () => {
    expect(computeSceneView(2)).toEqual(FULL_VIEW);
    expect(computeSceneView(2752 / 1536)).toEqual(FULL_VIEW);
    expect(computeSceneView(16 / 9).width).toBeGreaterThan(2700); // 16:9 is a hair narrower than the world
    expect(computeSceneView(Number.NaN)).toEqual(FULL_VIEW);
  });

  it("narrow stages crop centred on the stadium opening", () => {
    const phone = computeSceneView(0.6);
    expect(phone.width).toBe(922);
    expect(phone.x + phone.width / 2).toBeCloseTo(STADIUM_OPENING_X, 0);
    const tablet = computeSceneView(0.92);
    expect(tablet.x).toBeGreaterThanOrEqual(0);
    expect(tablet.x + tablet.width).toBeLessThanOrEqual(WORLD_WIDTH);
    // opening stays inside the frame at every aspect
    for (const aspect of [0.5, 0.6, 0.75, 1, 1.33, 1.6]) {
      const view = computeSceneView(aspect);
      expect(view.x, `aspect ${aspect}`).toBeLessThanOrEqual(STADIUM_OPENING_X);
      expect(view.x + view.width, `aspect ${aspect}`).toBeGreaterThanOrEqual(STADIUM_OPENING_X);
    }
  });

  it("opening focus is the measured mouth centre", () => {
    expect(STADIUM_OPENING_X).toBe(750); // dark interior spans x 566-933 on the plates
  });
});
