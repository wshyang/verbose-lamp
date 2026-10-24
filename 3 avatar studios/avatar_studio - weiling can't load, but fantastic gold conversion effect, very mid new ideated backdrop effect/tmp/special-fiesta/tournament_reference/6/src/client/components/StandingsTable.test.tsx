// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { standing } from '../../test/fixtures.js';
import { StandingsTable } from './StandingsTable.js';

afterEach(cleanup);

describe('StandingsTable', () => {
  it('renders overall rankings, score signs, and group tables', () => {
    const first = standing();
    const second = standing({
      teamId: 'team-2', teamName: 'River Club', seed: 2, wins: 0, draws: 0, losses: 1,
      scoreFor: 1, scoreAgainst: 4, scoreDifference: -3, points: 0,
    });
    const zeroDifference = standing({
      teamId: 'team-3', teamName: 'Old Town', seed: 3, wins: 0, draws: 1, losses: 0,
      scoreFor: 0, scoreAgainst: 0, scoreDifference: 0, points: 1,
    });
    render(<StandingsTable standings={[first, second, zeroDifference]} groupStandings={{ A: [first], B: [] }} />);
    const table = screen.getByTestId('standings-table');
    expect(within(table).getByRole('heading', { name: 'Overall standing' })).toBeInTheDocument();
    expect(within(table).getByRole('heading', { name: 'Group A' })).toBeInTheDocument();
    expect(within(table).getByRole('heading', { name: 'Group B' })).toBeInTheDocument();
    expect(table.querySelector('.positive-number')).toHaveTextContent('+1');
    expect(table.querySelector('.negative-number')).toHaveTextContent('-3');
    expect(table.querySelectorAll('.positive-number')[1]).toHaveTextContent('0');
    expect(within(table).getAllByText('No games recorded for this table yet.')).toHaveLength(1);
    expect(within(table).getAllByText('Northside')).toHaveLength(2);
    expect(within(table).getAllByText('Seed 1')).toHaveLength(2);
  });

  it('shows a setup note when the overall table is still empty', () => {
    render(<StandingsTable standings={[]} groupStandings={{ C: [] }} />);
    expect(screen.getByText('Standings appear when teams are added.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group C' })).toBeInTheDocument();
    expect(screen.getAllByText('0 teams')).toHaveLength(2);
  });
});
