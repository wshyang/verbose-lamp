import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_HERO_TITLE } from '@/features/premiere/data/sequence';
import type { HeroTitleConfig } from '@/features/premiere/model/types';
import type { HeroTitlePreset } from '../data/titlePresets';
import { normalizeHeroTitle } from '../model/normalizeHeroTitle';

type TextField = 'keystone' | 'preTitle' | 'mainTitle' | 'subCredit';

interface TitleDraftOptions {
  open: boolean;
  config: HeroTitleConfig;
  onApply: (config: HeroTitleConfig) => void;
  onClose: () => void;
}

/** The editable copy of the hero title: reloaded each time the dialog opens, normalised on apply. */
export function useTitleDraft({ open, config, onApply, onClose }: TitleDraftOptions) {
  const [draft, setDraft] = useState<HeroTitleConfig>(config);

  useEffect(() => {
    if (open) setDraft({ ...config });
  }, [open, config]);

  /** Title text is always capitals, so the preview matches what the engraving will draw. */
  const setText = useCallback(
    (field: TextField, value: string) => setDraft((current) => ({ ...current, [field]: value.toUpperCase() })),
    []
  );
  const setPinstripe = useCallback(
    (pinstripeAlternation: boolean) => setDraft((current) => ({ ...current, pinstripeAlternation })),
    []
  );
  const applyPreset = useCallback((preset: HeroTitlePreset) => setDraft({ ...preset.config }), []);
  const reset = useCallback(() => setDraft({ ...DEFAULT_HERO_TITLE }), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onApply(normalizeHeroTitle(draft));
    onClose();
  };

  return { draft, setText, setPinstripe, applyPreset, reset, submit };
}
