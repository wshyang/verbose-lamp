import { z } from 'zod';

/**
 * ADR-350 — the load CLI's options (the plan's §4, `config.ts`): Zod-validated, from argv
 * with `PSD_LOAD_*` env equivalents, so a CI wrapper and a human type the same run twice.
 *
 * The defaults are the plan's own: 300 users (fds.md's ceiling), a 30 s admission window,
 * a 10-minute horizon, 4 worker shards. The ramp's gates are pre-calibration placeholders —
 * §9's rule is that thresholds arrive only after the first live runs, and every one of them
 * is overridable so the calibration ADR can set them without touching this file again.
 */

const loadOptionsSchema = z.object({
  /**
   * Standalone launches its own stack and plays the beats itself. Cast (Phase 4, the
   * `live-room-at-300` spec) attaches to a stack the SPEC owns, fields the teams, admits the
   * population, and then takes its beats from stdin until EOF — the cast is the choreographer.
   */
  mode: z.enum(['standalone', 'cast']).default('standalone'),
  users: z.number().int().min(1).max(10_000).default(300),
  /** Ramp: climb by steps to a ceiling past the fixed claim, reporting the knee (plan §1B). */
  ramp: z.boolean().default(false),
  ceiling: z.number().int().min(1).max(10_000).default(1_000),
  stepUsers: z.number().int().min(1).default(50),
  stepMs: z.number().int().min(1_000).default(15_000),
  /**
   * The API's base URL. The default is the load pair's API slot (PORTS.load) — cast mode's
   * default target, and where standalone mode launches its own scratch stack.
   */
  target: z.string().url().default('http://127.0.0.1:8793'),
  runId: z.string().min(4).max(64).optional(),
  windowMs: z.number().int().min(0).default(30_000),
  durationMs: z.number().int().min(1_000).default(600_000),
  shards: z.number().int().min(1).max(16).default(4),
  marshals: z.number().int().min(1).max(12).default(1),
  teamSpread: z.number().int().min(1).max(99).default(30),
  outDir: z.string().min(1).default('test-results-load'),
  /** The local stack is seeded with this passcode; staff signs in with it. */
  superadminPasscode: z.string().min(4).max(4).default('4242'),
  /**
   * ADR-324 — the local stack's stream cap. Ramp runs default to 5,000 (§12: the knee must
   * measure the server, not the cap); fixed runs leave the shipped 2,000 untouched.
   */
  streamCap: z.number().int().min(1).default(2_000),
});

export type LoadOptions = z.infer<typeof loadOptionsSchema>;

const ENV_KEYS: readonly (readonly [keyof LoadOptions, string])[] = [
  ['users', 'PSD_LOAD_USERS'],
  ['ceiling', 'PSD_LOAD_CEILING'],
  ['stepUsers', 'PSD_LOAD_STEP_USERS'],
  ['stepMs', 'PSD_LOAD_STEP_MS'],
  ['target', 'PSD_LOAD_TARGET'],
  ['runId', 'PSD_LOAD_RUN_ID'],
  ['windowMs', 'PSD_LOAD_WINDOW_MS'],
  ['durationMs', 'PSD_LOAD_DURATION_MS'],
  ['shards', 'PSD_LOAD_SHARDS'],
  ['marshals', 'PSD_LOAD_MARSHALS'],
  ['outDir', 'PSD_LOAD_OUT_DIR'],
  ['superadminPasscode', 'PSD_LOAD_SUPERADMIN_PASSCODE'],
  ['streamCap', 'PSD_LOAD_STREAM_CAP'],
];

const NUMBER_KEYS = new Set<keyof LoadOptions>([
  'users',
  'ceiling',
  'stepUsers',
  'stepMs',
  'windowMs',
  'durationMs',
  'shards',
  'marshals',
  'teamSpread',
  'superadminPasscode',
  'streamCap',
]);

/**
 * Parses argv (`--key value`, `--key` for booleans) over env defaults. Unknown flags and
 * values that fail Zod are refused with the message, not silently dropped — a mistyped
 * `--u sers 300` must not quietly run 300 defaults.
 */
export function loadOptions(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): LoadOptions {
  const raw: Record<string, string | boolean> = {};
  for (const key of ENV_KEYS) {
    const value = env[key[1]];
    if (value !== undefined && value !== '') raw[key[0] as string] = value;
  }
  if (env['PSD_LOAD_RAMP'] === '1') raw['ramp'] = true;
  const parsed = parseArgv(argv);
  for (const [key, value] of Object.entries(parsed)) raw[key] = value;

  const coerced = coerceNumbers(raw);
  const result = loadOptionsSchema.safeParse(coerced);
  if (!result.success) {
    throw new Error(`load options are invalid: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  refuseUnbuiltPhases(parsed);
  const options = result.data;
  refuseContradictions(options);
  return options;
}

/** A run that contradicts itself is refused by name, not silently bent into something else. */
function refuseContradictions(options: LoadOptions): void {
  if (options.ramp && options.ceiling <= options.users) {
    throw new Error(`--ceiling (${options.ceiling}) must exceed --users (${options.users}): the ramp climbs PAST the fixed claim`);
  }
  if (options.mode === 'cast' && options.ramp) {
    throw new Error('--mode cast cannot climb: the cast admits its whole population and holds the room until stdin closes');
  }
  if (options.mode === 'cast' && options.teamSpread > 64) {
    throw new Error(`--mode cast fields at most 64 teams (the day's entrants cap) — got ${options.teamSpread}`);
  }
}

/** Kebab-case flags become the schema's camelCase keys; a numeric key given no value refuses. */
function coerceNumbers(raw: Record<string, string | boolean>): Record<string, unknown> {
  const coerced: Record<string, unknown> = { ...raw };
  for (const key of Object.keys(coerced)) {
    if (!NUMBER_KEYS.has(key as keyof LoadOptions)) continue;
    const value = coerced[key];
    if (typeof value === 'boolean') throw new Error(`--${key} needs a value`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number, not '${String(value)}'`);
    coerced[key] = parsed;
  }
  return coerced;
}

/** The phases that exist as flags but not as code say so, by name. */
function refuseUnbuiltPhases(parsed: Record<string, string | boolean>): void {
  if (parsed['hooks'] !== undefined) {
    throw new Error('--hooks is not built yet: the jsdom hook tier is Phase 5');
  }
  if (parsed['withPolling'] !== undefined) {
    throw new Error('--with-polling is not built yet: §2b leaves it an open decision, default off');
  }
}

function parseArgv(argv: readonly string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === undefined) break;
    if (!token.startsWith('--')) throw new Error(`unexpected argument '${token}' — options are --key value (or --flag)`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      if (key in flags) throw new Error(`--${key} was given twice`);
      flags[key] = next;
      index += 2;
      continue;
    }
    flags[key] = true;
    index += 1;
  }
  return flags;
}
