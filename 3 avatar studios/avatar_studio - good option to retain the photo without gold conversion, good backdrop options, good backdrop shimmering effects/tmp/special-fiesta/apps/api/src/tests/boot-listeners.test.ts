import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runProvisionScript } from '../db/dbInit.js';
import { isFatalDatabaseError } from '../lib/fatalDatabase.js';

/** What the engine raises when the wasm runtime aborts: a class named RuntimeError. */
class RuntimeError extends Error {}
const wasmAbort = (message: string): Error => new RuntimeError(message);

/**
 * ADR-324 — two ways a boot or a database could end the process from somewhere nobody was
 * listening. A boot script that exits before reading its stdin used to raise EPIPE on a stream
 * with no 'error' listener; a PGlite whose WebAssembly runtime has aborted answers every later
 * query with an error and never recovers, so it has to be recognised and the process replaced.
 */
describe('runProvisionScript', () => {
  it('rejects, rather than crashing, when the script exits without reading stdin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'psd-boot-'));
    const script = join(dir, 'no-read.sh');
    await writeFile(script, '#!/bin/bash\nexit 3\n');
    const unhandled = vi.fn();
    process.on('uncaughtException', unhandled);
    try {
      const big = 'x'.repeat(2_000_000);
      await expect(
        runProvisionScript({ script, args: [], stdin: big, env: { ...process.env } }),
      ).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('uncaughtException', unhandled);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('isFatalDatabaseError', () => {
  it('recognises a WebAssembly runtime error', () => {
    expect(isFatalDatabaseError(wasmAbort('unreachable'))).toBe(true);
  });

  it('finds it anywhere in the cause chain, where drizzle wraps the driver error', () => {
    const wrapped = new Error('Failed query', { cause: new Error('outer', { cause: wasmAbort('abort') }) });
    expect(isFatalDatabaseError(wrapped)).toBe(true);
  });

  it('recognises PGlite saying it is closed', () => {
    expect(isFatalDatabaseError(new Error('PGlite is closed'))).toBe(true);
  });

  it('does not mistake an ordinary constraint violation for a dead database', () => {
    expect(isFatalDatabaseError(Object.assign(new Error('duplicate key'), { code: '23505' }))).toBe(false);
    expect(isFatalDatabaseError('a string')).toBe(false);
    expect(isFatalDatabaseError(null)).toBe(false);
  });
});

describe('app.onError and a failed database', () => {
  it('reports a fatal database error to the process owner, and answers 500', async () => {
    const { createTestContext } = await import('./harness.js');
    const { onFatalDatabaseError, resetFatalDatabaseHandlerForTests } = await import('../lib/fatalDatabase.js');
    const context = await createTestContext();
    const owner = vi.fn();
    onFatalDatabaseError(owner);
    try {
      const reader = await context.signUpParticipant();
      vi.spyOn(context.handle.db, 'select').mockImplementation(() => {
        throw wasmAbort('unreachable');
      });
      const response = await context.app.request('/api/me', { headers: reader.headers });
      expect(response.status).toBe(500);
      expect(owner).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      resetFatalDatabaseHandlerForTests();
      await context.close();
    }
  });

  it('does not report an ordinary error', async () => {
    const { createTestContext } = await import('./harness.js');
    const { onFatalDatabaseError, resetFatalDatabaseHandlerForTests } = await import('../lib/fatalDatabase.js');
    const context = await createTestContext();
    const owner = vi.fn();
    onFatalDatabaseError(owner);
    try {
      const reader = await context.signUpParticipant();
      vi.spyOn(context.handle.db, 'select').mockImplementation(() => {
        throw new Error('some other bug');
      });
      await context.app.request('/api/me', { headers: reader.headers });
      expect(owner).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      resetFatalDatabaseHandlerForTests();
      await context.close();
    }
  });
});
