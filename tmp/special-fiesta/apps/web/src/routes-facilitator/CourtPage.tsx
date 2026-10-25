import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emptyStates } from '@psd/contracts';
import type { TiebreakMethod } from '@psd/contracts';
import { ConsoleField } from '../components/console/ConsoleField.js';
import { FieldHelp } from '../components/console/FieldHelp.js';
import { useFieldHelp } from '../lib/hooks/useFieldHelp.js';
import type { MatchView, TeamSummaryView } from '@psd/contracts';
import { useRouteId } from '../lib/hooks/useRouteId.js';
import { MatchScoreboard } from './MatchScoreboard.js';
import { StaffShell } from './StaffShell.js';
import { ConfirmDialog } from '../components/shared/ConfirmDialog.js';
import { LoadingPanel } from '../components/console/LoadingPanel.js';
import { formatTime } from '../lib/format.js';
import { useConfirm } from '../lib/hooks/useConfirm.js';
import { useCourtConsole } from '../lib/hooks/useCourtConsole.js';
import { useModeAsk } from '../lib/hooks/useModeAsk.js';
import { ModeAskPanel } from '../components/console/ModeAskPanel.js';

/**
 * S21–S24 — the court console (F22–F24). One primary action at a time: start a match,
 * score it, or end it. ADR-114 — during a live match the two teams sit one on each side,
 * the way the marshal is facing them, and the score decides the winner.
 */
export function CourtPage() {
  const courtId = useRouteId('courtId');
  const winnerHelp = useFieldHelp();
  const console_ = useCourtConsole(courtId);
  const modeAsk = useModeAsk(courtId);
  const navigate = useNavigate();
  // ADR-336 §6.1 — the drain is per court: the moment this court has nothing on it and the room is
  // awarding, its next visit is the award page. A court still finishing keeps its match page until
  // its own match is closed, because the switch never takes a match away from the people playing it.
  useEffect(() => {
    if (modeAsk.isAwarding && !console_.isLoading && console_.match === null) {
      navigate(`/staff/dumb-court/${courtId}`, { replace: true });
    }
  }, [console_.isLoading, console_.match, courtId, modeAsk.isAwarding, navigate]);
  const confirm = useConfirm();
  const court = console_.court;
  const match = console_.match;
  const title = court ? court.displayLabel : 'Court';

  return (
    <StaffShell title={title}>
      <ConfirmDialog confirm={confirm} isBusy={console_.isBusy} />
      {console_.error ? (
        <p className="console-danger" role="alert" data-testid="court__error">
          {console_.error}
        </p>
      ) : null}

      {console_.isLoading ? <LoadingPanel title="Court" testId="court__loading" /> : null}

      {console_.isLoading ? null : match ? (
        <section className="console-panel">
          <h2>Match in progress</h2>
          <p className="console-status console-status--warn" data-testid="court__match-status">
            {match.teamAName} vs {match.teamBName} · started {formatTime(match.startedAt)}
          </p>
          {/*
            * ADR-152 (F-1) — a knockout match cannot be drawn, and the marshal has to know
            * that BEFORE the score goes level, not at the moment a button fails to appear.
            */}
          {match.stage === 'knockout' || match.stage === 'third_place' ? (
            <p className="console-status console-status--warn" data-testid="court__stage">
              {match.stage === 'knockout' ? 'Knockout match' : 'Third-place play-off'} · this one
              cannot be drawn
            </p>
          ) : null}
          <MatchScoreboard
            match={match}
            scoreA={console_.scoreA}
            scoreB={console_.scoreB}
            leadingTeamId={console_.leadingTeamId}
            onPick={console_.bumpScore}
          />
          <div style={{ height: 16 }} />
          <p className="console-row">
            Ending the match <FieldHelp label="Ending the match" topic="courtWinner" help={winnerHelp} />
          </p>
          <MatchEnding match={match} console_={console_} confirm={confirm} />
          <div style={{ height: 24 }} />
          <button
            type="button"
            className="console-button console-button--danger"
            data-testid="court__cancel"
            disabled={console_.isBusy}
            onClick={() => confirm.ask({
              title: 'Cancel this match?',
              body: `${match.teamAName} vs ${match.teamBName} ends with no points for either team, and the court is free again.`,
              confirmLabel: 'Cancel the match',
              isDanger: true,
              run: console_.cancelMatchNow,
            })}
          >
            Cancel match (no points)
          </button>
        </section>
      ) : (
        <>
          <StartMatchPanel console_={console_} />
          <ModeAskPanel ask={modeAsk} />
        </>
      )}
    </StaffShell>
  );
}

/** The idle console: pickers (prepopulated from the schedule, ADR-089) and the start button. */
function StartMatchPanel(props: { console_: ReturnType<typeof useCourtConsole> }) {
  return (
    <section className="console-panel">
          <h2>Start a match</h2>
          {/* ADR-089 — the suggestion is prepopulated below; this line says where it came from. */}
          {props.console_.upNext ? (
            <p className="console-muted" data-testid="court__up-next">
              Up next here: {props.console_.upNext.teamAName ?? 'TBD'} vs{' '}
              {props.console_.upNext.teamBName ?? 'TBD'}
            </p>
          ) : null}
          {props.console_.hasEnoughTeams ? null : (
            <p className="console-warning" data-testid="court__needs-teams">
              {emptyStates.facilitatorTeamPicker}
            </p>
          )}
          {/* ADR-108 — speed starts: every offered button is a pair that can take the sand
              RIGHT NOW (pending, both teams known, neither mid-game). The first is this
              court's planned fixture; the rest cover "the scheduled team is missing but
              another pair is standing right here". One tap starts them. */}
          {props.console_.upNextList.length > 0 ? (
            <div className="console-speed" data-testid="court__speed-starts">
              {props.console_.upNextList.slice(0, 4).map((fixture, index) => (
                <button
                  key={fixture.id}
                  type="button"
                  className={
                    index === 0
                      ? 'console-button console-button--primary console-speed__button'
                      : 'console-button console-speed__button'
                  }
                  data-testid="court__speed-start"
                  disabled={props.console_.isBusy}
                  onClick={() => props.console_.speedStart(fixture)}
                >
                  <span className="console-speed__pair">
                    {fixture.teamAName} vs {fixture.teamBName}
                  </span>
                  <span className="console-speed__tag">
                    {index === 0 ? 'Up next here' : `Queue #${fixture.sequence}`}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <p className="console-muted">Or pick any two teams:</p>
          <TeamPicker
            label="Team A"
            htmlId="court-team-a"
            testId="court__team-a"
            groups={groupTeamOptions(props.console_.teams, props.console_.recentTeamIds)}
            value={props.console_.teamAId}
            onChange={props.console_.setTeamAId}
          />
          <TeamPicker
            label="Team B"
            htmlId="court-team-b"
            testId="court__team-b"
            groups={groupTeamOptions(props.console_.teams, props.console_.recentTeamIds)}
            value={props.console_.teamBId}
            onChange={props.console_.setTeamBId}
          />
          {/* Scheduled or friendly — settled BEFORE the start button is pressed (ADR-089). */}
          {props.console_.tournament && props.console_.teamAId && props.console_.teamBId ? (
            <p className="console-muted" data-testid="court__schedule-note">
              {props.console_.isScheduledPair
                ? 'On the schedule — this match settles a fixture.'
                : 'Friendly — not on the schedule, cluster points only.'}
            </p>
          ) : null}
          <div style={{ height: 16 }} />
          <button
            type="button"
            className="console-button console-button--primary console-button--huge"
            data-testid="court__start"
            disabled={!props.console_.canStart}
            onClick={props.console_.startMatchNow}
          >
            Start match
          </button>
        </section>
  );
}

/*
 * ADR-097/ADR-100 (R-1 Phase 1) — the pickers stay native selects (sunlight, one-handed),
 * with this court's recent opponents pinned on top and everything else in one alphabetical
 * list. NOT grouped by cluster: teams are participant-formed and cross-cluster, so no
 * cluster owns a team and any such grouping key would be a lie (ADR-100).
 */
interface TeamOptionGroups {
  recent: TeamSummaryView[];
  all: TeamSummaryView[];
}

function groupTeamOptions(teams: TeamSummaryView[], recentTeamIds: string[]): TeamOptionGroups {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const recent: TeamSummaryView[] = [];
  for (const id of recentTeamIds) {
    const team = byId.get(id);
    if (team) recent.push(team);
  }
  // `teams` arrives alphabetical from the API and stays that way.
  return { recent, all: teams };
}

function TeamPicker(props: {
  label: string;
  htmlId: string;
  testId: string;
  groups: TeamOptionGroups;
  value: string;
  onChange: (teamId: string) => void;
}) {
  return (
    <ConsoleField id={props.htmlId} label={props.label} topic="courtStartTeam">
      <select
        id={props.htmlId}
        className="console-select"
        data-testid={props.testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">— select —</option>
        {props.groups.recent.length > 0 ? (
          <optgroup label="Recently on this court">
            {props.groups.recent.map((team) => (
              <option key={team.id} value={team.id}>
                {team.teamName}
              </option>
            ))}
          </optgroup>
        ) : null}
        {props.groups.recent.length > 0 ? (
          <optgroup label="All teams">
            {props.groups.all.map((team) => (
              <option key={team.id} value={team.id}>
                {team.teamName}
              </option>
            ))}
          </optgroup>
        ) : (
          props.groups.all.map((team) => (
            <option key={team.id} value={team.id}>
              {team.teamName}
            </option>
          ))
        )}
      </select>
    </ConsoleField>
  );
}

/** The leading team's name, for a button that must say who it is about. */
function winnerName(match: { teamAId: string; teamAName: string; teamBName: string }, leadingTeamId: string): string {
  return leadingTeamId === match.teamAId ? match.teamAName : match.teamBName;
}

/**
 * ADR-152 (F-1) — the one place that turns `endingMode` into a button.
 *
 * Four endings, each its own branch rather than nested ternaries over the score: the
 * question of how a match may end is now answered in the hook and merely rendered here.
 */
/** ADR-329 F5 — the off-scoreboard way a level knockout was settled. */
function TiebreakPicker(props: { method: TiebreakMethod; onChange: (method: TiebreakMethod) => void }) {
  return (
    <ConsoleField id="court-tiebreak-method" label="Settle it by" topic="courtTiebreakMethod">
      <select
        id="court-tiebreak-method"
        className="console-select"
        data-testid="court__tiebreak-method"
        value={props.method}
        onChange={(event) => props.onChange(event.target.value as TiebreakMethod)}
      >
        <option value="coin_toss">Coin toss</option>
        <option value="rock_paper_scissors">Scissors-paper-stone</option>
      </select>
    </ConsoleField>
  );
}

function MatchEnding(props: {
  match: MatchView;
  console_: ReturnType<typeof useCourtConsole>;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const { match, console_, confirm } = props;
  const leader = console_.leadingTeamId;
  const [tiebreakMethod, setTiebreakMethod] = useState<TiebreakMethod>('coin_toss');

  if (console_.endingMode === 'win' && leader) {
    return (
      <button
        type="button"
        className="console-button console-button--primary console-button--huge"
        data-testid="court__end"
        disabled={console_.isBusy}
        onClick={() => confirm.ask({
          title: `${winnerName(match, leader)} won ${console_.scoreA} - ${console_.scoreB}?`,
          body: `This ends the match and awards the win to ${winnerName(match, leader)}, straight onto the cluster board. Only a superadmin can undo it.`,
          confirmLabel: 'Yes, end the match',
          run: () => console_.endMatchNow(),
        })}
      >
        End match · {winnerName(match, leader)} wins
      </button>
    );
  }

  if (console_.endingMode === 'draw') {
    return (
      <button
        type="button"
        className="console-button console-button--primary console-button--huge"
        data-testid="court__draw"
        disabled={console_.isBusy}
        onClick={() => confirm.ask({
          title: `Draw at ${console_.scoreA} - ${console_.scoreB}?`,
          body: `This ends the match level. ${match.teamAName} and ${match.teamBName} are each paid the draw rate, straight onto the cluster board. Only a superadmin can undo it.`,
          confirmLabel: 'Yes, it was a draw',
          run: () => console_.declareDraw(),
        })}
      >
        End match · Draw
      </button>
    );
  }

  /*
   * Overtime. The score cannot decide it and a knockout cannot be drawn: play on for the
   * next point, or settle it off the scoreboard (ADR-329 F5) — a coin toss or
   * scissors-paper-stone, with the winner tapped here. The score stays as played.
   */
  if (console_.endingMode === 'overtime') {
    const sides = [
      { id: match.teamAId, name: match.teamAName },
      { id: match.teamBId, name: match.teamBName },
    ];
    return (
      <>
        <p className="console-status console-status--warn" data-testid="court__level">
          Level at {console_.scoreA} - {console_.scoreB}, and a knockout cannot be drawn — play
          on, or settle it now.
        </p>
        <TiebreakPicker method={tiebreakMethod} onChange={setTiebreakMethod} />
        {sides.map((side) => (
          <div key={side.id}>
            <button
              type="button"
              className="console-button console-button--primary"
              data-testid="court__tiebreak-winner"
              disabled={console_.isBusy}
              onClick={() => confirm.ask({
                title: `${side.name} won the ${tiebreakMethod === 'coin_toss' ? 'coin toss' : 'scissors-paper-stone'}?`,
                body: `The score stays ${console_.scoreA} - ${console_.scoreB}; ${side.name} goes through on the tiebreak, straight onto the cluster board. Only a superadmin can undo it.`,
                confirmLabel: `Yes, ${side.name} won it`,
                run: () => console_.declareTiebreakWinner(side.id, tiebreakMethod),
              })}
            >
              {side.name} won the tiebreak
            </button>
            <div style={{ height: 12 }} />
          </div>
        ))}
      </>
    );
  }

  return <UntrackedEnding match={match} console_={console_} confirm={confirm} />;
}

/**
 * 0 - 0 in a knockout: a draw is illegal and the score names nobody, so a human must.
 *
 * ADR-152 narrowed this to the only case that still needs it. A group match on 0 - 0 is a
 * draw now, so the marshal who never touched the strip no longer awards a win by hand.
 */
function UntrackedEnding(props: {
  match: MatchView;
  console_: ReturnType<typeof useCourtConsole>;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const { match, console_, confirm } = props;
  const sides = [
    { id: match.teamAId, name: match.teamAName, other: match.teamBName },
    { id: match.teamBId, name: match.teamBName, other: match.teamAName },
  ];
  return (
    <>
      <p className="console-muted">No score yet. Tap a point above, or award the win directly.</p>
      {sides.map((side) => (
        <div key={side.id}>
          <button
            type="button"
            className="console-button console-button--primary"
            data-testid="court__winner"
            disabled={console_.isBusy}
            onClick={() => confirm.ask({
              title: `${side.name} won?`,
              body: `This awards the win to ${side.name} and the loss to ${side.other}, straight onto the cluster board. Only a superadmin can undo it.`,
              confirmLabel: `Yes, ${side.name} won`,
              run: () => console_.declareWinner(side.id),
            })}
          >
            {side.name} won
          </button>
          <div style={{ height: 12 }} />
        </div>
      ))}
    </>
  );
}
