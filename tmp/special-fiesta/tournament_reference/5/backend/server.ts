import { join } from 'node:path';
import type { Server } from 'node:http';
import { createDatabase, type DbHandle } from './db.js';
import { createHttpServer } from './app.js';

export function resolvePort(portText: string | undefined): number {
  return portText === undefined ? 3000 : Number(portText);
}

export interface RunningServer {
  server: Server;
  handle: DbHandle;
  close: () => Promise<void>;
}

/** App entrypoint: API + built frontend on PORT (default 3000), 0.0.0.0. */
export async function main(): Promise<RunningServer> {
  const port = resolvePort(process.env.PORT);
  const handle = await createDatabase(process.env.PGLITE_DATA_DIR);
  const server = createHttpServer(handle.db, join(process.cwd(), 'dist'));
  await new Promise<void>((resolve) => {
    server.listen(port, '0.0.0.0', resolve);
  });
  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await handle.close();
  };
  return { server, handle, close };
}

export const running = main();
