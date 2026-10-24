import { describe, expect, it } from 'vitest';
import { loadOptions } from './config.js';

describe('loadOptions — the contract between the CLI and its operator', () => {
  it('defaults to the numbers the plan itself chose', () => {
    const options = loadOptions([]);
    expect(options.users).toBe(300);
    expect(options.windowMs).toBe(30_000);
    expect(options.durationMs).toBe(600_000);
    expect(options.shards).toBe(4);
    expect(options.target).toBe('http://127.0.0.1:8793');
    expect(options.ramp).toBe(false);
  });

  it('reads flags and PSD_LOAD_* env, with argv winning', () => {
    const fromEnv = loadOptions([], { PSD_LOAD_USERS: '120', PSD_LOAD_OUT_DIR: 'elsewhere' });
    expect(fromEnv.users).toBe(120);
    expect(fromEnv.outDir).toBe('elsewhere');

    const fromArgv = loadOptions(['--users', '25', '--window-ms', '2000', '--ramp', '--ceiling', '60'], {
      PSD_LOAD_USERS: '120',
    });
    expect(fromArgv.users).toBe(25);
    expect(fromArgv.windowMs).toBe(2_000);
    expect(fromArgv.ramp).toBe(true);
    expect(fromArgv.ceiling).toBe(60);
  });

  it('refuses a mistyped run rather than quietly running defaults', () => {
    expect(() => loadOptions(['--users', 'zero'])).toThrow();
    expect(() => loadOptions(['--users'])).toThrow();
    expect(() => loadOptions(['users', '300'])).toThrow();
    expect(() => loadOptions(['--users', '10', '--users', '20'])).toThrow();
    expect(() => loadOptions([], { PSD_LOAD_USERS: 'many' })).toThrow();
  });

  it('names the unbuilt phases instead of accepting their flags', () => {
    expect(() => loadOptions(['--hooks', '10'])).toThrow(/Phase 5/);
    expect(() => loadOptions(['--with-polling'])).toThrow(/§2b/);
  });

  it('takes cast mode now that Phase 4 is built, and refuses its contradictions', () => {
    expect(loadOptions(['--mode', 'cast', '--target', 'http://127.0.0.1:8793']).mode).toBe('cast');
    expect(() => loadOptions(['--mode', 'cast', '--ramp', '--users', '300', '--ceiling', '400'])).toThrow(/cannot climb/);
    expect(() => loadOptions(['--mode', 'cast', '--team-spread', '65'])).toThrow(/64 teams/);
  });

  it('refuses a ramp that never climbs past the fixed claim', () => {
    expect(() => loadOptions(['--ramp', '--users', '300', '--ceiling', '300'])).toThrow(/PAST/);
    expect(loadOptions(['--ramp', '--users', '300', '--ceiling', '301']).ceiling).toBe(301);
  });
});
