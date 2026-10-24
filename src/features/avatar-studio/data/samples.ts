import weiLingUrl from '../assets/wei-ling.jpg';
import type { AvatarSample } from '../types';

/**
 * Bundled demo portraits. The JPEG is imported, so the single-file build inlines it as a
 * data URL and it loads offline — never a bare `/demo/...` path that a static host may
 * not serve. Persona copy from the reference app's `demo-personas.json`.
 */
export const AVATAR_SAMPLES: readonly AvatarSample[] = Object.freeze([
  Object.freeze({ id: 'wei-ling', name: 'Wei_Ling', persona: 'Kaya-toast powered sprinter', src: weiLingUrl }),
]);

export const WEI_LING: AvatarSample = AVATAR_SAMPLES[0];
