/** Browser entrypoint: load sprites, then run the deterministic scene clock. */
import manifestDawnJson from "./generated/sprite-manifest-dawn.json";
import manifestDayJson from "./generated/sprite-manifest.json";
import manifestDuskJson from "./generated/sprite-manifest-dusk.json";
import { loadAnchors } from "./lib/anchors";
import { buildStore } from "./lib/sprites";
import type { SpriteEntry, SpriteImage, SpriteManifest } from "./lib/types";
import { buildLab, LAB_HEIGHT, LAB_WIDTH, renderLab } from "./scene/lab";
import {
  backdropTheme, buildScene, computeSceneView, FULL_VIEW, renderScene,
  WORLD_HEIGHT, WORLD_WIDTH,
  type BackdropLayers, type BackdropTheme, type SceneView, type SpriteVariant,
} from "./scene/scene";

function manifestForVariant(variant: SpriteVariant): SpriteManifest {
  if (variant === "dawn") return manifestDawnJson as SpriteManifest;
  if (variant === "dusk") return manifestDuskJson as SpriteManifest;
  return manifestDayJson as SpriteManifest;
}

interface Controls {
  pause: HTMLButtonElement;
  speed: HTMLButtonElement;
  view: HTMLButtonElement;
  anchors: HTMLButtonElement;
  theme: HTMLSelectElement;
}

async function loadBackdropLayers(theme: BackdropTheme): Promise<BackdropLayers> {
  const [sky, scene] = await Promise.all([loadHtmlImage(theme.skyUrl), loadHtmlImage(theme.sceneUrl)]);
  return { sky, scene };
}

const SPEEDS = [0.5, 1, 2] as const;

function must<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`Missing element: ${label}`);
  return value;
}

function loadHtmlImage(src: string): Promise<SpriteImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

function parseParams() {
  const params = new URLSearchParams(location.search);
  return {
    seed: Number(params.get("seed") ?? "20261017"),
    startAt: Number(params.get("t") ?? "0"),
    view: params.get("view") === "lab" ? ("lab" as const) : ("scene" as const),
    theme: backdropTheme(params.get("theme")),
  };
}

async function boot(): Promise<void> {
  const canvas = must(document.querySelector<HTMLCanvasElement>("#scene"), "#scene");
  const ctx = must(canvas.getContext("2d"), "2d context");
  const controls: Controls = {
    pause: must(document.querySelector<HTMLButtonElement>("#btn-pause"), "#btn-pause"),
    speed: must(document.querySelector<HTMLButtonElement>("#btn-speed"), "#btn-speed"),
    view: must(document.querySelector<HTMLButtonElement>("#btn-view"), "#btn-view"),
    anchors: must(document.querySelector<HTMLButtonElement>("#btn-anchors"), "#btn-anchors"),
    theme: must(document.querySelector<HTMLSelectElement>("#theme-select"), "#theme-select"),
  };
  const params = parseParams();
  const loadEntry = (entry: SpriteEntry) => loadHtmlImage(entry.url);
  const store = await buildStore(manifestForVariant(params.theme.spriteVariant), loadEntry);
  const backdrop = await loadBackdropLayers(params.theme);
  const anchors = loadAnchors();
  const scene = buildScene(store, anchors, params.seed);
  const lab = buildLab(store, anchors);
  must(document.querySelector<HTMLElement>("#loading"), "#loading").style.display = "none";

  const state: MutableState = {
    paused: false, speedIndex: 1, view: params.view, showAnchors: false, time: params.startAt,
    sceneView: FULL_VIEW,
  };
  controls.theme.value = params.theme.id;
  wireControls(controls, state, () => applyView(canvas, controls, state));
  applyView(canvas, controls, state);
  window.addEventListener("resize", () => applyView(canvas, controls, state));
  const clockArgs: ClockArgs = { backdrop, scene, lab, state, spriteVariant: params.theme.spriteVariant };
  wireThemeSelect(controls.theme, clockArgs, params.seed, anchors);
  startClock(ctx, clockArgs);
}

function wireControls(controls: Controls, state: MutableState, onViewChange: () => void): void {
  controls.view.addEventListener("click", () => {
    state.view = state.view === "scene" ? "lab" : "scene";
    onViewChange();
  });
  controls.pause.addEventListener("click", () => {
    state.paused = !state.paused;
    controls.pause.textContent = state.paused ? "Play" : "Pause";
  });
  controls.speed.addEventListener("click", () => {
    state.speedIndex = (state.speedIndex + 1) % SPEEDS.length;
    controls.speed.textContent = `Speed: ${SPEEDS[state.speedIndex]}×`;
  });
  controls.anchors.addEventListener("click", () => {
    state.showAnchors = !state.showAnchors;
    controls.anchors.setAttribute("aria-pressed", String(state.showAnchors));
    controls.anchors.textContent = state.showAnchors ? "Hide anchor points" : "Show anchor points";
  });
}

interface MutableState {
  paused: boolean; speedIndex: number; view: "scene" | "lab"; showAnchors: boolean; time: number;
  sceneView: SceneView;
}

/** Portrait/narrow stages crop around the stadium opening (addendum 0011):
 *  full world on landscape, otherwise fill ~82% of viewport height. */
const MIN_STAGE_ASPECT = 0.6;

function stageAspectForViewport(): number {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const worldAspect = WORLD_WIDTH / WORLD_HEIGHT;
  const narrow = vw < vh || vw <= 760;
  if (!narrow) return worldAspect;
  return Math.min(worldAspect, Math.max(MIN_STAGE_ASPECT, vw / (vh * 0.82)));
}

function applyView(canvas: HTMLCanvasElement, controls: Controls, state: MutableState): void {
  const isLab = state.view === "lab";
  if (isLab) {
    canvas.width = LAB_WIDTH;
    canvas.height = LAB_HEIGHT;
  } else {
    state.sceneView = computeSceneView(stageAspectForViewport());
    canvas.width = state.sceneView.width;
    canvas.height = WORLD_HEIGHT;
  }
  canvas.parentElement?.style.setProperty("aspect-ratio", `${canvas.width} / ${canvas.height}`);
  controls.view.textContent = isLab ? "View: Composite lab" : "View: Scene";
}

function wireThemeSelect(select: HTMLSelectElement, clockArgs: ClockArgs,
                         seed: number, anchors: ReturnType<typeof loadAnchors>): void {
  let request = 0;
  let variant: SpriteVariant | null = null;
  select.addEventListener("change", () => {
    const mine = (request += 1);
    const theme = backdropTheme(select.value);
    void (async () => {
      const layers = await loadBackdropLayers(theme);
      if (mine !== request) return; // ignore stale loads
      clockArgs.backdrop = layers;
      if (variant === null) variant = clockArgs.spriteVariant;
      if (theme.spriteVariant !== variant) {
        variant = theme.spriteVariant;
        const themed = await buildStore(manifestForVariant(variant),
          (entry: SpriteEntry) => loadHtmlImage(entry.url));
        if (mine !== request) return;
        clockArgs.scene = buildScene(themed, anchors, seed);
        clockArgs.lab = buildLab(themed, anchors);
        clockArgs.spriteVariant = variant;
      }
    })();
  });
}

interface ClockArgs {
  backdrop: BackdropLayers;
  scene: ReturnType<typeof buildScene>;
  lab: ReturnType<typeof buildLab>;
  state: MutableState;
  spriteVariant: SpriteVariant;
}

function startClock(ctx: CanvasRenderingContext2D, args: ClockArgs): void {
  let last = performance.now();
  const tick = (now: number): void => {
    const deltaSec = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!args.state.paused) args.state.time += deltaSec * (SPEEDS[args.state.speedIndex] ?? 1);
    const env = { timeSec: args.state.time, showAnchors: args.state.showAnchors };
    if (args.state.view === "scene") renderScene(ctx, args.backdrop, args.scene, env, args.state.sceneView);
    else renderLab(ctx, args.lab, env);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

void boot().catch((error: unknown) => {
  const loading = document.querySelector<HTMLElement>("#loading");
  if (loading) loading.textContent = `Could not start the scene: ${error instanceof Error ? error.message : String(error)}`;
});
