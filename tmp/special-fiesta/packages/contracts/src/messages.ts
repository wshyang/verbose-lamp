/**
 * Canonical user-facing copy. Every string here is normative in fds.md §2 (object tables),
 * §6.5 (BDD criteria) or §8.4 (empty states). Both the API and the web app import from here;
 * inlining a message anywhere else is a defect (AGENTS-frontend.md §5).
 */

export const messages = {
  // #obj-participant §2.1
  nicknameInvalid:
    "Nickname must be 3–20 characters, letters/numbers/underscore only, and not already taken.",
  pinInvalid: "PIN must be exactly 4 digits.",
  // ADR-088 — the scan number is a spoken protocol; all-digit nicknames would collide with it
  // in the one channel that cannot disambiguate: a facilitator's ear.
  nicknameAllDigits:
    "Nicknames can't be numbers only — add a letter or an underscore.",
  scanNumberInvalid: "Scan numbers are exactly 4 digits.",
  scanNumberNotFound: "No participant has that number — check the 4 digits.",
  manualEntryOffline:
    "Offline — manual entry needs the connection. Use the camera scan.",
  clusterRequired: "Please select your cluster.",
  // ADR-172 — the cluster catalogue is editable, so these are superadmin-facing.
  clusterCodeInvalid:
    "Cluster code must be 1-30 characters: letters, numbers, spaces, hyphens.",
  clusterNameInvalid: "Cluster name must be 1-30 characters.",
  clusterCodeTaken: "A cluster with that code already exists.",
  clusterNotFound: "That cluster no longer exists.",
  clusterRetired: "That cluster has been retired and cannot be joined.",
  clusterHasMembers:
    "Reassign this cluster\u2019s participants before retiring it.",
  clusterLockedByScoring:
    "Scoring has started, so clusters can no longer be retired or reassigned.",
  clusterSameTarget: "Choose a different cluster to move them to.",
  genderRequired: "Please select gender.",
  avatarRequired: "Please select an avatar.",

  // #obj-team §2.3 / #obj-teammembership §2.4
  teamNameInvalid: "Team name must be 3–30 characters and not already taken.",
  teamLocked: "This team is locked and not accepting new members.",
  participantNotFound: "Participant not found.",
  teamNotFound: "Team not found.",
  captainMustBeMember: "Captain must be a team member.",
  alreadyOnTeam: "You are already on a team.",
  notOnTeam: "You are not on a team.",
  targetAlreadyOnTeam: "That participant is already on a team.",
  notCaptain: "Only the team captain can do that.",
  memberNotOnTeam: "That participant is not on this team.",

  // ADR-154 — staff roster repair. Refusals are stated as the state that blocks them, so the
  // superadmin knows what to do next rather than only that it did not work.
  moveToSameTeam: "That participant is already on that team.",

  // #obj-court §2.5
  // ADR-279 — the rebuilt venue has up to twenty courts, numbered in the table's CHECK.
  courtNumberInvalid: "Court number must be between 1 and 20.",
  courtLabelRequired: "Court label required.",
  courtNotFound: "Court not found.",
  // ADR-177 — the day's programme.
  agendaItemNotFound: "That programme item no longer exists.",
  agendaItemNotTimeless:
    "Only an item with no fixed time can be reordered — change the time instead.",
  agendaTitleInvalid: "Give the item a name, up to 120 characters.",
  agendaEndWithoutStart: "An item with an end time needs a start time too.",
  agendaEndBeforeStart: "The end time has to be after the start time.",

  // #obj-tournamentmatch §2.6
  matchOnDisabledCourt: "Cannot start match on a disabled court.",
  teamCannotPlayItself: "A team cannot play itself.",
  invalidStatusTransition: "Invalid status transition.",
  winnerMustBeParticipatingTeam:
    "Winner must be one of the two participating teams.",
  /*
   * ADR-114 — spoken to a marshal mid-match, so each one says what to DO next, not what
   * the server objected to.
   */
  scoreMovesByOne:
    "Scores move one point at a time. Refresh to see the current score.",
  scoreNeedsLiveMatch: "Only a match in progress can be scored.",
  // ADR-152 (F-1) — draws are legal in a group match and impossible in a knockout, so the
  // one old message split into four, each aimed at the mistake it actually describes.
  knockoutPlaysOn:
    "Knockout matches cannot be drawn. The score is level, so play on \u2014 the next point decides it.",
  knockoutCannotDraw:
    "Knockout matches cannot be drawn. Play on until one team leads.",
  levelScoreIsADraw:
    "The score is level, so this match is a draw. End it as a draw instead.",
  drawNeedsLevelScore: "The score is not level, so this match is not a draw.",
  /**
   * ADR-157 — a draw is paid out of the rates frozen when the match was completed, which is
   * what keeps a correction honest about the day it is correcting. A match played before
   * there was a draw rate has none, and the leaderboard would coalesce the missing one to
   * zero: the correction would appear to work and would silently strip both teams of
   * everything the match was worth.
   */
  drawRateMissingForMatch:
    "This match was played before draws scored, so it cannot be corrected to a draw.",
  winnerMustMatchScore: "The winner must be the team with the higher score.",
  matchEditReasonRequired: "Reason required for match winner edit.",
  matchNotFound: "Match not found.",
  teamAlreadyPlaying: "That team is still playing on another court.",
  swagStationNotFound: "Swag station not found.",
  swagStationNameInvalid:
    "Station names are 3-50 characters and must be unique.",
  swagItemsInvalid: "A swag station carries 1-6 items; limits are 1-10 each.",
  swagItemNotFound: "That item is not on this station.",
  swagStationInactive: "This swag station is inactive.",
  swagLimitReached:
    "They have already claimed their limit of that item this round.",
  // ADR-159 — worded as the fringe pair are (ADR-138): the refusals differ in what to do next.
  swagClaimNotFound: "Swag claim not found.",
  swagUndoExpired:
    "Too late to undo that one — a superadmin can still void it.",
  swagUndoNotYours: "Only the counter that handed this out can undo it.",
  courtBusy: "This court already has a match in progress.",
  /** ADR-336 — the marshal's Start button on a day that has stopped taking matches. */
  tournamentPaused:
    "The day has stopped starting matches. Finish the one on court, or call it off — points are being awarded at the courts now.",
  /** ADR-336 §5 — the typed word is the only guard on the one act that cannot be undone. */
  modeSwitchNeedsWord: "Type “switch” to confirm. This cannot be undone.",
  modeSwitchNoFixtures:
    "There is no fixture day running to switch to court awards.",
  modeSwitchAlreadyAwarding: "The courts are already awarding points.",
  /**
   * ADR-336 §5.5 — the room is told the moment the switch is true. Participant copy never says
   * "dumb": the mode is an internal word, and the sentence the room needs is what to do next.
   */
  modeSwitchedAnnouncement: "Courts are now awarding points. See Results.",
  modeFixturesEndedAnnouncement:
    "The fixture day has ended. Every court is awarding points.",
  modeRequestNotPending: "That request has already been answered.",
  onlyStartingFacilitatorCancels:
    "Only the facilitator who started this match can cancel it.",
  tournamentNotConfigured:
    "Tournament not yet configured — ask superadmin to set point values.",
  needTwoTeams: "At least 2 teams must exist before a match can start.",
  // ADR-279 — the superadmin's tournament console.
  tournamentNameInvalid: "Give the tournament a name, up to 60 characters.",
  tournamentTooManyTeams: "A tournament carries at most 64 teams.",
  tournamentTimingInvalid:
    "Match, changeover and rest minutes must be whole numbers in range.",
  tournamentAlreadyOpen:
    "A tournament is already set up — close it before starting another.",
  tournamentNotDraft:
    "This tournament has already started; its teams and format are fixed.",
  courtNumberTaken: "Another court already has that number.",
  teamNotInTournament: "That team is not in this tournament.",
  // ADR-089 — day-of tournament scheduling.
  tournamentAlreadyActive: "A tournament schedule is already active.",
  tournamentNotActive: "No tournament schedule is active.",
  // ADR-329 F4 — calling this match off would strand the match waiting on its winner/loser.
  // ADR-329 F5 — a tiebreak settles a level knockout; it cannot overrule a score that already speaks.
  tiebreakNotNeeded:
    "The score already settles this match, so no tiebreak is needed.",
  matchHasDependents:
    "Another match is still waiting on this one’s winner or loser. Seat that place first, or hand this match back instead of calling it off.",
  tournamentNeedsTeams: "Not enough teams for this format yet.",
  fixtureNotFound: "Fixture not found.",
  // ADR-149 — admitting a team into a tournament already in play.
  admissionClosed: "Entry closes when the group stage closes.",
  admissionAlreadyEntered: "That team is already in this tournament.",
  admissionNoTimeLeft: "There is no play time left for another match today.",
  admissionTooManyMatches: "More matches than the time left has room for.",
  fixtureNotPending: "This fixture has already been resolved.",
  // ADR-137 — the third-place match feeds nothing, so it is the one bracket fixture a day
  // running late may simply drop. Only true knockout slots still need a winner.
  fixtureSkipGroupOnly:
    "A knockout slot needs a winner for the next round — use walkover, or skip the third-place match instead.",
  groupStageUnresolved:
    "Resolve every group fixture first — play it, walkover it, or skip it.",
  bracketLocked:
    "This result already fed the bracket — correct it on the sand, not in the data.",
  // ADR-247 — the facilitator's levers on a staged day: re-pair the pending fixtures, move an
  // unplayed one between stages, and close a day the weather refuses to let finish.
  stageNotFound: "That stage is not on the tournament being played.",
  legacyDayNoStages:
    "This tournament was planned before stages were rows, so it has no stage to work on.",
  pairRosterLocked:
    "Re-pairing cannot add or remove teams from a stage — the field is what it is, only the pairs change.",
  pairTeamsMustDiffer: "A team cannot play itself.",
  pairInPlay:
    "That fixture is being played right now, so its pair cannot change.",
  pairOutOfPool:
    "A group fixture keeps both teams in the pool it was dealt into.",
  repairBracketSeat:
    "A knockout seat is filled by the round before it, not by this dialog.",
  pairListedTwice: "That fixture is listed twice in this request.",
  pairUnchanged: "These fixtures already pair those teams.",
  forceCloseNeedsReason:
    "Say why the stage is being closed while its fixtures are still unresolved.",
  // ADR-248 — the award batch: one decision posted across both ledgers, reversed as a whole.
  awardBatchEmpty: "Name at least one team or one participant for this batch.",
  awardBatchTooLarge:
    "A batch pays at most 64 teams and 64 participants at a time.",
  awardBatchLabelInvalid: "A batch label needs 1–40 characters.",
  awardBatchReplayMismatch:
    "That batch key already holds a different set of awards.",
  awardBatchNotFound: "No award batch with that id.",
  awardBatchAlreadyReversed:
    "This batch is already reversed, and the ledger shows that reversal.",
  awardBatchNotReversed:
    "This batch is live — reverse it before reinstating it.",
  awardSubjectOutsideTournament:
    "Every team and every participant in a stage’s batch has to be in that stage’s tournament.",
  legacyForceClose:
    "This day was planned before stages were rows, so it has no stage to close on your word — resolve or skip its fixtures instead.",

  // #obj-fringeactivity §2.7 / #obj-fringeround §2.8 / #obj-fringescan §2.9
  activityNameInvalid: "Activity name must be 3–50 characters and unique.",
  tierLabelInvalid: "Tier labels need 1–20 characters.",
  tierPointsInvalid: "Tier points must be at least 1.",
  tierListInvalid: "Define one to four tiers, each with a different label.",
  tierNotFound: "That award tier is not on this activity.",
  tierLabelReserved: '"Took part" is reserved for the participation award.',
  activityInactive: "This activity is not currently accepting scans.",
  facilitatorNotFound: "Facilitator not found.",
  activityNotFound: "Activity not found.",
  roundNotFound: "Round not found.",
  singleActiveRound: "Only one active round per activity.",
  alreadyScannedThisRound: "Already scanned this round",
  // ADR-116 — a different award already holds this participant's slot in this round. Offering
  // the replacement is the point: the old behaviour accepted the scan and threw it away.
  scanSlotHeld: "Already scored this round — replace that award?",
  screenKeyLabelRequired: "Give the screen a name — 'Main hall', 'Foyer'.",
  /**
   * ADR-160 — a key showing nothing is indistinguishable from a projector that has died, and
   * the room cannot tell the difference. Turning a screen off is what revoke is for.
   */
  screenKeyNeedsAScene:
    "A screen link must show at least one scene. Revoke it instead to turn the screen off.",
  screenKeySceneUnknown: "That is not a scene this screen can show.",
  scanUndone: "Undone — those points are off the board.",
  // ADR-138 — the two ways an undo is refused. Both name the remedy, because the facilitator
  // is standing in front of the person whose points are wrong and needs to know what to do next.
  scanUndoExpired:
    "Too late to undo that one — a superadmin can still void it.",
  scanUndoNotYours: "Only the station that awarded this can undo it.",
  nicknameNotFound: "Nickname not found — is this participant signed up?",
  noOpenRound: "No open round — open Round 1 before scanning.",

  // #obj-facilitatoraccount §2.10 / #obj-superadminaccount §2.11
  credentialsRejected: "Username not found or passcode incorrect.",
  passcodeInvalid: "Passcode must be 4 digits.",
  usernameInvalid:
    "Username must be 4–20 characters, letters and numbers only.",
  usernameTaken: "That username is already taken.",

  // #obj-pointconfig §2.12
  pacingInvalid: "Match length must be 5-60 minutes; the gap 0-30.",
  winPointsInvalid: "Win points must be zero or greater.",
  lossPointsInvalid: "Loss points must be zero or greater.",
  drawPointsInvalid: "Draw points must be zero or greater.",
  participationPointsInvalid: "Participation points must be between 1 and 100.",
  championPointsInvalid: "Champion bonus must be between 0 and 500.",
  /** ADR-176 — the passport bonus and the number of distinct stations that earns it. */
  passportBonusInvalid: "Passport bonus must be between 0 and 500.",
  passportStationsInvalid: "A passport must need between 2 and 20 stations.",

  // #obj-scoreadjustment ADR-117
  // ADR-118 — said to a participant whose tab still exists. It names the two things they
  // might be worried about: their phone, and whether their points are still being counted.
  socialPaused:
    "Chat and photos are temporarily unavailable. Scoring and scanning carry on as normal.",
  socialPausedConfirmation: "Chat and photos are paused for everyone.",
  restartUnavailable: "This deployment cannot restart itself from here.",
  restartScheduled:
    "Restarting now. This page will come back on its own in a few seconds.",
  // ADR-307 — the system reset's refusals. Each names the remedy, because the operator is
  // standing at the one console that can still fix things.
  resetPasscodeRejected:
    "That is not your superadmin passcode. Nothing was reset.",
  resetConfirmationMismatch:
    "Type the confirmation exactly as shown, DELETE included. Nothing was reset.",
  resetChallengeExpired:
    "That confirmation code has expired. Ask for a new one. Nothing was reset.",
  resetDone:
    "Reset complete. Participants, teams, socials, tournaments and matches are gone; your setup is untouched.",
  adjustmentPointsInvalid:
    "An adjustment must be a whole number between -100 and 100, not zero.",
  adjustmentReasonRequired: "Say why this adjustment was made.",

  // #obj-voidauditentry §2.13
  voidReasonRequired: "Reason is required for void/unvoid actions.",

  // Sessions / access
  signInRequired: "Please sign in to continue.",
  signInRejected: "Nickname or PIN doesn't match.",
  forbidden: "You do not have access to this.",
  notFound: "Not found.",
  connectionError:
    "Can't reach Active Day right now. Check your connection and try again.",
  sessionNotStored:
    "Signed in, but the session did not stick. Please try once more.",
  avatarLookInvalid:
    "That avatar is not one we can draw. Pick the options again.",
  avatarPhotoInvalid:
    "That photo could not be turned into a sprite. Try another one.",
  avatarSaved: "Looking good! Your avatar is saved.",

  // Chat room (ADR-046) — promoted from fds.md §9.5 deferred scope.
  chatMessageEmpty: "Type something first.",
  chatMessageTooLong: "Keep it under 500 characters.",
  chatTooFast: "Slow down a moment, then send again.",
  chatCursorInvalid: "That is not a place we can resume from.",
  /** ADR-063 — the team room is only for its members, and membership can change mid-session. */
  teamChatNotAMember: "Join a team to use the team chat.",
  /** ADR-155 — the captain moderates their own room; nobody else can, including a superadmin. */
  teamChatHideNotCaptain: "Only the captain can hide a message in this room.",
  /**
   * ADR-155 — a roster line is the team's record of what happened to it, and ADR-154 made it
   * the ONLY record of a staff repair. A captain may hide what was said, not what was done.
   */
  teamChatHideNotSaid: "That is part of the team history and cannot be hidden.",
  teamChatMessageNotFound: "That message is not in this room.",

  // Photo gallery (ADR-047) — promoted from fds.md §9.5 deferred scope.
  galleryCaptionTooLong: "Keep the caption under 140 characters.",
  galleryPhotoMissing: "Pick a photo first.",
  galleryPhotoTooLarge:
    "That photo is too large even after shrinking. Try another one.",
  /** ADR-325 — a fed stage whose feeder has not closed: nobody has come through yet. */
  stageNotFed:
    "The stage before this one has not finished, so no team has come through yet.",
  stageStarted:
    "That stage has already started, so it cannot be rebuilt. Only a stage with no match played or under way can change shape.",
  stageFed:
    "That stage has already been given its teams, so it cannot be rebuilt. Rebuild it before the stage before it closes.",
  /** ADR-325 — a team outside the roster of the stage feeding this one. */
  teamNotInStage: "That team did not come through to this stage.",
  /** ADR-324 — a JSON request past the API's ceiling; nothing a person typed gets near it. */
  requestTooLarge: "That request is too large to accept.",
  /** ADR-324 — too many wrong guesses at one account; it clears by itself, so the copy says to wait. */
  signInThrottled: "Too many attempts. Wait a minute, then try again.",
  /** ADR-324 — the gallery has reached its storage ceiling; uploads stop until a superadmin makes room. */
  galleryFull: "The gallery is full right now. Please tell a staff member.",
  /** ADR-324 — another photo is being saved; the client retries, so the copy is brief. */
  /** ADR-324 — too many live connections; the client's reconnect backoff (ADR-122) is the retry. */
  streamsBusy: "The live feed is busy. It will reconnect on its own.",
  galleryBusy: "Still saving another photo. Try again in a moment.",
  galleryPhotoNotAnImage: "That file is not a photo we can show.",
  galleryQuotaReached: "You have shared all 10 of your photos.",
  galleryPhotoGone: "That photo is no longer here.",
  galleryAlreadyReported: "Thanks — you have already reported this photo.",

  // Archival originals and duplicate detection (ADR-050).
  galleryFilenameMissing:
    "We could not read that photo’s file name. Try another one.",
  galleryRawTooLarge:
    "That photo is too large to archive. Try one under 12 MB.",
  galleryDuplicate: "That photo has already been shared.",
} as const;

/** fds.md §8.4 — empty-state variants, keyed by surface. */
/**
 * ADR-141 — the hall screen's own words.
 *
 * Short, upper-case and few: this is read at ten metres by people who are mid-conversation,
 * and anything longer than a few words is scenery rather than information.
 */
export const screenCopy = {
  board: "CLUSTER BOARD",
  individuals: "TOP PLAYERS",
  onCourt: "ON COURT NOW",
  finished: "JUST FINISHED",
  upNext: "UP NEXT",
  photosLatest: "JUST SHARED",
  photosTop: "CROWD FAVOURITES",
  /*
   * ADR-150 — the two scenes that answer "how does this work". Titled as questions a room
   * asks rather than as features: "THE GROUPS" is what people call the thing they are
   * looking for on the wall, and "THE ROAD TO THE FINAL" says what the graph is FOR before
   * anybody has worked out how to read it.
   */
  groups: "THE GROUPS",
  road: "THE ROAD TO THE FINAL",
  /** Sub-line under the group scene before anything is drawn, e.g. "14 TEAMS ENROLLED". */
  enrolled: "TEAMS ENROLLED",
  /** Marks the advancing places in a group table. */
  advances: "ADVANCES",
  /** Shown instead of everything else when the projector has no key yet (ADR-140). */
  noKey: "This screen needs a key. Ask an organiser for the screen link.",
  /** The first seconds after a reload, before any read has come back. */
  waking: "Waking up…",
  /**
   * ADR-144 — shown only when the reads have been failing for long enough that the numbers
   * on the wall can no longer be trusted. Says what is wrong in the room's language: not
   * "network error", which is a thing nobody in the hall can act on, but the plain fact that
   * what they are looking at has stopped moving.
   */
  stale: "SCORES NOT UPDATING",
  /** Prefixes the leaderboard's own generation time on the board scene. */
  asOf: "AS OF",
} as const;

export const emptyStates = {
  clusterLeaderboard:
    "Active Day just started. Points will appear here as they're earned.",
  myScanHistory: "No scans yet. Visit fringe stations to earn points!",
  /** ADR-239 — the passport tab, before the day has any station to stamp. */
  passportStations: "No fringe stations yet.",
  /** ADR-239 — the slot on the passport for a station not yet completed. */
  passportNotYet: "Not yet",
  browseTeams: "No teams yet. Be the first — create a team!",
  teamMatchHistory: "Your team hasn't played yet.",
  facilitatorTeamPicker:
    "At least 2 teams must exist before a match can start.",
  currentRoundScanLog: "No scans yet this round. Ready when you are.",
  /** ADR-321 — dumb mode has no fixtures, so Line-ups says so instead of listing matches. */
  lineupsDumb:
    "No match line-ups today — the courts are awarding points as games are played. See Results for the awards!",
  resultsDumbEmpty:
    "No awards yet. Points appear here as the courts hand them out.",
  dumbCourtIdle: "Dumb courts are not running right now.",
  activityList: "No fringe activities yet. Create one to get started.",
  courtList:
    "No courts yet. Add at least one before facilitators can start matches.",
  clusterList: "No clusters yet. Add at least one before anyone can sign up.",
  /** ADR-145 — the superadmin's hall-screen panel, before any projector has been issued one. */
  screenKeys:
    "No screens yet. Create one, then open its link on the machine driving the projector.",
  facilitatorList: "No facilitator accounts yet.",
  allMatches: "No matches yet.",
  allScans: "No scans yet.",
  allSwagClaims: "Nothing has been handed out yet.",
  allParticipants: "No participants signed up yet.",
  /** ADR-164 — the forgotten-nickname lookup, after a cluster with nobody in it yet. */
  clusterNicknames: "Nobody from this cluster has signed up yet.",
  /** ADR-164 — and after a typed filter that matches none of them. */
  clusterNicknamesFiltered: "No nickname here looks like that. Try less of it.",
  allTeams: "No teams yet.",
  matchFeed: "No matches completed yet. Check back after games start!",
  // ADR-089 — the Line-ups tab before the superadmin activates a schedule.
  lineups:
    "No schedule yet — matches are ad-hoc today. Results still show up next door!",
  lineupsDone: "All scheduled matches are played. What a day!",
  // ADR-177 — the Agenda segment before a superadmin has entered the run sheet.
  agenda: "The programme is not published yet. Check back shortly!",
  syncQueue: "Nothing waiting to sync.",
  voidAuditLog: "No corrections recorded yet.",
  chatRoom: "Nothing said yet. Say hello!",
  /** ADR-063 — a team room always has at least the joining lines, so this is a near-impossible state. */
  teamChat: "Nothing said yet. Your team history will build up here.",
  photoGallery: "No photos yet. Be the first to share one!",
  photoWall: "Photos will appear here as people share them.",
} as const;
