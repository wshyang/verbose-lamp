import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env.js';

/**
 * ADR-324 — limits that were hard-wired or absent are now environment-tunable with safe
 * defaults, and a value the database would refuse is refused at boot instead of crash-looping
 * the container: `SUPERADMIN_INITIAL_PASSCODE=12345` used to pass here and then die inside the
 * seed on a CHECK constraint, on every restart, with the platform restarting it each time.
 */
describe('limits and their defaults', () => {
  it('defaults every limit', () => {
    const env = parseEnv({});
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.DATABASE_CONNECT_TIMEOUT_MS).toBe(10_000);
    expect(env.DATABASE_STATEMENT_TIMEOUT_MS).toBe(30_000);
    expect(env.DATABASE_IDLE_TX_TIMEOUT_MS).toBe(60_000);
    expect(env.SSE_MAX_STREAMS).toBe(2_000);
    expect(env.GALLERY_MAX_TOTAL_BYTES).toBe(8_000_000_000);
  });

  it('reads them from the environment', () => {
    const env = parseEnv({ DATABASE_POOL_MAX: '25', SSE_MAX_STREAMS: '500', GALLERY_MAX_TOTAL_BYTES: '1000000' });
    expect(env.DATABASE_POOL_MAX).toBe(25);
    expect(env.SSE_MAX_STREAMS).toBe(500);
    expect(env.GALLERY_MAX_TOTAL_BYTES).toBe(1_000_000);
  });

  it.each([
    ['DATABASE_POOL_MAX', '0'],
    ['DATABASE_POOL_MAX', '-1'],
    ['DATABASE_POOL_MAX', 'lots'],
    ['DATABASE_CONNECT_TIMEOUT_MS', '0'],
    ['SSE_MAX_STREAMS', '0'],
  ])('refuses %s=%s, which would wedge the pool or refuse every stream', (key, value) => {
    expect(() => parseEnv({ [key]: value })).toThrow(new RegExp(key));
  });

  it('lets a statement timeout of 0 mean "none" (Postgres semantics)', () => {
    expect(parseEnv({ DATABASE_STATEMENT_TIMEOUT_MS: '0' }).DATABASE_STATEMENT_TIMEOUT_MS).toBe(0);
  });
});

describe('the superadmin seed values the database would refuse', () => {
  it.each(['12345', '123', 'abcd', '12 4'])('refuses a passcode of %s', (passcode) => {
    expect(() => parseEnv({ SUPERADMIN_INITIAL_PASSCODE: passcode })).toThrow(/SUPERADMIN_INITIAL_PASSCODE/);
  });

  it('accepts four digits, and an unset passcode (the boot checks that against the database)', () => {
    expect(parseEnv({ SUPERADMIN_INITIAL_PASSCODE: '0042' }).SUPERADMIN_INITIAL_PASSCODE).toBe('0042');
    expect(parseEnv({}).SUPERADMIN_INITIAL_PASSCODE).toBeUndefined();
  });

  it.each(['abc', 'a'.repeat(21)])('refuses a username of %s characters long', (username) => {
    expect(() => parseEnv({ SUPERADMIN_INITIAL_USERNAME: username })).toThrow(/SUPERADMIN_INITIAL_USERNAME/);
  });

  it('never prints the passcode it refused', () => {
    expect(() => parseEnv({ SUPERADMIN_INITIAL_PASSCODE: '98765' })).toThrow(/^(?!.*98765)/s);
  });
});
