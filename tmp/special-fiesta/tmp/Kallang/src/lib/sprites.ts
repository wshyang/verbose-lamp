/** Sprite store built from the generated manifest contract. */
import type { LoadedSprite, SpriteEntry, SpriteImage, SpriteManifest } from "./types";

export class SpriteStore {
  private readonly byId = new Map<string, LoadedSprite>();
  private readonly ids: string[] = [];

  add(entry: SpriteEntry, image: SpriteImage): void {
    this.byId.set(entry.id, { entry, image });
    this.ids.push(entry.id);
  }

  get(id: string): LoadedSprite {
    const sprite = this.byId.get(id);
    if (sprite === undefined) throw new Error(`Unknown sprite id: ${id}`);
    return sprite;
  }

  image(id: string): SpriteImage {
    return this.get(id).image;
  }

  idsWithPrefix(prefix: string): string[] {
    return this.ids.filter((id) => id.startsWith(prefix));
  }

  idsOfClass(className: string): string[] {
    return [...this.byId.values()]
      .filter((s) => s.entry.class === className)
      .map((s) => s.entry.id);
  }
}

export type ImageLoader = (entry: SpriteEntry) => Promise<SpriteImage>;

export async function buildStore(manifest: SpriteManifest, load: ImageLoader): Promise<SpriteStore> {
  const store = new SpriteStore();
  await Promise.all(
    manifest.sprites.map(async (entry) => store.add(entry, await load(entry))),
  );
  return store;
}
