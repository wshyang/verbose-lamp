import { useCallback, useEffect, useState } from 'react';
import { EVENT_NIGHT_HASH, parseDemoScreen, type DemoScreen } from '../model/demoScreen';

function currentScreen(): DemoScreen {
  return parseDemoScreen(window.location.hash);
}

/**
 * Which demo is on screen. The choice lives in the URL hash through the History
 * API, so the browser's Back and Forward buttons move between the demos.
 */
export function useDemoScreen() {
  const [screen, setScreen] = useState<DemoScreen>(currentScreen);

  useEffect(() => {
    const sync = () => setScreen(currentScreen());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const openEventNight = useCallback(() => {
    window.history.pushState(null, '', EVENT_NIGHT_HASH);
    setScreen('event-night');
  }, []);

  const openPremiere = useCallback(() => {
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    setScreen('premiere');
  }, []);

  return { screen, openEventNight, openPremiere };
}
