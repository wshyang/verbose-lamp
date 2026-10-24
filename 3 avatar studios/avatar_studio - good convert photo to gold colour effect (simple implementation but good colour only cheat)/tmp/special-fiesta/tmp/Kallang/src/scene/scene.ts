/** Scene composition (spec §5): two-layer backdrop (sky + transparent
 *  scene plate, addendum 0009) + layers of animated entities. All
 *  placements are world pixels in the 2752x1536 backdrop space; tuned
 *  against QA stills and the populated-reference backdrop. */
import { createRng } from "../lib/rng";
import type { SpriteStore } from "../lib/sprites";
import type { Anchors, Ctx, Entity, RenderEnv, SpriteImage } from "../lib/types";
import { createBall } from "../objects/ball";
import { KITS, createCheerer, createIdler, createPatrol, createWalker } from "../objects/character";
import { createCloud } from "../objects/cloud";
import { createDragonBoat } from "../objects/dragonBoat";
import { createKayak } from "../objects/kayak";
import { createHanging, createProp } from "../objects/prop";
import { createRipple } from "../objects/waterFx";
import type { BoatSpec } from "./traffic";
import { placeWaterEffects } from "./waterMap";

export const WORLD_WIDTH = 2752;
export const WORLD_HEIGHT = 1536;

/** Centre of the National Stadium's opening (the dark interior mouth,
 *  measured on the scene plates: x 566-933). Portrait/narrow viewports
 *  crop horizontally around this focus (addendum 0011). */
export const STADIUM_OPENING_X = 750;

/** Horizontal window into the world actually shown (full height always). */
export interface SceneView { x: number; width: number }
export const FULL_VIEW: SceneView = { x: 0, width: WORLD_WIDTH };

/** For a stage aspect (w/h) narrower than the world, show a
 *  focus-centred crop; wider stages see the whole world. */
export function computeSceneView(displayAspect: number): SceneView {
  const worldAspect = WORLD_WIDTH / WORLD_HEIGHT;
  if (!Number.isFinite(displayAspect) || displayAspect >= worldAspect) return FULL_VIEW;
  const width = Math.min(WORLD_WIDTH, Math.max(320, Math.round(WORLD_HEIGHT * displayAspect)));
  const x = Math.min(WORLD_WIDTH - width, Math.max(0, Math.round(STADIUM_OPENING_X - width / 2)));
  return { x, width };
}
/** Lighting themes for the layered backdrop: three scene plates
 *  (dawn/day/dusk, published as transparent PNGs by
 *  tools/prepare_backdrops.py) composited over five sky gradients. */
export type BackdropThemeId = "dawn" | "morning" | "day" | "evening" | "dusk";

export type SpriteVariant = "day" | "dawn" | "dusk";

export interface BackdropTheme {
  id: BackdropThemeId; label: string; skyUrl: string; sceneUrl: string;
  /** Recoloured sprite set matching this lighting (addendum 0010):
   *  morning reuses day sprites, evening reuses the dusk set. */
  spriteVariant: SpriteVariant;
}

export const BACKDROP_THEMES: readonly BackdropTheme[] = [
  { spriteVariant: "dawn", id: "dawn", label: "Dawn", skyUrl: "/backdrops/sky-early-morning.jpeg", sceneUrl: "/backdrops/kallang-scene-dawn.png" },
  { spriteVariant: "day", id: "morning", label: "Morning", skyUrl: "/backdrops/sky-late-morning.jpeg", sceneUrl: "/backdrops/kallang-scene-day.png" },
  { spriteVariant: "day", id: "day", label: "Day", skyUrl: "/backdrops/sky-afternoon.jpeg", sceneUrl: "/backdrops/kallang-scene-day.png" },
  { spriteVariant: "dusk", id: "evening", label: "Evening", skyUrl: "/backdrops/sky-late-afternoon.jpeg", sceneUrl: "/backdrops/kallang-scene-dusk.png" },
  { spriteVariant: "dusk", id: "dusk", label: "Dusk", skyUrl: "/backdrops/sky-dusk.jpeg", sceneUrl: "/backdrops/kallang-scene-dusk.png" },
];

const DAY_THEME: BackdropTheme = BACKDROP_THEMES[2] as BackdropTheme;

export function backdropTheme(id: string | null | undefined): BackdropTheme {
  return BACKDROP_THEMES.find((theme) => theme.id === id) ?? DAY_THEME;
}

/** Loaded layers: sky drawn first, transparent scene plate over it. */
export interface BackdropLayers { sky: SpriteImage; scene: SpriteImage }

const L = { cloud: 10, propBack: 20, peopleBack: 26, propFront: 30, peopleFront: 36,
            boatFar: 40, ripple: 45, boatMid: 50, boatNear: 60 } as const;

/** Corrected promenade feet-lines (grid-measured): the walkable path runs
 *  behind the grass bank on the left, along the paved waterfront in the
 *  centre, and on the UPPER promenade (in front of the ball courts) on the
 *  right — the lower-right strip at y~1240-1280 is a wall face above the
 *  wooden boardwalk, not a path. Boardwalk itself: feet ~1290, x 1400-2600. */
export const PROMENADE_FRONT: ReadonlyArray<readonly [number, number]> = [
  [-60, 1176], [250, 1188], [620, 1202], [1000, 1208], [1300, 1192], [1600, 1184], [2820, 1188],
];
export const PROMENADE_BACK: ReadonlyArray<readonly [number, number]> =
  PROMENADE_FRONT.map(([x, y]) => [x, y - 24] as const);
export const BOARDWALK = { x1: 1470, x2: 2540, feetY: 1297 } as const;

/** Fenced ball courts (grid-measured playing surfaces, world px). */
export const COURTS = {
  futsal: { x1: 1780, y1: 1022, x2: 2220, y2: 1100 },
  basketball: { x1: 2220, y1: 1030, x2: 2640, y2: 1102 },
} as const;

export function buildScene(store: SpriteStore, anchors: Anchors, seed: number): Entity[] {
  const rng = createRng(seed);
  const specs = boatSpecs();
  const entities: Entity[] = [
    ...buildClouds(store, rng),
    ...buildProps(store),
    ...buildPeople(store, rng),
    ...buildCourtPlayers(store, rng),
    ...buildBoats(store, anchors, specs),
    ...buildWaterEffects(store, seed),
  ];
  return entities.sort((a, b) => a.layer - b.layer);
}

export function renderScene(ctx: Ctx, backdrop: BackdropLayers, entities: readonly Entity[],
                            env: RenderEnv, view: SceneView = FULL_VIEW): void {
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.translate(-view.x, 0); // camera window (portrait crop); canvas is view.width x WORLD_HEIGHT
  ctx.drawImage(backdrop.sky as CanvasImageSource, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.drawImage(backdrop.scene as CanvasImageSource, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  for (const entity of entities) entity.draw(ctx, env);
  ctx.restore();
}

function buildClouds(store: SpriteStore, rng: ReturnType<typeof createRng>): Entity[] {
  const picks: Array<[string, number, number]> = [
    ["cloud-16", 150, 340], ["cloud-05", 78, 230], ["cloud-10", 205, 250],
    ["cloud-02", 52, 190], ["cloud-22", 235, 420], ["cloud-13", 120, 280],
    ["cloud-07", 40, 220], ["cloud-24", 262, 350],
  ];
  return picks.map(([spriteId, centreY, width]) => createCloud(store, {
    spriteId, centreY, width, alpha: 0.85,
    speedPxPerSec: rng.range(6, 16), startX: rng.range(0, WORLD_WIDTH),
    worldWidth: WORLD_WIDTH, layer: L.cloud,
  }));
}

function buildProps(store: SpriteStore): Entity[] {
  const props: Entity[] = [
    createProp(store, { spriteId: "tent-red-v2", x: 430, baselineY: 1172, width: 175, layer: L.propBack }),
    createProp(store, { spriteId: "tent-blue-v2", x: 625, baselineY: 1178, width: 175, layer: L.propBack }),
    createProp(store, { spriteId: "tent-yellow-v2", x: 820, baselineY: 1184, width: 175, layer: L.propBack }),
    createProp(store, { spriteId: "canopy-orange-v2", x: 235, baselineY: 1166, width: 150, layer: L.propBack }),
    createProp(store, { spriteId: "feather-psd-v2-a", x: 322, baselineY: 1176, width: 44, layer: L.propFront, swayDeg: 2.2, swayPeriodSec: 2.2 }),
    createProp(store, { spriteId: "feather-fds-v2", x: 932, baselineY: 1188, width: 44, layer: L.propFront, swayDeg: 2.2, swayPeriodSec: 2.6, phaseOffset: 1.2 }),
    createProp(store, { spriteId: "banner-psd-active-day-red-v1", x: 452, baselineY: 1118, width: 272, layer: L.propBack, swayDeg: 0.8, swayPeriodSec: 3.4 }),
    createProp(store, { spriteId: "arch-start-finish-v1", x: 1990, baselineY: 1256, width: 330, layer: L.propFront }),
    createProp(store, { spriteId: "balloon-arch-v2", x: 1490, baselineY: 1246, width: 225, layer: L.propFront }),
    createProp(store, { spriteId: "podium-v2", x: 2385, baselineY: 1244, width: 200, layer: L.propFront }),
    createProp(store, { spriteId: "trophy-table-v2", x: 2245, baselineY: 1248, width: 135, layer: L.propFront }),
    createProp(store, { spriteId: "flag-rainbow-v2", x: 2165, baselineY: 1250, width: 52, layer: L.propFront, swayDeg: 3.2, swayPeriodSec: 1.9 }),
    createHanging(store, { spriteId: "bunting-v2-a", x: 1110, baselineY: 1178, width: 360, layer: L.propFront, swayDeg: 1.4 }),
    createHanging(store, { spriteId: "bunting-v2-b", x: 1700, baselineY: 1186, width: 360, layer: L.propFront, swayDeg: 1.4, phaseOffset: 1.7 }),
  ];
  return props;
}

function buildPeople(store: SpriteStore, rng: ReturnType<typeof createRng>): Entity[] {
  const people: Entity[] = [];
  const walkLanes = [
    { path: PROMENADE_BACK, height: 54, layer: L.peopleBack },
    { path: PROMENADE_FRONT, height: 62, layer: L.peopleFront },
  ];
  for (const lane of walkLanes) {
    for (let i = 0; i < 5; i += 1) {
      people.push(createWalker(store, {
        kit: rng.pick(KITS), feetY: lane.path[1]?.[1] ?? 1185, path: lane.path, height: lane.height,
        startX: rng.range(0, WORLD_WIDTH), speedPxPerSec: rng.range(34, 62) * (i % 2 ? -1 : 1),
        stridePeriodSec: rng.range(0.42, 0.55), worldWidth: WORLD_WIDTH,
        layer: lane.layer, phaseOffset: rng.next(),
      }));
    }
  }
  for (let i = 0; i < 3; i += 1) { // joggers share the corrected front promenade
    people.push(createWalker(store, {
      kit: rng.pick(KITS), feetY: 1188, path: PROMENADE_FRONT, height: 64,
      startX: rng.range(0, WORLD_WIDTH), speedPxPerSec: rng.range(105, 135) * (i % 2 ? 1 : -1),
      stridePeriodSec: 0.3, worldWidth: WORLD_WIDTH, layer: L.peopleFront, phaseOffset: rng.next(),
    }));
  }
  // Lower wooden boardwalk (right only): patrols, so nobody runs off its ends.
  people.push(createPatrol(store, {
    kit: rng.pick(KITS), x1: BOARDWALK.x1, x2: BOARDWALK.x2, feetY: BOARDWALK.feetY, height: 54,
    speedPxPerSec: 92, stridePeriodSec: 0.3, layer: L.peopleFront, phaseOffset: rng.next(),
  }));
  people.push(createPatrol(store, {
    kit: rng.pick(KITS), x1: BOARDWALK.x2 - 120, x2: BOARDWALK.x1 + 140, feetY: BOARDWALK.feetY - 3,
    height: 52, speedPxPerSec: 40, stridePeriodSec: 0.5, layer: L.peopleFront, phaseOffset: rng.next(),
  }));
  const cheerSpots: Array<[number, number, number]> = [
    [1870, 1186, 60], [2110, 1186, 60], [2310, 1184, 58], [2480, 1184, 58],
    [1375, 1190, 56], [1605, 1186, 56], [760, 1112, 44], [905, 1112, 44], [520, 1196, 54],
  ];
  for (const [x, feetY, height] of cheerSpots) {
    people.push(createCheerer(store, {
      kit: rng.pick(KITS), x, feetY, height, layer: L.peopleFront, phaseOffset: rng.next(),
    }));
  }
  const idleSpots: Array<[number, number, number]> = [
    [300, 1184, 52], [700, 1198, 54], [1010, 1202, 54], [1260, 1190, 54], [2190, 1178, 54],
  ];
  for (const [x, feetY, height] of idleSpots) {
    people.push(createIdler(store, {
      kit: rng.pick(KITS), x, feetY, height, layer: L.peopleBack,
      periodSec: rng.range(4, 7.5), phaseOffset: rng.next(),
    }));
  }
  return people;
}

/** Players inside the two fenced ball courts (measured bounds in COURTS):
 *  team-coloured shuttles back and forth, a player calling for the ball,
 *  and a loose ball per court. Heights ~30-36px: courts sit further away. */
function buildCourtPlayers(store: SpriteStore, rng: ReturnType<typeof createRng>): Entity[] {
  const layer = L.peopleBack;
  const players: Entity[] = [
    // Futsal court (red vs blue): 5 shuttles across three depth lanes + 2 callers
    createPatrol(store, { kit: "red", x1: 1845, x2: 2155, feetY: 1086, height: 44, speedPxPerSec: 70, stridePeriodSec: 0.33, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "blue", x1: 2155, x2: 1845, feetY: 1072, height: 40, speedPxPerSec: 64, stridePeriodSec: 0.35, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "red", x1: 1890, x2: 2100, feetY: 1056, height: 36, speedPxPerSec: 54, stridePeriodSec: 0.37, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "blue", x1: 2100, x2: 1900, feetY: 1044, height: 33, speedPxPerSec: 50, stridePeriodSec: 0.38, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "blue", x1: 1945, x2: 2055, feetY: 1092, height: 44, speedPxPerSec: 44, stridePeriodSec: 0.36, layer, phaseOffset: rng.next() }),
    createIdler(store, { kit: "red", x: 2085, feetY: 1064, height: 38, layer, periodSec: rng.range(3.2, 5), phaseOffset: rng.next() }),
    createIdler(store, { kit: "blue", x: 1975, feetY: 1040, height: 33, layer, periodSec: rng.range(3.2, 5), phaseOffset: rng.next() }),
    createBall(store, { spriteId: "equipment-v2-11", x1: 1860, x2: 2140, groundY: 1090, diameter: 15, speedPxPerSec: 58, bounceHeight: 8, bouncesPerSec: 1.7, layer, phaseOffset: rng.next() }),
    // Basketball court (green vs yellow, one orange): same structure
    createPatrol(store, { kit: "green", x1: 2265, x2: 2560, feetY: 1088, height: 43, speedPxPerSec: 72, stridePeriodSec: 0.33, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "yellow", x1: 2560, x2: 2280, feetY: 1074, height: 39, speedPxPerSec: 62, stridePeriodSec: 0.35, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "green", x1: 2320, x2: 2490, feetY: 1058, height: 35, speedPxPerSec: 52, stridePeriodSec: 0.37, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "yellow", x1: 2480, x2: 2340, feetY: 1046, height: 33, speedPxPerSec: 48, stridePeriodSec: 0.38, layer, phaseOffset: rng.next() }),
    createPatrol(store, { kit: "orange", x1: 2375, x2: 2465, feetY: 1094, height: 43, speedPxPerSec: 42, stridePeriodSec: 0.36, layer, phaseOffset: rng.next() }),
    createIdler(store, { kit: "green", x: 2420, feetY: 1066, height: 37, layer, periodSec: rng.range(3.2, 5), phaseOffset: rng.next() }),
    createIdler(store, { kit: "yellow", x: 2328, feetY: 1084, height: 40, layer, periodSec: rng.range(3.2, 5), phaseOffset: rng.next() }),
    createBall(store, { spriteId: "equipment-v2-10", x1: 2290, x2: 2510, groundY: 1092, diameter: 15, speedPxPerSec: 66, bounceHeight: 16, bouncesPerSec: 2.3, layer, phaseOffset: rng.next() }),
  ];
  void COURTS; // bounds above are kept inside these measured rectangles
  return players;
}

/** The eight boats as data, shared by the renderer and traffic/water FX. */
export function boatSpecs(): BoatSpec[] {
  const dragon = (cfg: Omit<Parameters<typeof createDragonBoat>[2], "worldWidth">): BoatSpec =>
    ({ kind: "dragon", cfg: { ...cfg, worldWidth: WORLD_WIDTH } });
  const kayak = (cfg: Omit<Parameters<typeof createKayak>[2], "worldWidth">): BoatSpec =>
    ({ kind: "kayak", cfg: { ...cfg, worldWidth: WORLD_WIDTH } });
  return [
    dragon({ spriteId: "dragon-boat-purple", waterlineY: 1388, width: 470, speedPxPerSec: -58, startX: 1950, phaseOffset: 0.35, periodScale: 1.04, layer: L.boatFar }),
    kayak({ spriteId: "kayak-blue-k2-a", kind: "k2", waterlineY: 1402, width: 295, speedPxPerSec: -82, startX: 750, phaseOffset: 0.1, periodScale: 1, layer: L.boatFar }),
    dragon({ spriteId: "dragon-boat-green", waterlineY: 1430, width: 560, speedPxPerSec: -66, startX: 320, phaseOffset: 0.72, periodScale: 0.96, layer: L.boatMid }),
    kayak({ spriteId: "kayak-red-k1-a", kind: "k1", waterlineY: 1444, width: 300, speedPxPerSec: 92, startX: 1500, phaseOffset: 0.55, periodScale: 0.94, layer: L.boatMid }),
    kayak({ spriteId: "kayak-coral-k3", kind: "k3", waterlineY: 1438, width: 325, speedPxPerSec: -78, startX: 2450, phaseOffset: 0.28, periodScale: 1.02, layer: L.boatMid }),
    dragon({ spriteId: "dragon-boat-red", waterlineY: 1470, width: 705, speedPxPerSec: -74, startX: 1250, phaseOffset: 0.05, periodScale: 1, layer: L.boatNear }),
    kayak({ spriteId: "kayak-green-k2-b", kind: "k2", waterlineY: 1494, width: 345, speedPxPerSec: -98, startX: 2650, phaseOffset: 0.8, periodScale: 0.9, layer: L.boatNear }),
    kayak({ spriteId: "kayak-yellow-k1-b", kind: "k1", waterlineY: 1514, width: 310, speedPxPerSec: 88, startX: 120, phaseOffset: 0.42, periodScale: 1.05, layer: L.boatNear }),
  ];
}

function buildBoats(store: SpriteStore, anchors: Anchors, specs: readonly BoatSpec[]): Entity[] {
  return specs.map((spec) => spec.kind === "dragon"
    ? createDragonBoat(store, anchors.dragonBoat, spec.cfg)
    : createKayak(store, anchors.kayak, spec.cfg));
}

export interface WaterEffectPlacement {
  x: number; y: number; spriteId: string; width: number; periodSec: number; phaseOffset: number;
}

// (ripple-v1-05/06 are excluded: they have an oar painted in.)
const RIPPLE_SPRITES = ["ripple-v1-01", "ripple-v1-02", "ripple-v1-03", "ripple-v1-04",
  "ripple-v1-07", "ripple-v2-01", "ripple-v2-03", "ripple-v2-04"] as const;
const SPLASH_SPRITES = ["splash-01", "splash-02", "splash-03", "splash-v1-01", "splash-v1-02"] as const;

export const WATER_EFFECT_COUNT = 34;

/** Deterministic sprinkling layout: seeded-random points inside the mapped
 *  open water (scene/waterMap.ts), own RNG stream so QA can reproduce it. */
export function waterEffectPlacements(seed: number): WaterEffectPlacement[] {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  return placeWaterEffects(rng, WATER_EFFECT_COUNT, 108).map((point) => {
    const isSplash = rng.next() < 0.4;
    return {
      x: point.x, y: point.y,
      spriteId: isSplash ? rng.pick(SPLASH_SPRITES) : rng.pick(RIPPLE_SPRITES),
      width: isSplash ? rng.range(55, 92) : rng.range(95, 175),
      periodSec: rng.range(2.2, 4.2),
      phaseOffset: rng.next(),
    };
  });
}

/** Painter's-algorithm layer for a flat water effect: just behind the boat
 *  lane in front of it (lane waterlines: far ~1388-1402, mid ~1430-1444,
 *  near ~1470+), so hulls occlude effects behind them naturally. */
export function layerForWaterEffect(y: number): number {
  if (y < 1395) return L.boatFar - 1;
  if (y < 1440) return L.boatMid - 1;
  return L.boatNear - 1;
}

function buildWaterEffects(store: SpriteStore, seed: number): Entity[] {
  return waterEffectPlacements(seed).map((placement) =>
    createRipple(store, { ...placement, layer: layerForWaterEffect(placement.y) }));
}
