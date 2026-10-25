import { useCallback } from 'react';
import { useLuckyDrawStage } from './useLuckyDrawStage';
import { useSpectaclePreview } from './useSpectaclePreview';

/**
 * Everything a host needs to offer the spectacle console: the panel/preview
 * state, a lucky-draw session and the toggle for its launcher button. Hooks
 * decide; the host renders (CLAUDE.md §6). Event Night composes the pieces by
 * hand because its header and nav bar own more of the layout; any other host can
 * mount `SpectacleConsoleOverlay` and pass `toggle` to its launcher.
 */
export function useSpectacleConsole() {
  const preview = useSpectaclePreview();
  const draw = useLuckyDrawStage();
  const { setOpen } = preview;

  const toggle = useCallback(() => setOpen((isOpen) => !isOpen), [setOpen]);

  return { preview, draw, toggle };
}

export type SpectacleConsoleState = ReturnType<typeof useSpectacleConsole>;
