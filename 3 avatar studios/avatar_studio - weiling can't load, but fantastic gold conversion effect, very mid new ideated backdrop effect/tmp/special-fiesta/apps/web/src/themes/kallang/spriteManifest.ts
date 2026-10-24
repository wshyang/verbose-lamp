/**
 * Every sprite id the ported engine can reference (ADR-306), as served files:
 * sprite `id` is `public/themes/kallang/scene/<id>.png`, content-stamped like
 * the plate. The list is derived from the engine's own vocabulary — the six
 * kits' pose sets (rich kits: orange/purple; see `engine/character.ts`), the
 * fixed cloud picks, props, boats and the water-effect pools in
 * `engine/scene.ts` — and `sceneVersion.test.ts` pins it against the files on
 * disk, so a sprite the engine reaches for but we do not serve fails a test,
 * not a user's screen.
 */
import { SCENE_VERSION } from './art/sceneVersion.js';
import { KITS, RICH_KIT_IDS } from './engine/character.js';

export const SCENE_BASE = '/themes/kallang/scene';

function kitSpriteIds(kit: string): string[] {
  const poses = RICH_KIT_IDS.has(kit)
    ? ['run-right-a', 'run-side-right', 'run-right-b', 'run-side-left', 'celebrate-front', 'wave', 'idle-front']
    : ['run-right', 'side-right', 'run-left', 'celebrate-front', 'cheer-front', 'idle-front', 'reach-right'];
  return poses.map((pose) => `char-${kit}-${pose}`);
}

export const KALLANG_SPRITE_IDS: readonly string[] = [
  ...KITS.flatMap((kit) => kitSpriteIds(kit)),
  // The eight fixed cloud picks (engine/scene.ts buildClouds).
  'cloud-16',
  'cloud-05',
  'cloud-10',
  'cloud-02',
  'cloud-22',
  'cloud-13',
  'cloud-07',
  'cloud-24',
  // Event props (buildProps) and the two court balls (buildCourtPlayers).
  'tent-red-v2',
  'tent-blue-v2',
  'tent-yellow-v2',
  'canopy-orange-v2',
  'feather-psd-v2-a',
  'feather-fds-v2',
  'banner-psd-active-day-red-v1',
  'arch-start-finish-v1',
  'balloon-arch-v2',
  'podium-v2',
  'trophy-table-v2',
  'flag-rainbow-v2',
  'bunting-v2-a',
  'bunting-v2-b',
  'equipment-v2-11',
  'equipment-v2-10',
  // Boats: hulls, stitched paddles, wakes and stroke splashes (engine/anchors.ts).
  'dragon-boat-purple',
  'dragon-boat-green',
  'dragon-boat-red',
  'kayak-blue-k2-a',
  'kayak-red-k1-a',
  'kayak-coral-k3',
  'kayak-green-k2-b',
  'kayak-yellow-k1-b',
  'paddle-wood-07',
  'paddle-double-01',
  'wake-v1-04',
  'wake-v1-01',
  'splash-v1-02',
  'splash-02',
  // Ambient water-effect pools (RIPPLE_SPRITES / SPLASH_SPRITES in engine/scene.ts).
  'ripple-v1-01',
  'ripple-v1-02',
  'ripple-v1-03',
  'ripple-v1-04',
  'ripple-v1-07',
  'ripple-v2-01',
  'ripple-v2-03',
  'ripple-v2-04',
  'splash-01',
  'splash-03',
  'splash-v1-01',
];

export function spriteUrl(id: string): string {
  return `${SCENE_BASE}/${id}.png?v=${SCENE_VERSION}`;
}

export function backdropUrl(): string {
  return `${SCENE_BASE}/backdrop-day.jpg?v=${SCENE_VERSION}`;
}
