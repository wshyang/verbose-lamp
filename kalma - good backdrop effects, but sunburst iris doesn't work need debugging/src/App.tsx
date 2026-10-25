import { EventNight } from '@/app/EventNight';
import { GildedGlyphDefs } from '@/features/gilded-ui';
import { SpectacleProvider } from '@/features/spectacle';

export default function App() {
  return (
    <SpectacleProvider>
      <GildedGlyphDefs />
      <EventNight />
    </SpectacleProvider>
  );
}