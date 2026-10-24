import { describe, expect, it } from 'vitest';
import { required } from './required.js';

describe('required', () => {
  it('returns a present value unchanged', () => {
    expect(required('BeachBoss', 'nickname')).toBe('BeachBoss');
    expect(required(0, 'points')).toBe(0);
  });

  it('names what was missing when the guarantee is broken', () => {
    expect(() => required(undefined, 'zod issue')).toThrow('Missing zod issue.');
    expect(() => required(null, 'team')).toThrow('Missing team.');
  });
});
