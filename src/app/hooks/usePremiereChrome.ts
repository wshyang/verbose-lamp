import { useCallback, useState } from 'react';

/**
 * What the premiere's chrome is showing: the HUD, and the research and title dialogs. View state
 * only; the premiere's playback and the spectacle console decide elsewhere.
 */
export function usePremiereChrome() {
  const [hudHidden, setHudHidden] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);

  const toggleHud = useCallback(() => setHudHidden((hidden) => !hidden), []);
  const openResearch = useCallback(() => setShowResearch(true), []);
  const closeResearch = useCallback(() => setShowResearch(false), []);
  const openCustomizer = useCallback(() => setShowCustomizer(true), []);
  const closeCustomizer = useCallback(() => setShowCustomizer(false), []);

  return {
    hudHidden,
    toggleHud,
    showResearch,
    openResearch,
    closeResearch,
    showCustomizer,
    openCustomizer,
    closeCustomizer,
  };
}
