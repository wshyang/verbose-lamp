import { useCallback, useState } from 'react';
import { useSpectacle, type NormPoint } from '@/features/spectacle';
import {
  DEFAULT_SPARKLER_SETTINGS,
  clampSparklerSettings,
  sparklerParams,
  type SparklerSettings,
} from '../model/sparklerSettings';

/**
 * Decides everything the party-sparkler control needs; the components only
 * render it (CLAUDE.md §6). Lighting a fan is one `play('sparklers', …)` call, so
 * any host can reuse this without the button or the overlay.
 */
export function usePartySparklers() {
  const { play } = useSpectacle();
  const [isOpen, setOpen] = useState(false);
  const [settings, setSettings] = useState<SparklerSettings>(DEFAULT_SPARKLER_SETTINGS);

  const updateSettings = useCallback((patch: Partial<SparklerSettings>) => {
    setSettings((current) => clampSparklerSettings({ ...current, ...patch }));
  }, []);

  const toggle = useCallback(() => setOpen((open) => !open), []);
  const close = useCallback(() => setOpen(false), []);

  const light = useCallback(
    (origin?: NormPoint) => {
      play('sparklers', sparklerParams(settings, origin));
      setOpen(false);
    },
    [play, settings]
  );

  return { isOpen, toggle, close, settings, updateSettings, light };
}

export type PartySparklers = ReturnType<typeof usePartySparklers>;
