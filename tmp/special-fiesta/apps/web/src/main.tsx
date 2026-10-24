import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AppRouter } from './AppRouter.js';
import { SessionProvider } from './components/shared/SessionProvider.js';
import { VenueProvider } from './components/shared/VenueProvider.js';
import { watchAppShellPolicy } from './lib/sw/register.js';
import { applyVenueBeforeFirstRender } from './lib/venueStartup.js';
import './styles/base.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

/*
 * ADR-298 / ADR-299 — the venue goes on <html> BEFORE React renders. A returning phone wears what
 * it last heard, instantly; a first-time phone waits (briefly) for the server to name the venue,
 * because the provider's effect runs after the first frame and would otherwise paint the default
 * venue's colours, and start fetching its art, on a deployment that is somewhere else.
 */
await applyVenueBeforeFirstRender();

createRoot(container).render(
  <StrictMode>
    <AppRouter>
      <VenueProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </VenueProvider>
    </AppRouter>
  </StrictMode>,
);

/*
 * ADR-147 — after `load`, never during first paint. Whether this device keeps a copy of the
 * app shell is a question for a moment when nothing is waiting on the answer, and the app
 * must be exactly as correct when the answer never arrives.
 */
window.addEventListener('load', () => void watchAppShellPolicy());
