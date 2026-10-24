import type { FinalStandingsView } from '@psd/contracts';
import { roundPoints } from './format.js';

/**
 * ADR-161 — the day's result as three spreadsheets.
 *
 * Built in the browser from the object already on screen rather than fetched from three CSV
 * endpoints, so a downloaded file and the printed sheet are the same read and cannot drift
 * apart between one request and the next.
 */

export interface CsvFile {
  filename: string;
  text: string;
}

/**
 * Excel executes a cell that begins `=`, `+`, `-` or `@`, and a nickname is whatever a
 * participant typed. A leading apostrophe makes the cell a literal string, which is the
 * standard defence and costs nothing to a human reader of the column.
 */
function defuse(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = defuse(String(value));
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  /*
   * A BOM, because the audience for this file is somebody double-clicking it on a laptop:
   * without one, Excel reads UTF-8 as the local code page and every accented nickname in
   * the record arrives mangled. CRLF for the same reason.
   */
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** `final-standings-individuals-2026-10-05.csv` — sorts by date in a downloads folder. */
function nameFor(part: string, generatedAt: string): string {
  const stamp = generatedAt.slice(0, 10);
  return `final-standings-${part}-${stamp}.csv`;
}

export function clustersCsv(standings: FinalStandingsView): CsvFile {
  return {
    filename: nameFor('clusters', standings.generatedAt),
    text: toCsv(
      ['Rank', 'Cluster', 'Code', 'Fringe points', 'Tournament points', 'Total points', 'People'],
      standings.clusters.map((cluster) => [
        cluster.rank,
        cluster.displayName,
        cluster.clusterCode,
        roundPoints(cluster.fringePoints),
        roundPoints(cluster.tournamentPoints),
        roundPoints(cluster.totalPoints),
        cluster.participantCount,
      ]),
    ),
  };
}

export function individualsCsv(standings: FinalStandingsView): CsvFile {
  return {
    filename: nameFor('individuals', standings.generatedAt),
    text: toCsv(
      ['Rank', 'Nickname', 'Cluster', 'Total points'],
      standings.individuals.map((person) => [
        person.rank,
        person.nickname,
        person.clusterCode,
        person.totalPoints,
      ]),
    ),
  };
}

export function teamsCsv(standings: FinalStandingsView): CsvFile {
  return {
    filename: nameFor('teams', standings.generatedAt),
    text: toCsv(
      ['Group', 'Rank', 'Team', 'Played', 'Won', 'Drawn', 'Lost', 'For', 'Against', 'Difference'],
      standings.teams.map((team) => [
        team.groupCode,
        team.rank,
        team.teamName,
        team.played,
        team.wins,
        team.draws,
        team.losses,
        team.pointsFor,
        team.pointsAgainst,
        // ADR-115 — a partial sum is not a difference, so it is blank rather than wrong.
        team.isFullyScored ? team.pointDifference : null,
      ]),
    ),
  };
}

/** Hands the file to the browser. Separated so every builder above stays a pure function. */
export function downloadCsv(file: CsvFile): void {
  const blob = new Blob([file.text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
