import { Navigate, Route, Routes } from 'react-router-dom';
import { UpdateBanner } from './components/shared/UpdateBanner.js';
import { useLocationMemory } from './lib/hooks/useLocationMemory.js';
import { RequireActor } from './components/shared/RequireActor.js';
import { SyncProvider } from './components/shared/SyncProvider.js';
import { ChatPanel } from './routes-participant/ChatPanel.js';
import { LandingPage } from './routes-participant/LandingPage.js';
import { LeaderboardPage } from './routes-participant/LeaderboardPage.js';
import { AgendaPage } from './routes-participant/AgendaPage.js';
import { LineupsPage } from './routes-participant/LineupsPage.js';
import { MatchFeedPage } from './routes-participant/MatchFeedPage.js';
import { MyTeamPage } from './routes-participant/MyTeamPage.js';
import { PhotosPanel } from './routes-participant/PhotosPanel.js';
import { ProfilePage } from './routes-participant/ProfilePage.js';
import { QrHomePage } from './routes-participant/QrHomePage.js';
import { ScanHistoryPage } from './routes-participant/ScanHistoryPage.js';
import { PassportPage } from './routes-participant/PassportPage.js';
import { SignInPage } from './routes-participant/SignInPage.js';
import { FindNicknamePage } from './routes-participant/FindNicknamePage.js';
import { SignUpPage } from './routes-participant/SignUpPage.js';
import { TeamDetailPage } from './routes-participant/TeamDetailPage.js';
import { TeamsPage } from './routes-participant/TeamsPage.js';
import { CourtPage } from './routes-facilitator/CourtPage.js';
import { DumbCourtPage } from './routes-facilitator/DumbCourtPage.js';
import { FringeStationPage } from './routes-facilitator/FringeStationPage.js';
import { PinResetPage } from './routes-facilitator/PinResetPage.js';
import { StaffHomePage } from './routes-facilitator/StaffHomePage.js';
import { SwagStationPage } from './routes-facilitator/SwagStationPage.js';
import { AnnouncePage } from './routes-superadmin/AnnouncePage.js';
import { ScreenPage } from './routes-screen/ScreenPage.js';
import { StaffSignInPage } from './routes-facilitator/StaffSignInPage.js';
import { SyncQueuePage } from './routes-facilitator/SyncQueuePage.js';
import { ActivitiesPage } from './routes-superadmin/ActivitiesPage.js';
import { AgendaPage as AdminAgendaPage } from './routes-superadmin/AgendaPage.js';
import { SwagStationsPage } from './routes-superadmin/SwagStationsPage.js';
import { AdminSignInPage } from './routes-superadmin/AdminSignInPage.js';
import { AuditPage } from './routes-superadmin/AuditPage.js';
import { FinalStandingsPage } from './routes-superadmin/FinalStandingsPage.js';
import { GalleryModerationPage } from './routes-superadmin/GalleryModerationPage.js';
import { PhotoWallPage } from './routes-superadmin/PhotoWallPage.js';
import { ClustersPage } from './routes-superadmin/ClustersPage.js';
import { DashboardPage } from './routes-superadmin/DashboardPage.js';
import { FacilitatorsPage } from './routes-superadmin/FacilitatorsPage.js';
import { ParticipantDetailPage } from './routes-superadmin/ParticipantDetailPage.js';
import { ParticipantsPage } from './routes-superadmin/ParticipantsPage.js';
import { PointConfigPage } from './routes-superadmin/PointConfigPage.js';
import { AlertsProvider } from './components/participant/AlertsProvider.js';
import { ScansPage } from './routes-superadmin/ScansPage.js';
import { SwagClaimsPage } from './routes-superadmin/SwagClaimsPage.js';
import { SuperadminsPage } from './routes-superadmin/SuperadminsPage.js';
import { SystemPage } from './routes-superadmin/SystemPage.js';
import { TeamsDirectoryPage } from './routes-superadmin/TeamsDirectoryPage.js';
import { TournamentControlPage } from './routes-superadmin/tournament/TournamentControlPage.js';
import { CourtLineupsPage } from './routes-court/CourtLineupsPage.js';
import { TournamentSimulatorPage } from './routes-superadmin/tournament/TournamentSimulatorPage.js';
import { TournamentTimetablePage } from './routes-superadmin/tournament/TournamentTimetablePage.js';

/**
 * Route table for all 60 surfaces. Three areas, three guards: participants at the root,
 * facilitators under /staff, superadmins under /admin (fds.md §5.1–§5.4, §9.3).
 */

/**
 * ADR-125 — the alerts store wraps the whole participant area rather than sitting inside
 * `GameboyShell`.
 *
 * It used to be mounted by the shell, which put every surface that *renders* a shell — the chat
 * room, the photo wall — OUTSIDE its own provider: their `useAlerts()` resolved to the quiet
 * fallback, so a room could not clear its own dot. That was survivable while the server also
 * cleared it on `POST /api/chat/read`; with the read mark on the device there is no second
 * mechanism to hide behind, so the provider moved to where the surfaces actually are.
 */
function Participant(props: { children: React.ReactNode }) {
  return (
    <RequireActor actorType="participant" signInPath="/signin">
      <AlertsProvider>{props.children}</AlertsProvider>
    </RequireActor>
  );
}

function Facilitator(props: { children: React.ReactNode }) {
  return (
    <RequireActor actorType="facilitator" signInPath="/staff/signin">
      <SyncProvider>{props.children}</SyncProvider>
    </RequireActor>
  );
}

function Superadmin(props: { children: React.ReactNode }) {
  return (
    <RequireActor actorType="superadmin" signInPath="/admin/signin">
      {props.children}
    </RequireActor>
  );
}

export function App() {
  // Every surface is addressable; this is what puts the actor back on theirs when the page
  // itself is thrown away and rebuilt at the root (ADR-019).
  useLocationMemory();

  return (
    <>
      {/*
        ADR-182 — renders null everywhere except a station holding a newer build back. It sits
        above the router rather than inside a layout so that it survives navigation: the wait
        it reports does not end just because somebody changed page.
      */}
      <UpdateBanner />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/signin" element={<SignInPage />} />
      {/* ADR-164 — reachable without a session, because the person who needs it has none. */}
      <Route path="/find-nickname" element={<FindNicknamePage />} />

      {/*
        * ADR-140/141 — the hall screen. No `RequireActor`: it is not an actor, it carries a
        * revocable screen key (ADR-140) and the API decides what that key may read. Guarding
        * it here would only mean a projector that cannot start without someone signing in.
        */}
      <Route path="/screen" element={<ScreenPage />} />

      <Route path="/home" element={<Participant><QrHomePage /></Participant>} />
      <Route path="/me" element={<Participant><ProfilePage /></Participant>} />
      <Route path="/me/scans" element={<Participant><ScanHistoryPage /></Participant>} />
      <Route path="/me/scans/passport" element={<Participant><PassportPage /></Participant>} />
      <Route path="/board" element={<Participant><LeaderboardPage /></Participant>} />
      {/* ADR-089 — the ball tab splits in two: results (what happened) and line-ups (who is
          up next). `/feed` alone resolves to results, mirroring the Social tab's pattern. */}
      <Route path="/feed" element={<Navigate to="/feed/results" replace />} />
      <Route path="/feed/results" element={<Participant><MatchFeedPage /></Participant>} />
      <Route path="/feed/lineups" element={<Participant><LineupsPage /></Participant>} />
      {/* ADR-177 — the day's programme, the Ball tab's third segment. */}
      <Route path="/feed/agenda" element={<Participant><AgendaPage /></Participant>} />
      {/* ADR-046 — the Social tab. `/social` alone resolves to the room so the nav entry and a
          typed URL land in the same place; the gallery joins as a second segment in ADR-047. */}
      <Route path="/social" element={<Navigate to="/social/chat" replace />} />
      <Route path="/social/chat" element={<Participant><ChatPanel /></Participant>} />
      <Route path="/social/photos" element={<Participant><PhotosPanel /></Participant>} />
      <Route path="/teams" element={<Participant><TeamsPage /></Participant>} />
      <Route path="/teams/:teamId" element={<Participant><TeamDetailPage /></Participant>} />
      <Route path="/team" element={<Participant><MyTeamPage /></Participant>} />

      <Route path="/staff/signin" element={<StaffSignInPage />} />
      <Route path="/staff" element={<Facilitator><StaffHomePage /></Facilitator>} />
      <Route path="/staff/court/:courtId" element={<Facilitator><CourtPage /></Facilitator>} />
      <Route path="/staff/dumb-court/:courtId" element={<Facilitator><DumbCourtPage /></Facilitator>} />
      {/* ADR-284 — the court console's Line-ups subtab: this court's planned matches. */}
      <Route path="/staff/court/:courtId/lineups" element={<Facilitator><CourtLineupsPage /></Facilitator>} />
      <Route path="/staff/swag/:stationId" element={<Facilitator><SwagStationPage /></Facilitator>} />
      <Route path="/staff/activity/:activityId" element={<Facilitator><FringeStationPage /></Facilitator>} />
      <Route path="/staff/sync" element={<Facilitator><SyncQueuePage /></Facilitator>} />
      <Route path="/staff/pin-reset" element={<Facilitator><PinResetPage /></Facilitator>} />

      <Route path="/admin/signin" element={<AdminSignInPage />} />
      <Route path="/admin" element={<Superadmin><DashboardPage /></Superadmin>} />
      <Route path="/admin/points" element={<Superadmin><PointConfigPage /></Superadmin>} />
      {/* ADR-279 — the tournament's three subtabs. */}
      <Route path="/admin/tournament" element={<Superadmin><TournamentControlPage /></Superadmin>} />
      <Route path="/admin/tournament/timetable" element={<Superadmin><TournamentTimetablePage /></Superadmin>} />
      <Route path="/admin/tournament/simulator" element={<Superadmin><TournamentSimulatorPage /></Superadmin>} />
      <Route path="/admin/system" element={<Superadmin><SystemPage /></Superadmin>} />
      <Route path="/admin/activities" element={<Superadmin><ActivitiesPage /></Superadmin>} />
      <Route path="/admin/agenda" element={<Superadmin><AdminAgendaPage /></Superadmin>} />
      <Route path="/admin/swag" element={<Superadmin><SwagStationsPage /></Superadmin>} />
      <Route path="/admin/clusters" element={<Superadmin><ClustersPage /></Superadmin>} />
      <Route path="/admin/facilitators" element={<Superadmin><FacilitatorsPage /></Superadmin>} />
      <Route path="/admin/scans" element={<Superadmin><ScansPage /></Superadmin>} />
      <Route path="/admin/swag-claims" element={<Superadmin><SwagClaimsPage /></Superadmin>} />
      <Route path="/admin/participants" element={<Superadmin><ParticipantsPage /></Superadmin>} />
      <Route
        path="/admin/participants/:participantId"
        element={<Superadmin><ParticipantDetailPage /></Superadmin>}
      />
      <Route path="/admin/teams" element={<Superadmin><TeamsDirectoryPage /></Superadmin>} />
      <Route path="/admin/audit" element={<Superadmin><AuditPage /></Superadmin>} />
      <Route path="/admin/standings" element={<Superadmin><FinalStandingsPage /></Superadmin>} />
      {/* ADR-074 — announcing to the beach: superadmin only, for the reasons in the ADR. */}
      <Route path="/admin/announce" element={<Superadmin><AnnouncePage /></Superadmin>} />
      <Route path="/admin/photos" element={<Superadmin><GalleryModerationPage /></Superadmin>} />
      {/* ADR-047 — the projected wall: no shell, because it is watched rather than used. */}
      <Route path="/admin/wall" element={<Superadmin><PhotoWallPage /></Superadmin>} />
      <Route path="/admin/superadmins" element={<Superadmin><SuperadminsPage /></Superadmin>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
