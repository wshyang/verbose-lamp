import './eventNight.css';
import { GildedGlyphDefs } from '@/features/gilded-ui';
import { SpectacleProvider } from '@/features/spectacle';
import { EventNightStage } from './components/EventNightStage';

interface EventNightScreenProps {
  /** Leaves the Event Night screen (the host decides where to). */
  onExit: () => void;
}

/**
 * The dinner-and-dance demo as a self-contained screen: it owns its spectacle
 * stage, so mounting and unmounting it never touches the host's other screens.
 */
export function EventNightScreen({ onExit }: EventNightScreenProps) {
  return (
    <div className="event-night__root h-dvh w-screen bg-[#060402]" data-testid="event-night__screen">
      <SpectacleProvider className="relative h-full overflow-hidden">
        <GildedGlyphDefs />
        <EventNightStage onExit={onExit} />
      </SpectacleProvider>
    </div>
  );
}
