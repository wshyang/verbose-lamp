import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/data/sequence';
import type { HeroTitleConfig } from '@/features/premiere/model/types';

/** The four free-text fields of the title card. The fifth field is a flag. */
export type TitleTextKey = 'keystone' | 'preTitle' | 'mainTitle' | 'subCredit';

export interface TitleDraftController {
  draft: HeroTitleConfig;
  setText: (key: TitleTextKey, value: string) => void;
  setPinstripe: (enabled: boolean) => void;
  applyPreset: (preset: HeroTitleConfig) => void;
  reset: () => void;
}

/**
 * The dialog's working copy of the title (ADDENDUM-036): re-seeded from `config`
 * every time the dialog opens, edited freely, and only committed on submit.
 * Text is upper-cased as it is typed — the marquee is set in caps, so letting a
 * lower-case draft through would show a preview the canvas never renders.
 */
export function useTitleDraft(open: boolean, config: HeroTitleConfig): TitleDraftController {
  const [draft, setDraft] = useState<HeroTitleConfig>(config);

  useEffect(() => {
    if (open) setDraft({ ...config });
  }, [open, config]);

  const setText = useCallback((key: TitleTextKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value.toUpperCase() }));
  }, []);
  const setPinstripe = useCallback((enabled: boolean) => {
    setDraft((current) => ({ ...current, pinstripeAlternation: enabled }));
  }, []);
  const applyPreset = useCallback((preset: HeroTitleConfig) => setDraft({ ...preset }), []);
  const reset = useCallback(() => setDraft({ ...DEFAULT_HERO_TITLE }), []);

  return { draft, setText, setPinstripe, applyPreset, reset };
}
