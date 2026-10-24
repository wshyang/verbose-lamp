import { Link } from 'react-router-dom';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { RoleMotif } from '../components/participant/RoleMotif.js';
import { useVenueTheme } from '../themes/venueContext.js';

/** Entry surface. Everything a participant can do starts with a nickname and a 4-digit PIN. */
export function LandingPage() {
  const { copy } = useVenueTheme();
  return (
    <GameboyShell title="PSD ACTIVE DAY" subtitle={copy.landingSubtitle} showNav={false}>
      <section className="gb-panel">
        <h2>
          <RoleMotif role="landingHero" size={20} className="" />
          Welcome!
        </h2>
        <p>
          Pick a nickname, choose your character and start earning points for your cluster at every
          station on {copy.landingStationsPlace}.
        </p>
        <Link className="gb-button" to="/signup" data-testid="landing__signup">
          New here — sign up
        </Link>
        <div style={{ height: 12 }} />
        <Link className="gb-button gb-button--secondary" to="/signin" data-testid="landing__signin">
          I already have a nickname
        </Link>
      </section>
      <section className="gb-panel">
        <h3>
          <RoleMotif role="teamsHero" size={16} className="" />
          Running the event?
        </h3>
        <div className="gb-row">
          <Link className="gb-button gb-button--small" to="/staff/signin" data-testid="landing__staff">
            Facilitator
          </Link>
          <Link className="gb-button gb-button--small" to="/admin/signin" data-testid="landing__admin">
            Superadmin
          </Link>
        </div>
      </section>
    </GameboyShell>
  );
}
