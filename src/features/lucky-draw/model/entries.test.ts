import { describe, expect, it } from 'vitest';
import { validateEntries, withoutWinners } from './entries';

const gatsby = { id: 'gatz', name: 'Jay Gatsby', subtitle: 'West Egg' };
const daisy = { id: 'buchanan-d', name: 'Daisy  Buchanan' };

describe('validateEntries', () => {
  it('trims and collapses whitespace', () => {
    const result = validateEntries([gatsby, { ...daisy, name: '  Daisy   Buchanan  ' }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries[1].name).toBe('Daisy Buchanan');
  });

  it('rejects duplicate ids, empty names, long names and tiny pools', () => {
    const bad = validateEntries([gatsby, { id: 'gatz', name: '' }, { id: 'x', name: 'A'.repeat(61) }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.length).toBeGreaterThanOrEqual(3);
    expect(validateEntries([gatsby]).ok).toBe(false);
  });

  it('withoutWinners supports redraws', () => {
    const pool = withoutWinners([gatsby, daisy], ['gatz']);
    expect(pool.map((e) => e.id)).toEqual(['buchanan-d']);
  });
});