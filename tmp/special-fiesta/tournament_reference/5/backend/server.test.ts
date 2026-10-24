// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

describe('server entrypoint', () => {
  it('resolves the default port and boots', async () => {
    process.env.PORT = '0';
    delete process.env.PGLITE_DATA_DIR;
    vi.resetModules();
    const { running, resolvePort } = await import('./server.js');
    expect(resolvePort(undefined)).toBe(3000);
    expect(resolvePort('8080')).toBe(8080);
    const instance = await running;
    expect(instance.server.listening).toBe(true);
    await instance.close();
  });

  it('boots on an explicit ephemeral port', async () => {
    process.env.PORT = '0';
    vi.resetModules();
    const { running } = await import('./server.js');
    const instance = await running;
    const address = instance.server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    expect(response.status).toBe(200);
    await instance.close();
    delete process.env.PORT;
  });
});
