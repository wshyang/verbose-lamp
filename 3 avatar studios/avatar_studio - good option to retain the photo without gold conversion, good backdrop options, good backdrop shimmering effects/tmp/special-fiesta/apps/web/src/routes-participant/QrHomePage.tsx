import { Link } from 'react-router-dom';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { Avatar } from '../components/participant/Avatar.js';
import { RoleMotif } from '../components/participant/RoleMotif.js';
import { formatPoints } from '../lib/format.js';
import { useProfile, useQrCode } from '../lib/hooks/useParticipantHome.js';

/**
 * S3 — QR badge home (F25). The one screen a participant shows at every fringe station.
 *
 * ADR-266 — only three things must be seen at the glance this screen exists for: the
 * nickname, the QR code and the spoken facilitator number. The card therefore lays out
 * at natural size in that order and lets the honours below (points, the profile link,
 * the sand strip) fall below the fold on a short phone, rather than ADR-098's earlier
 * arrangement of shrinking the whole card until every last crab fit the viewport —
 * which made the code itself, the one thing that has to be scanned across a counter,
 * the smallest thing on the screen.
 *
 * ADR-318 — those three essentials share `.gb-qr-essentials`, and the spoken number is
 * always above the fold: the code (alone) gives up height on a short phone, in CSS.
 */
export function QrHomePage() {
  const profile = useProfile();
  const qr = useQrCode(profile.participant?.nickname ?? null);

  const participant = profile.participant;
  const totals = profile.totals;

  if (!participant || !totals) {
    return (
      <GameboyShell title="YOUR BADGE">
        <p className="loading">{profile.error ?? 'Loading…'}</p>
      </GameboyShell>
    );
  }

  const totalLabel = formatPoints(totals.totalPoints);

  return (
    <GameboyShell title="YOUR BADGE" subtitle="Show this at any station">
      <section className="gb-panel" style={{ textAlign: 'center' }}>
        <div className="gb-qr-essentials" data-testid="qr-home__essentials">
          <div className="gb-row" style={{ justifyContent: 'center' }}>
            <Avatar person={participant} size={64} />
            <div>
              <h2 style={{ marginBottom: 4 }}>{participant.nickname}</h2>
              <span className="gb-badge">{participant.clusterCode}</span>
            </div>
          </div>
          <div className="gb-qr-slot">
            {qr.dataUrl ? (
              <img className="gb-qr" src={qr.dataUrl} alt={`QR code for ${participant.nickname}`} />
            ) : (
              <p className="loading">{qr.error ?? 'Drawing your code…'}</p>
            )}
          </div>
          {/* ADR-088 — the spoken fallback is the scan number now: 4 keypad digits at the
              station instead of a nickname typed under glare. */}
          <p className="gb-hint" data-testid="qr-home__fallback">
            Can&apos;t scan? Give the facilitator your number:{' '}
            <strong className="gb-number-pill" data-testid="qr-home__scan-number">
              {participant.scanNumber}
            </strong>
          </p>
        </div>
        <p className="gb-points" style={{ marginTop: 16 }}>
          {totalLabel}
        </p>
        <Link className="gb-button gb-button--secondary" to="/me" data-testid="qr-home__profile">
          My points
        </Link>
        <div className="gb-ground-strip">
          <RoleMotif role="groundStripLeft" size={22} className="" />
          <RoleMotif role="groundStripMiddle" size={22} className="" />
          <RoleMotif role="groundStripRight" size={22} className="" />
        </div>
      </section>
    </GameboyShell>
  );
}
