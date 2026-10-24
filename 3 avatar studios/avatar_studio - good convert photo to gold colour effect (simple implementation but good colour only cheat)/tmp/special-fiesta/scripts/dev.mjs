#!/usr/bin/env node
/**
 * One command for the whole stack: `npm run dev`.
 *
 * Starts the API (tsx watch) and the Vite dev server together, loading .env if present and
 * falling back to .env.example values that are safe for a local machine. Vite proxies /api to
 * the API, so the browser only ever talks to one origin.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const entries = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    entries[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return entries;
}

const fromExample = loadEnvFile(join(ROOT, '.env.example'));
const fromLocal = loadEnvFile(join(ROOT, '.env'));
const env = { ...fromExample, ...fromLocal, ...process.env };

if (!env.SUPERADMIN_INITIAL_PASSCODE) {
  console.error('SUPERADMIN_INITIAL_PASSCODE is required (fds.md B1). Copy .env.example to .env.');
  process.exit(1);
}

const children = [];

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false });
  child.on('exit', (code) => {
    console.log(`[dev] ${name} exited with ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('api', 'npm', ['run', 'dev', '--workspace', '@psd/api'], ROOT);
start('web', 'npm', ['run', 'dev', '--workspace', '@psd/web'], ROOT);
