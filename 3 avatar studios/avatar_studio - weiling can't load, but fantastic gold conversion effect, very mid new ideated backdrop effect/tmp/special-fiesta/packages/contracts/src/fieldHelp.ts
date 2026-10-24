/**
 * ADR-319 — what each editable field on the superadmin tournament surfaces does, in the words the
 * (i) beside it shows. One sentence or two per field, written from what the consuming hook and the
 * request schemas in `tournament.ts` actually enforce (ranges, blank-means-default, who ignores
 * what), not from the label. Both the web app and its tests import this; a screen that needs a
 * sentence adds a topic here rather than typing it inline (AGENTS-frontend.md §5).
 */
export const fieldHelp = {
  // ── Setup: the draft ───────────────────────────────────────────────────────────────────────
  setupName:
    "What this tournament is called on the console and in the audit trail. 1 to 60 characters.",
  setupWinPoints:
    "Points a team earns for winning a match, added to its tournament total. A whole number from 0 to 100. A stage can override it.",
  setupDrawPoints:
    "Points each team earns when a match is drawn. A whole number from 0 to 100. A stage can override it.",
  setupLossPoints:
    "Points a team earns for losing a match. A whole number from 0 to 100; 0 means a loss scores nothing. A stage can override it.",
  setupTeams:
    "The teams entered in this tournament. The order you tick them is their seed order, which sets who is paired with whom first. At least 2 and at most 64, and they are fixed once the draft is made.",

  // ── Setup: Start ───────────────────────────────────────────────────────────────────────────
  setupBuild:
    "One format plays the whole tournament by a single set of rules. Stage by stage lets you chain several stages, each with its own format and match length (for example groups, then a knockout).",
  setupFormat:
    "How the teams play each other. Each choice shows how many teams it can take; Start is refused if the entered teams are outside that range.",
  setupGroupSize:
    "Teams in each group before the knockout, from 2 to 8. The teams are dealt into groups of this size in seed order.",
  setupAdvance:
    "How many teams from each group go through to the knockout, from 1 to 4.",
  setupRounds:
    "How many Swiss rounds to play, from 1 to one fewer than the number of teams. Leave blank to play enough rounds to find a winner.",
  setupThirdPlace:
    "Also play a match between the two teams knocked out in the semi-finals, to decide third place. Off means no third-place match is made.",
  setupMatchMinutes:
    "How long each match is planned to take, from 1 to 180 minutes. A stage you leave blank uses this length.",
  setupChangeover:
    "Minutes a court is kept clear after a match before the next one starts on it, from 0 to 60.",
  setupRest:
    "The least gap between one team’s matches, from 0 to 120 minutes; the planner will not schedule a team sooner. Ironman ignores this: it uses no rest and flags back-to-back matches instead.",
  setupDeadline:
    "The time the day should be over by. The plan says whether it fits and by how many minutes it would run over, but it never blocks a match. Leave blank for no hard stop.",

  // ── The stage builder ──────────────────────────────────────────────────────────────────────
  stageCode:
    "A short name other stages use to refer to this one, 1 to 12 letters, numbers, dashes or underscores. Each stage’s code must be different.",
  stageName:
    "The stage’s name as shown on the console and the timetable. 1 to 40 characters.",
  stageFormat:
    "Pool deals the teams into groups. Knockout bracket is single elimination. Open play builds no fixtures and is run by hand at the desk.",
  stageMinutes:
    "How long each match in this stage is planned to take, from 1 to 180 minutes. Leave blank to use the tournament’s match length.",
  stageGroupSize:
    "Teams per group in this pool. Leave blank for 4. Ignored if you set the number of groups.",
  stageGroupCount:
    "How many groups to deal, from 1 to 16. Leave blank to work it out from the group size (the number of teams divided by the group size, and at least 2). Setting it overrides the group size.",
  stageAdvance:
    "Teams from each group that qualify for a later stage, ranked on the group table. Leave blank for 1. At least one team must go through from each group, and it must be smaller than the smallest group.",
  stageSource:
    "Where this stage’s teams come from: the entered teams in seed order, or the best finishers of an earlier stage. The first stage can only take the entered teams, since there is no earlier stage to take from.",
  stageFrom:
    "The earlier stage whose finishers play in this stage. Only stages above this one in the list can be chosen. A pool deals them into its groups by place once that stage closes; open play lets only those teams be put on court.",
  stageCount:
    "How many finishers of the earlier stage this stage takes, from 2 to 32. From a pool stage it cannot be lower than that stage’s qualifiers — the number of groups times the teams going through from each group — because every qualifier goes through first. If this number is higher, the best non-qualifiers on the earlier stage’s internal table fill only the remaining seats, so nobody overlaps. It cannot exceed the teams the earlier stage has.",
  stageThirdPlace:
    "Also play a match between the two teams knocked out in this knockout’s semi-finals, to decide third place.",
  stageTableWin:
    "Internal table points for a win in this stage: what a win is worth when this stage’s table is ranked and its advancers are picked. Ranking only — nobody is paid these. Fill the win, draw and loss boxes together; leave all three blank to rank on the default 3 for a win, 1 for a draw, 0 for a loss.",
  stageTableDraw:
    "Internal table points for a draw in this stage, for ranking only. Fill the win, draw and loss boxes together, or leave all three blank for the default 3/1/0.",
  stageTableLoss:
    "Internal table points for a loss in this stage, for ranking only. Fill the win, draw and loss boxes together, or leave all three blank for the default 3/1/0.",
  stageWin:
    "Points for a win in this stage, from 0 to 100 — these ARE paid, onto the cluster board. Fill the win, draw and loss boxes together; leave all three blank to use the tournament’s rates.",
  stageDraw:
    "Points for a draw in this stage, from 0 to 100. Fill the win, draw and loss boxes together, or leave all three blank.",
  stageLoss:
    "Points for a loss in this stage, from 0 to 100. Fill the win, draw and loss boxes together, or leave all three blank.",

  // ── The live day ───────────────────────────────────────────────────────────────────────────
  restageStructure:
    "The new shape for this stage: teams per group, how many go through from each group, and whether the stage plays a third-place match. The fixtures are rebuilt from the plan the tournament started with.",
  restageIntake:
    "How many teams the stage before sends into this one. Leave it as it is unless the day has changed who can come through.",
  restageMinutes:
    "The match length for this stage’s rebuilt fixtures, in minutes. Matches already played keep the length they had.",
  restageTablePoints:
    "The win / draw / loss points this stage’s table ranks by, as three numbers like 3 1 0. It only orders the table; it is never paid to teams.",
  contingencyCourts:
    "Tick the courts that are in play. Apply switches the courts to match your ticks and re-plans every unplayed match around them, in one step. Preview shows what would move first.",
  contingencyMinutes:
    "A new match length for the rest of the day, in minutes. It changes only matches planned from now on, and only in stages that were using the tournament’s length.",
  contingencyChangeover:
    "A new changeover for the rest of the day, in minutes from 0 to 60: the gap kept clear on a court after each match.",
  contingencyStageMinutes:
    "This stage’s match length from now on, in minutes. Only its matches that have not started change; a match already on a court keeps the length it started with.",
  contingencyRest:
    "The rest a team gets between its matches, in minutes. The planner keeps at least this gap for every team when it lays the rest of the day out.",
  contingencyDeadline:
    "The hard stop the plan must fit inside. Keep it, set a new one as an ISO time, or clear the box to plan with no hard stop; Preview shows whether the day fits.",
  placementCourt:
    "The court to put this match on. Courts that are switched off are marked (off). While the scheduler is running, the match becomes pinned here and the planner plans everything else around it.",
  placementStart:
    "The time today this match should start. While the scheduler is running, the match is pinned to this time until you release it.",

  // ── The desk's acts ────────────────────────────────────────────────────────────────────────
  actScoreA:
    "The corrected score for side A, from 0 to 199. Saving re-works the standings and pays the points again to the same people.",
  actScoreB:
    "The corrected score for side B, from 0 to 199. Saving re-works the standings and pays the points again to the same people.",
  actPoints:
    "Points to add to this team’s total, from 1 to 100, or to take away, from -100 to -1. Zero is not allowed.",
  actReason:
    "Why you are doing this, up to 200 characters. It is kept with the change in the audit trail. Corrections, walkovers, voids, cancellations, withdrawals, awards and stopping the scheduler need one; closing a stage as its table stands, or a day that ended on time, needs none.",
  actStageOverride:
    "Who takes this place instead of the team the table picked — for a qualifier who is absent or hurt, or to settle a tie on the cut. Leave it on the table’s choice to send that team through. Naming anybody here needs a reason below.",
  actTiebreakMethod:
    "How a level knockout was settled off the scoreboard: a coin toss, or scissors-paper-stone. The score stays as played; the method and the winner are recorded with the result.",
  actTiebreakWinner:
    "The team that won the tiebreak, when the corrected score is level in a knockout. Leave it unpicked when the score itself names the winner, or the match was drawn where draws are allowed.",
  courtTiebreakMethod:
    "Level, and a knockout cannot be drawn. Play on for the next point, or settle it now: a coin toss, or scissors-paper-stone. The score stays as played and the winner you tap goes through.",
  switchReason:
    "Why the day is changing, up to 200 characters. It is the sentence the room is given, the reason on the fixture day’s own close, and the line the audit trail keeps.",
  switchWord:
    "Type the word “switch” to confirm. Trimmed and case-insensitive on purpose: this is a guard against a slip during a shout, not a spelling test — but it cannot be skipped, because this is the one act in the app that cannot be undone.",
  switchTierLabel:
    "What the button at the court says, up to 20 characters. A derived button is named after the points it pays.",
  switchTierPoints:
    "The cluster points one press pays, from 1 to 100. It is the value a result at this day’s rates would have paid, not a ranking point.",
  actReseatSide:
    "Which seat of this match changes: side A or side B, as the match is listed.",
  actReseatTeam:
    "The team that takes the seat instead. The team already seated stays in the audit trail, and the reason below is kept with the change.",

  // ── Courts ─────────────────────────────────────────────────────────────────────────────────
  courtNumber:
    "The court’s number, from 1 to 20. No two courts can share a number.",
  courtLabel:
    "The name shown for the court on the timetable and in match lists, up to 30 characters.",

  // ── The Simulator ──────────────────────────────────────────────────────────────────────────
  simulatorBuild:
    "One format rehearses a single set of rules for the whole day. Stage by stage rehearses a chain of stages, each with its own format and match length.",
  simulatorFormat:
    "The format to rehearse. If the number of teams below is outside what the format can take, the rehearsal says so instead of showing a day.",
  simulatorGroupSize:
    "Teams per group, from 2 to 8. Only the groups-then-knockout format uses it; other formats ignore it.",
  simulatorAdvance:
    "Teams from each group that go through, from 1 to 4. Only the groups-then-knockout format uses it; other formats ignore it.",
  simulatorRounds:
    "Swiss rounds to play. Only the Swiss format uses it; leave blank to play enough rounds to find a winner.",
  simulatorTeams:
    "How many teams to rehearse with. It starts at the number of teams registered, and you can change it to try a bigger or smaller day.",
  simulatorCourts:
    "How many courts to rehearse with. It starts at the number of courts switched on, and you can change it to see what an extra court would save.",
  simulatorMatchMinutes:
    "How long each match is planned to take, in minutes. The same setting as Match minutes when you start a tournament.",
  simulatorChangeover:
    "Minutes a court is kept clear after each match. The same setting as Changeover minutes when you start a tournament.",
  simulatorRest:
    "The least gap between one team’s matches, in minutes. Ironman ignores it. The same setting as Rest minutes when you start a tournament.",
  simulatorFirstMatch: "The time of day the first match is planned to start.",
  simulatorDeadline:
    "The time the day should be over by. The rehearsal says whether the plan fits and how far it runs past if not. Leave blank for none.",
  tournamentKind:
    "Captain’s ball builds fixtures and plays matches. Dumb courts skip fixtures entirely: court masters award points straight to teams, and Results shows the awards.",
  dumbTiers:
    "The point buttons court masters see, biggest last is fine — order is display order. Each award snapshots the label and points, so editing tiers later never rewrites history.",
  dumbStart:
    "Starting puts the courts into award mode. There are no fixtures, no line-ups and nothing to schedule: court masters pick a tier, pick a team, and the points land.",
  simulatorThirdPlace:
    "Also rehearse a third-place match. Only the groups-then-knockout, single elimination and points rush formats have one.",

  // ── Sign-in (facilitator and superadmin) ───────────────────────────────────────────────
  signInUsername:
    "The username on the staff account you were given. Type it as issued — it names you in everything you record today.",
  signInPasscode:
    "The 4-digit passcode for this staff account. After too many wrong tries the account pauses, so check the digits before repeating.",

  // ── Facilitator: stations and courts ───────────────────────────────────────────────────
  stationPicker:
    "Every station you can run today. Courts start matches (or award points on a dumb-court day), fringe activities take scans, and swag counters hand out items.",
  courtStartTeam:
    "The team to seat on this side of the match. Only teams entered in the tournament, and not already playing, can be picked.",
  courtScore:
    "The score as the room calls it: one tap per goal. A wrong tap is corrected the same way, one step back, before the winner is declared.",
  courtWinner:
    "Declaring the winner ends the match and pays the points. Check the score first — a declared result is the desk’s to undo, not the court’s.",
  courtLineupStart:
    "Matches lined up for this court, in play order. Starting one seats both teams and freezes who is on them for the points.",
  fringeScanNumber:
    "The participant’s 4-digit number, from their badge when the QR will not scan. The nickname search finds it from a name instead.",
  fringeTierArm:
    "The armed tier is what the next scan earns. Arm once and scan the queue; change the tier when the activity’s outcome changes, not per person.",
  fringeRounds:
    "A round is one running of this activity. Open a round to take scans in it; end it when the activity stops, and the next running is a new round.",
  swagScanNumber:
    "The participant’s 4-digit number, from their badge when the QR will not scan, so the handout is recorded against the right person.",
  swagItemArm:
    "The armed item is what the next handout takes from stock. Arm the item you are handing out; each station’s limits are counted per round.",
  swagRounds:
    "A round is one running of this counter. Open a round to hand out in it; end it when the counter closes, and the next running counts limits afresh.",
  pinResetFind:
    "Start typing the participant’s nickname; two letters are enough to search. Pick the person from the matches — the reset applies to exactly that account.",
  pinResetNew:
    "The new 4-digit PIN for this participant. Tell it to them in person; it replaces the old one everywhere as soon as you save.",
  syncQueueActions:
    "Scans taken offline wait here. Sync now sends them when there is a connection; a rejected scan stays visible with its reason until you discard it.",
  dumbCourtTier:
    "The armed tier is what the next award pays. Arm once and tap each team that earned it; the label and points are written onto the award as they stand.",
  dumbCourtTeam:
    "Tap the team to award the armed tier to. Every member of the team as it stands now is paid, and Results shows the award the moment it lands.",

  // ── Superadmin: stations, people and the day ───────────────────────────────────────────
  activityName:
    "What facilitators and participants call this activity, 1 to 50 characters. It is the name on the station picker and the passport.",
  activityTiers:
    "What a scan at this activity earns: a label and its points, 1 to 4 tiers. The first is the default a facilitator’s screen arms; labels cannot repeat or reuse the participation label.",
  clusterCode:
    "The short code participants pick at sign-up and letters are read by. It cannot be changed once people are in the cluster — rename the name instead.",
  clusterName:
    "The cluster’s display name, shown on the leaderboard and at sign-up. Renaming moves nobody; it only changes the words.",
  clusterMove:
    "Move everyone in this cluster to another one. Their points move with them, and the cluster they leave keeps its history in the audit trail.",
  facilitatorUsername:
    "The username this facilitator signs in with. It must be free — no other staff account, facilitator or superadmin, can share it.",
  facilitatorPasscode:
    "The 4-digit passcode this facilitator signs in with. Share it in person, never in a group chat.",
  facilitatorLabel:
    "The name the room knows this facilitator by, shown wherever their work is recorded — scans, awards and the audit trail.",
  facilitatorStationType:
    "What kind of station this facilitator usually runs. It only sets where their home screen points first; it locks nothing.",
  facilitatorStationId:
    "The specific station this facilitator usually runs, offered as their home when they sign in.",
  superadminUsername:
    "The username this superadmin signs in with. It must be free across every staff account.",
  superadminPasscode:
    "The 4-digit passcode for this superadmin account. A superadmin can open every console, so share it in person only.",
  rotatePasscode:
    "A new 4-digit passcode for your own account. The old one stops working as soon as this saves; you stay signed in here.",
  participationPoints:
    "Points a participant earns for each fringe scan, before any tier is chosen — the floor every activity pays. Changes apply to scans from now on, never backwards.",
  passportBonus:
    "Extra points for completing the passport: visiting every fringe station at least once. Paid once, when the last station is stamped.",
  passportStationCount:
    "How many different fringe stations a participant must visit to complete the passport. Counted from stations that exist on the day.",
  agendaTitle:
    "What this item is called on the day’s run sheet, as participants read it.",
  agendaStarts:
    "When this item starts; leave blank for an item with no fixed time. The run sheet orders the day by this time.",
  agendaEnds:
    "When this item ends; leave blank for a moment rather than a block. Keep the times honest — participants plan around the run sheet.",
  agendaLocation:
    "Where this item happens, in the words a participant would ask for at the door.",
  agendaDetail:
    "Anything else a participant needs about this item, shown under its title on the run sheet.",
  announceBody:
    "The announcement every participant sees. It is pushed as written, to everyone, at once — read it aloud before sending.",
  adjustActivity:
    "The activity this correction belongs to, so the participant’s history reads true. The points land on the person, not the activity.",
  adjustPoints:
    "Points to add to this participant, or to take away with a minus. The correction is recorded with your reason and never edits a scan.",
  adjustReason:
    "Why this correction is being made, kept with it in the audit trail. Required — a correction without a reason is not saved.",
  participantSearch:
    "Find a participant by nickname. The directory below is everyone; searching narrows it to who you mean.",
  participantClusterFilter:
    "Show only one cluster’s participants — the help-desk shortcut for someone who remembers their cluster but not their nickname.",
  participantClusterMove:
    "Move this participant to another cluster. Their points move with them and count for the new cluster from now on.",
  teamMemberMove:
    "Move this person to another team, or add someone to this one. Points already earned stay earned; new team points pay who is on the team when they land.",
  screenScene:
    "What this screen shows: the bracket and standings, or the photo wall. The screen itself updates when you save.",
  screenKeyLabel:
    "A name for this screen so you can tell the projectors apart — usually the room or the wall it drives.",
  resetPasscode:
    "Your own superadmin passcode, proving it is you asking for the reset. The reset cannot be done with anyone else’s.",
  resetConfirmation:
    "Type the confirmation words exactly. A reset wipes the day’s data back to a clean event, and there is no undo.",
  scanActivityFilter:
    "Show scans from one activity, or all of them. The list is the audit trail for points already paid.",
  claimStationFilter:
    "Show handouts from one swag station, or all of them. The list is the audit trail for stock already gone.",
  swagStationName:
    "What this counter is called on the facilitator’s station picker and in the claims list.",
  swagItems:
    "What this counter hands out: an item label and how many each participant may take per round. Limits are counted as claims land, not at the end.",
  stationOfflineToggle:
    "Take the offline-capable station screens out of service, or bring them back. Phones already open keep what they have until they reload.",
} as const;

export type FieldHelpTopic = keyof typeof fieldHelp;
