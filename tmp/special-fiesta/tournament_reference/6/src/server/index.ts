import { startServer } from './start.js';

const running = await startServer({
  port: Number(process.env.API_PORT ?? 4000),
  dataDirectory: process.env.PGLITE_DATA_DIR ?? '.data/pglite',
});
console.info(`Tournament API listening on 0.0.0.0:${(running.server.address() as { port: number }).port}`);
process.once('SIGINT', () => void running.close());
process.once('SIGTERM', () => void running.close());
