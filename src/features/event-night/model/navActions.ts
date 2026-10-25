import { DEFAULT_TAGLINE, SECTION_TAGLINES } from '../data/sectionTaglines';

export type NavAction =
  | { kind: 'open-draw' }
  | { kind: 'section'; key: string; rainConfetti: boolean };

/** What choosing a bottom-bar item does, decided from its label alone. */
export function resolveNavAction(label: string): NavAction {
  const key = label.trim().toLowerCase();
  if (key.includes('draw')) return { kind: 'open-draw' };
  return { kind: 'section', key, rainConfetti: key.includes('toast') };
}

export function taglineFor(key: string): string {
  return SECTION_TAGLINES[key] ?? DEFAULT_TAGLINE;
}
