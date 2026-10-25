/**
 * Sprite store: the loaded sprites by id, with their natural sizes.
 *
 * Ported from the reference project (`tmp/Kallang/src/lib/sprites.ts`, ADR-306).
 * The manifest is ours (`../spriteManifest.ts`): entry sizes are taken from the
 * loaded images themselves, since the served sprites are resized copies whose
 * aspect ratios match the originals.
 */
import type { LoadedSprite, SpriteEntry, SpriteImage } from './types.js';

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
}

export type ImageLoader = (id: string) => Promise<SpriteImage>;

/** Load every sprite the scene can reference, keyed by id. */
export async function buildStore(ids: readonly string[], load: ImageLoader): Promise<SpriteStore> {
  const store = new SpriteStore();
  await Promise.all(
    ids.map(async (id) => {
      const image = await load(id);
      store.add({ id, width: image.width, height: image.height }, image);
    }),
  );
  return store;
}
