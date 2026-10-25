/**
 * Runs the Playwright suite here, where `npx playwright install chromium` cannot
 * reach its download host (ADDENDUM-043).
 *
 * `@sparticuz/chromium` ships a Chromium build inside an npm tarball, so the registry
 * we *can* reach is enough. It extracts to /tmp on first use and needs the Amazon
 * Linux 2023 shared libraries; the package only extracts those when it believes it
 * is on Lambda, which is why the environment flag is set before importing it.
 *
 * With nothing set up, `npm run e2e` still uses Playwright's own browser — this
 * script only provides the executable path through the environment.
 */
import { spawn } from 'node:child_process';

process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs22.x';

const { default: chromium } = await import('@sparticuz/chromium');

const executablePath = await chromium.executablePath();
const passed = process.argv.slice(2);
const command = passed.length > 0 ? passed : ['test'];

console.error(`[sandbox-browser] chromium ${executablePath}`);

const child = spawn('npx', ['playwright', ...command], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE: executablePath },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
