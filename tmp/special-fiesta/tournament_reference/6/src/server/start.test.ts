import { createServer, type AddressInfo } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from './db/database.js';
import { cleanupAfterStartupFailure, resolveServerOptions, startServer } from './start.js';

const migrationControl = vi.hoisted(() => ({ failure: undefined as Error | undefined }));

vi.mock('./db/migrate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db/migrate.js')>();
  return {
    ...actual,
    runMigrations: (client: Parameters<typeof actual.runMigrations>[0]) => {
      if (migrationControl.failure) return Promise.reject(migrationControl.failure);
      return actual.runMigrations(client);
    },
  };
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('HTTP server lifecycle', () => {
  it('resolves development defaults and explicit host, port, and data directory options', () => {
    expect(resolveServerOptions()).toEqual({ host: '0.0.0.0', port: 4000, dataDirectory: '.data/pglite' });
    expect(resolveServerOptions({ host: '127.0.0.1', port: 0, dataDirectory: '/tmp/matchday-test' })).toEqual({
      host: '127.0.0.1',
      port: 0,
      dataDirectory: '/tmp/matchday-test',
    });
  });

  it('starts the real app, serves health, and closes both server and database', async () => {
    const dataDirectory = await temporaryDatabaseDirectory();
    const running = await startServer({ host: '127.0.0.1', port: 0, dataDirectory });
    try {
      const address = running.server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      await running.close();
    }
    expect(running.server.listening).toBe(false);
  });

  it('closes the database when migrations fail before an HTTP server is created', async () => {
    const dataDirectory = await temporaryDatabaseDirectory();
    const failure = new Error('Simulated migration failure.');
    migrationControl.failure = failure;
    try {
      await expect(startServer({ dataDirectory })).rejects.toBe(failure);
    } finally {
      migrationControl.failure = undefined;
    }
    const reopened = await createDatabase(dataDirectory);
    await reopened.close();
  });

  it('closes a listening HTTP server and database through startup cleanup', async () => {
    const dataDirectory = await temporaryDatabaseDirectory();
    const database = await createDatabase(dataDirectory);
    const server = createHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    await cleanupAfterStartupFailure(server, database);
    expect(server.listening).toBe(false);
    await expect(database.client.query('SELECT 1')).rejects.toThrow();
  });

  it('closes the database when a requested port is already occupied', async () => {
    const dataDirectory = await temporaryDatabaseDirectory();
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address() as AddressInfo;
    try {
      await expect(startServer({ host: '127.0.0.1', port: address.port, dataDirectory }))
        .rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('still closes the database if the HTTP server was already stopped', async () => {
    const dataDirectory = await temporaryDatabaseDirectory();
    const running = await startServer({ host: '127.0.0.1', port: 0, dataDirectory });
    await new Promise<void>((resolve, reject) => running.server.close((error) => error ? reject(error) : resolve()));
    await expect(running.close()).rejects.toMatchObject({ code: 'ERR_SERVER_NOT_RUNNING' });
    await expect(running.database.client.query('SELECT 1')).rejects.toThrow();
  });
});

async function temporaryDatabaseDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'matchday-server-'));
  temporaryDirectories.push(directory);
  return directory;
}
