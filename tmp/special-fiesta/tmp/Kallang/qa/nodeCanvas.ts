/** Node QA harness: load sprites from public/ via napi-canvas so the real
 *  renderer produces reviewable PNG stills without a browser (CLAUDE §8). */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile, writeFile } from "node:fs/promises";
import { buildStore, type SpriteStore } from "../src/lib/sprites";
import type { SpriteImage, SpriteManifest } from "../src/lib/types";
import { backdropTheme, type BackdropLayers, type SpriteVariant } from "../src/scene/scene";

export async function loadNodeStore(variant: SpriteVariant = "day"): Promise<SpriteStore> {
  const file = variant === "day" ? "sprite-manifest.json" : `sprite-manifest-${variant}.json`;
  const raw = await readFile(`src/generated/${file}`, "utf8");
  const manifest = JSON.parse(raw) as SpriteManifest;
  return buildStore(manifest, async (entry) => loadImage(`public${entry.url}`) as Promise<SpriteImage>);
}

export async function loadBackdrop(themeId = "day"): Promise<BackdropLayers> {
  const theme = backdropTheme(themeId);
  const [sky, scene] = await Promise.all([
    loadImage(`public${theme.skyUrl}`), loadImage(`public${theme.sceneUrl}`),
  ]);
  return { sky: sky as SpriteImage, scene: scene as SpriteImage };
}

export { createCanvas };

export async function saveCanvas(canvas: { encode: (f: "png") => Promise<Buffer> }, path: string): Promise<void> {
  await writeFile(path, await canvas.encode("png"));
  console.log(`wrote ${path}`);
}
