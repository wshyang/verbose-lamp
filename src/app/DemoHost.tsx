import { EventNightScreen } from '@/features/event-night';
import { GatsbyPremiere } from './GatsbyPremiere';
import { useDemoScreen } from './hooks/useDemoScreen';

/**
 * Chooses which demo is mounted. Only one is mounted at a time, so the premiere's
 * Three.js scene and audio are disposed while Event Night runs its 2D canvases.
 */
export function DemoHost() {
  const { screen, openEventNight, openPremiere } = useDemoScreen();
  if (screen === 'event-night') return <EventNightScreen onExit={openPremiere} />;
  return <GatsbyPremiere onOpenEventNight={openEventNight} />;
}
