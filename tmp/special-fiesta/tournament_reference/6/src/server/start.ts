import { createServer, type Server } from 'node:http';
import { createApp } from './app.js';
import { createDatabase, type DatabaseContext } from './db/database.js';
import { runMigrations } from './db/migrate.js';

export interface ServerOptions {
  host?: string;
  port?: number;
  dataDirectory?: string;
}

export interface ResolvedServerOptions {
  host: string;
  port: number;
  dataDirectory: string;
}

export interface RunningServer {
  server: Server;
  database: DatabaseContext;
  close: () => Promise<void>;
}

export function resolveServerOptions(options: ServerOptions = {}): ResolvedServerOptions {
  return {
    host: options.host ?? '0.0.0.0',
    port: options.port ?? 4000,
    dataDirectory: options.dataDirectory ?? '.data/pglite',
  };
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const resolved = resolveServerOptions(options);
  const database = await createDatabase(resolved.dataDirectory);
  let server: Server | undefined;
  try {
    await runMigrations(database.client);
    server = createServer(createApp(database.db));
    await listen(server, resolved.port, resolved.host);
    return { server, database, close: () => closeServer(server!, database) };
  } catch (error) {
    await cleanupAfterStartupFailure(server, database);
    throw error;
  }
}

export async function cleanupAfterStartupFailure(
  server: Server | undefined,
  database: DatabaseContext,
): Promise<void> {
  if (server?.listening) await closeServer(server, database);
  else await database.close();
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function closeServer(server: Server, database: DatabaseContext): Promise<void> {
  let closeError: Error | undefined;
  await new Promise<void>((resolve) => {
    server.close((error) => {
      closeError = error;
      resolve();
    });
  });
  await database.close();
  if (closeError) throw closeError;
}
