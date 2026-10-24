#!/usr/bin/env node
/**
 * scripts/check-standards.mjs — the structural invariants a linter cannot see.
 *
 * ESLint enforces the numeric function-design limits (AGENTS-function-design.md §1–§3).
 * This script enforces the rules that are about *where* code lives and *what* it may say:
 * mapper bans, id minting, the component/hook split, JSX purity, testid coverage, theme
 * separation, copy ownership, schema twins and import cycles.
 *
 * Every violation prints `file:line  rule  message` and exits 1. Run: `npm run standards`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// ADR-343 — the gate's coverage contract, in one place:
//   eslint    covers the WHOLE repo minus its global ignores (node_modules, dist, public,
//             `tournament_reference/**`; `tmp/**` is deliberately NOT ignored — S1 deferred by
//             the owner, and the red there is his gate report, not ours to silence).
//   standards covers SCAN_ROOTS below — an allowlist: the four source roots plus the browser
//             suite, which is source too (specs drive the product; ADR-170).
//   typecheck covers the four workspace tsconfigs plus `tsconfig.e2e.json` (specs, support and
//             the five Playwright configs — noEmit).
// `scripts/*.mjs` are tooling, JS by design: eslint covers them, and typing the gate itself is
// the deferred follow-up (its own bite tests).
const SCAN_ROOTS = ['apps/api/src', 'apps/web/src', 'packages/contracts/src', 'packages/tournament/src', 'e2e'];
const violations = [];

function fail(file, line, rule, message) {
  violations.push({ file, line, rule, message });
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function loadSources() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    const full = join(ROOT, root);
    try {
      statSync(full);
    } catch {
      continue;
    }
    for (const path of walk(full)) {
      files.push({
        path: relative(ROOT, path).split('\\').join('/'),
        text: readFileSync(path, 'utf8'),
      });
    }
  }
  return files;
}

// ADR-343 — a Playwright spec is a test, so the rules that exempt tests exempt specs too.
// Without this line, widening SCAN_ROOTS to e2e would audit every spec as production code.
// `e2e/support/` is test support by function (it asserts with @playwright/test's `expect` and
// inspects the page from outside), and is the only `support/` directory under the scan roots;
// the product's own `routes-tournament/support.ts` is a file, not a segment, so it stays scoped.
// Triage of the firings this classification resolved (all four in photo-api.ts): two
// `expect(...).toBe(true)` assertions read as flag arguments; a `page.evaluate` localStorage
// read read as a storage-ownership bypass (the one-owner rule is about product code paths);
// a test-side nickname read as id minting (ADR-009 is about product ids — the uuid nickname
// stays, unique by construction; new specs use fixtures' `unique()`).
const isTest = (file) => /\.test\.tsx?$|\.spec\.tsx?$|\/tests?\/|\/test-utils\/|\/acceptance\/|\/support\//.test(file.path);

/** Line number of an index into the file text (1-based). */
function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scanPattern(file, pattern, rule, message) {
  for (const match of file.text.matchAll(pattern)) {
    fail(file.path, lineAt(file.text, match.index), rule, message(match));
  }
}

// ── 1. Drizzle is the only mapper (AGENTS-database.md §1) ──────────────────────────────────
const MAPPER = /\b(toDomain|rowTo[A-Z]\w*|mapRowTo\w*|camelize|snakeize|toSnakeCase|toCamelCase)\s*\(/g;

function checkNoHandWrittenMappers(files) {
  for (const file of files) {
    scanPattern(
      file,
      MAPPER,
      'no-hand-written-mapper',
      (m) => `${m[1]}() is a second source of truth — let Drizzle map, and shape the wire with a *View() function.`,
    );
  }
}

// ── 2. Soft deletion only (AGENTS-database.md §3) ──────────────────────────────────────────
// Carve-out: the HTTP verb is fine (`routes.delete('/teams/:id/members/:pid')` is REST, and
// `apiRemove()` calls it). What is banned is a *destructive* row removal.
const DB_DELETE = /\b(db|tx|trx|conn|connection|database)\s*\.\s*delete\s*\(/g;
const DELETE_FN = /\bexport\s+(?:async\s+)?function\s+(delete[A-Z]\w*)\s*\(/g;

// ADR-307: the system reset is the codebase's one deliberate hard delete — a practice
// day emptied in a single transaction behind a superadmin passcode and a typed
// challenge. Named here, in exactly one file, so the exception is a decision a reader
// can find rather than a pattern that quietly spreads.
const HARD_DELETE_FILES = new Set(['apps/api/src/db/entities/systemReset.ts']);

function checkNoHardDeletes(files) {
  for (const file of files) {
    if (HARD_DELETE_FILES.has(file.path)) continue;
    scanPattern(
      file,
      DB_DELETE,
      'no-hard-delete',
      () => 'Rows are invalidated, never deleted — set expires_at and filter with isActive().',
    );
    scanPattern(
      file,
      DELETE_FN,
      'no-hard-delete',
      (m) => `Repository function ${m[1]}() must be named invalidate…() and soft-delete.`,
    );
  }
}

// ── 3. Ids are minted in exactly one module per app (AGENTS-database.md §2, ADR-009) ───────
const ID_MINTERS = new Set([
  'apps/api/src/db/ids.ts',
  // ADR-009: the client_scan_uuid is the offline queue's idempotency key, minted where the
  // queue's retry contract lives so the key and the retry can never disagree.
  'apps/web/src/lib/offline/scanQueue.ts',
  // ADR-263: the sticky-session id names a browser to the load balancer, minted where its
  // keep lives for the same reason — the value and its persistence can never disagree.
  'apps/web/src/lib/session/stickySession.ts',
]);

function checkIdMinting(files) {
  for (const file of files) {
    if (ID_MINTERS.has(file.path) || isTest(file)) continue;
    scanPattern(
      file,
      /\brandomUUID\s*\(|\buuidv[147]\s*\(|gen_random_uuid\s*\(/g,
      'id-minting',
      () => `Mint ids only in ${[...ID_MINTERS].join(' or ')}.`,
    );
  }
}

// ── 4. The component/hook split (AGENTS-frontend.md §1) ────────────────────────────────────
function checkComponentHookSplit(files) {
  for (const file of files) {
    const isComponent =
      file.path.startsWith('apps/web/src/components/') ||
      file.path.startsWith('apps/web/src/routes-');
    if (isComponent && !isTest(file)) {
      scanPattern(
        file,
        /from '[^']*lib\/api\/[^']*'/g,
        'no-api-in-component',
        () => 'A component never calls the server — move the call into lib/hooks/use<Feature>.ts.',
      );
    }
    if (file.path.startsWith('apps/web/src/lib/hooks/') && !isTest(file)) {
      scanPattern(
        file,
        /from '[^']*(?:\.\.\/)+components\/[^']*'/g,
        'hook-imports-component',
        () => 'A hook returns data, never markup — it must not import from components/.',
      );
      // A hook file is .ts, where TypeScript itself rejects JSX. The extension is the gate.
      if (file.path.endsWith('.tsx')) {
        fail(
          file.path,
          1,
          'hook-returns-jsx',
          'Hook files are .ts so JSX cannot compile in them — a .tsx hook means markup crept into a hook.',
        );
      }
    }
  }
}

// ── 5. The JSX interior is presentation-only (AGENTS-frontend.md §2) ───────────────────────
const JSX_BANNED = [
  ['.filter(', 'filter'],
  ['.reduce(', 'reduce'],
  ['.sort(', 'sort'],
  ['.find(', 'find'],
  ['.some(', 'some'],
  ['.every(', 'every'],
  ['new Date(', 'new Date'],
  ['.toFixed(', 'toFixed'],
  ['JSON.parse(', 'JSON.parse'],
  ['.toLocaleDateString(', 'toLocaleDateString'],
  ['.toLocaleTimeString(', 'toLocaleTimeString'],
];

/** Extract every `return ( … )` body of a .tsx file, paren-balanced. */
function returnBlocks(text) {
  const blocks = [];
  for (const match of text.matchAll(/\breturn\s*\(/g)) {
    let depth = 0;
    let index = match.index + match[0].length - 1;
    for (; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      else if (text[index] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = text.slice(match.index, index + 1);
    if (body.includes('<')) blocks.push({ body, start: match.index });
  }
  return blocks;
}

function checkJsxPurity(files) {
  for (const file of files) {
    if (!file.path.endsWith('.tsx') || isTest(file)) continue;
    for (const block of returnBlocks(file.text)) {
      for (const [token, label] of JSX_BANNED) {
        const at = block.body.indexOf(token);
        if (at === -1) continue;
        fail(
          file.path,
          lineAt(file.text, block.start + at),
          'jsx-purity',
          `${label} inside a JSX return — name the derivation above the return, or move it to the hook.`,
        );
      }
    }
  }
}

// ── 6. data-testid on every interactive element (AGENTS-frontend.md §3) ────────────────────
const INTERACTIVE = ['button', 'input', 'select', 'textarea', 'form', 'a', 'Link', 'NavLink'];

/** Every JSX opening tag in the file, with its attribute text. */
function openingTags(text) {
  const tags = [];
  for (const match of text.matchAll(/<([A-Za-z][\w.]*)(\s|>|\/)/g)) {
    let depth = 0;
    let index = match.index;
    let quote = null;
    for (; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') quote = char;
      else if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) break;
    }
    tags.push({ name: match[1], attrs: text.slice(match.index, index + 1), start: match.index });
  }
  return tags;
}

function checkTestIds(files) {
  for (const file of files) {
    if (!file.path.endsWith('.tsx') || isTest(file)) continue;
    for (const tag of openingTags(file.text)) {
      const isInteractive = INTERACTIVE.includes(tag.name) || /\son(Click|Submit)=/.test(tag.attrs);
      if (!isInteractive || tag.attrs.includes('data-testid')) continue;
      fail(
        file.path,
        lineAt(file.text, tag.start),
        'missing-testid',
        `<${tag.name}> is interactive and needs data-testid="{component-kebab}__{role}".`,
      );
    }
  }
}

// ── 7. Avatars and sprites are participant-only (fds.md §5.5, AGENTS-frontend.md §4) ──────
function checkThemeSeparation(files) {
  for (const file of files) {
    const isAdminSurface =
      file.path.startsWith('apps/web/src/routes-facilitator/') ||
      // ADR-284 — the court console's Line-ups subtab: a facilitator surface outside the kept folder.
      file.path.startsWith('apps/web/src/routes-court/') ||
      file.path.startsWith('apps/web/src/routes-superadmin/') ||
      file.path.startsWith('apps/web/src/components/console/');
    if (!isAdminSurface) continue;
    scanPattern(
      file,
      /from '[^']*(?:avatars?|Avatar|motifs?|Motif|components\/participant)[^']*'/g,
      'avatar-on-admin-surface',
      () => 'Facilitator and superadmin surfaces are text-only — no avatars, sprites or decoration.',
    );
    scanPattern(
      file,
      /className="[^"]*\bgb-/g,
      'avatar-on-admin-surface',
      () => 'Facilitator and superadmin surfaces use console classes only — gb-* is participant styling.',
    );
  }
}

// ── 8. One module owns localStorage (ADR-009) ──────────────────────────────────────────────
function checkStorageOwnership(files) {
  // The one owner, plus the modules that own a key's *meaning* and go through it.
  const owners = [
    'apps/web/src/lib/storage/localStore.ts',
    'apps/web/src/lib/avatar/spriteCache.ts',
    // ADR-058 — test-only, and it owns no key: it SUPPLIES the Storage object that vitest's jsdom
    // environment fails to expose, which is the opposite concern to this rule's. Exempt for the
    // same reason `isTest` files are — never shipped, and `vite.config.ts` loads it as `setupFiles`
    // rather than any src module importing it — but named explicitly because it is not a *.test.ts.
    'apps/web/src/test-setup.ts',
  ];
  for (const file of files) {
    if (owners.includes(file.path) || isTest(file)) continue;
    scanPattern(
      file,
      /\b(?:window\.)?localStorage\b/g,
      'storage-ownership',
      () =>
        'localStorage has exactly one owner: lib/storage/localStore.ts. Go through it, and ' +
        'keep each key behind the module that owns its meaning (scanQueue, tokenStore, ' +
        'locationStore).',
    );
  }
}

// ── 9. User-facing copy lives in @psd/contracts (AGENTS-frontend.md §5) ────────────────────
function contractCopy() {
  const strings = new Set();
  for (const name of ['messages.ts', 'emptyStates.ts']) {
    let text;
    try {
      text = readFileSync(join(ROOT, 'packages/contracts/src', name), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(/:\s*'((?:[^'\\]|\\.){12,})'/g)) strings.add(match[1]);
  }
  return [...strings];
}

function checkCopyOwnership(files) {
  const owned = contractCopy();
  for (const file of files) {
    if (file.path.startsWith('packages/contracts/') || isTest(file)) continue;
    for (const copy of owned) {
      const at = file.text.indexOf(`'${copy}'`);
      if (at === -1) continue;
      fail(
        file.path,
        lineAt(file.text, at),
        'duplicated-copy',
        `This string is already owned by @psd/contracts — import it instead of re-typing it.`,
      );
    }
  }
}

// ── 10. No flag arguments (AGENTS-function-design.md §3) ───────────────────────────────────
// A boolean *literal* at a call site selects behaviour from outside; a named boolean field in
// a parameter object does not. React setters assign a value rather than select behaviour.
const CALL_ONE_LITERAL = /\b([a-z]\w*)\s*\(\s*(?:true|false)\s*\)/g;
const CALL_TRAILING_LITERAL = /\b([a-z]\w*)\s*\(\s*[^(),]{1,40},\s*(?:true|false)\s*\)/g;
// Assigning a boolean *value* (React state, a Drizzle column default, an assertion) is not a
// flag argument; selecting *behaviour* is. Only the latter is a smell.
const VALUE_SINK = /^(set[A-Z]|useState|useRef|default|notNull|expect|assert|Boolean|String|Number|JSON)/;

/** True when the `: boolean` sits directly in a parameter list, not inside a parameter object. */
function isPositionalParameter(text, index) {
  let depth = 0;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const char = text[cursor];
    if (char === '}') depth += 1;
    else if (char === '{') {
      if (depth === 0) return false;
      depth -= 1;
    } else if (char === ')') depth += 1;
    else if (char === '(') {
      if (depth === 0) return true;
      depth -= 1;
    } else if (char === ';' && depth === 0) return false;
  }
  return false;
}

function checkFlagArguments(files) {
  for (const file of files) {
    if (isTest(file)) continue;
    // `setIsOpen(true)` assigns a value; `setLock(team, true)` selects behaviour.
    for (const match of file.text.matchAll(CALL_ONE_LITERAL)) {
      if (VALUE_SINK.test(match[1])) continue;
      fail(file.path, lineAt(file.text, match.index), 'flag-argument', flagMessage(match[1]));
    }
    for (const match of file.text.matchAll(CALL_TRAILING_LITERAL)) {
      fail(file.path, lineAt(file.text, match.index), 'flag-argument', flagMessage(match[1]));
    }
    for (const match of file.text.matchAll(/[(,]\s*\w+\s*:\s*boolean\s*[,)]/g)) {
      if (!isPositionalParameter(file.text, match.index)) continue;
      fail(
        file.path,
        lineAt(file.text, match.index),
        'flag-parameter',
        'A positional boolean parameter is a flag argument — use two named functions, or a named field in a parameter object.',
      );
    }
  }
}

function flagMessage(callee) {
  return `${callee}(…, true|false) hides two behaviours in one function — split it into two named functions.`;
}

// ── 11. schema.sql is the ONE schema, and Drizzle agrees with it (ADR-049/ADR-102) ────────
/** Comments describe the rules; only executable DDL is evidence of the schema. */
function stripSqlComments(sql) {
  return sql
    .split('\n')
    .map((line) => (line.trimStart().startsWith('--') ? '' : line))
    .join('\n');
}

/** Lines inside a `CREATE TABLE` that are a table constraint rather than a column definition. */
const DDL_CONSTRAINT_KEYWORDS = new Set([
  'CONSTRAINT',
  'CHECK',
  'PRIMARY',
  'UNIQUE',
  'FOREIGN',
  'EXCLUDE',
]);

/**
 * `table -> Map(column -> foreign table | null)`, read from the `CREATE TABLE` blocks and the
 * additive `ALTER … ADD COLUMN` lines both. ADR-168 makes the second family necessary rather than
 * tidy: a column released after its table first shipped exists only down there, and a Drizzle map
 * that points at it is correct, not drifting.
 *
 * A column's foreign key is the `REFERENCES` on its own line, on the deeper-indented continuation lines
 * that belong to it (how this file writes a long one), or in the named `ADD CONSTRAINT … FOREIGN KEY` at
 * the foot of the snapshot that a column on an older table has to use.
 */
function parseSchemaColumns(ddl) {
  const tables = new Map();
  for (const match of ddl.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? (\w+) \(([\s\S]*?)\n\);/g)) {
    const columns = new Map();
    const lines = match[2].split('\n');
    let current = null;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const head = line.match(/^ {0,2}([a-z_][a-z0-9_]*)\s+([a-z]+)/i);
      const isOwnLine = head !== null && !DDL_CONSTRAINT_KEYWORDS.has(head[2].toUpperCase());
      current = isOwnLine ? head[1] : null;
      if (!current) continue;
      let references = line.match(/REFERENCES (\w+)/);
      let j = i + 1;
      while (j < lines.length && /^ {3,}\S/.test(lines[j])) {
        if (!references) references = lines[j].match(/REFERENCES (\w+)/);
        j += 1;
      }
      columns.set(current, references ? references[1] : null);
      i = j - 1;
    }
    tables.set(match[1], columns);
  }
  for (const match of ddl.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)([^\n]*)/g)) {
    const columns = tables.get(match[1]);
    if (!columns || columns.has(match[2])) continue;
    const references = match[3].match(/REFERENCES (\w+)/);
    columns.set(match[2], references ? references[1] : null);
  }
  /*
   * A third spelling, and the reason it is here rather than in the loop above: a column on an OLDER table
   * cannot carry a `REFERENCES` pointing at a table defined further down the file, because Postgres
   * resolves the clause when the column is created. `score_adjustment.batch_id` (ADR-248) is that column,
   * and its key is added at the foot of the snapshot as a named constraint. Without this pass the rule
   * reads the column as unreferenced and calls the Drizzle mirror an invention — precisely the drift the
   * rule exists to catch, told backwards. Single-column keys only: no composite FK in this file needs
   * a mirror today, and reading `(a, b)` as one name would be a parser that lies about what it saw.
   */
  for (const match of ddl.matchAll(/ALTER TABLE (\w+) ADD\s+CONSTRAINT[^;]*?FOREIGN KEY \((\w+)\)\s*REFERENCES (\w+)/g)) {
    const columns = tables.get(match[1]);
    if (columns?.has(match[2])) columns.set(match[2], match[3]);
  }
  return tables;
}

/** One Drizzle column entry: its SQL name and whether it mirrors a foreign key. */
function parseMappedColumns(body) {
  const mapped = new Map();
  /*
   * The sentinel is the fix. This function is handed the text BETWEEN the braces, so the closing brace its
   * own terminator pattern expects is not in what it scans — and every table's LAST mapped column therefore
   * had no terminator to match, escaped the lookahead, and went unchecked in both directions. A column
   * added at the end of a block (which is where a new column always goes) was invisible to the drift rule
   * that exists to catch exactly that.
   */
  const scan = `${body.replace(/\s+$/, '')}\n}`;
  for (const match of scan.matchAll(/^ {2}(\w+): ([\s\S]*?)(?=\n {2}\w+: |\n\})/gm)) {
    const named = match[2].match(/\(\s*'([a-z0-9_]+)'/);
    mapped.set(named ? named[1] : match[1], /\.references\(/.test(match[2]));
  }
  return mapped;
}

/**
 * ADR-049 replaced the twin-file rule. There are no migrations to stay in step with; the risk that
 * remains is the one the twin rule never covered — `schema.sql` and the Drizzle tables in
 * `db/schema/` drifting apart. It used to compare table names only, which is how three foreign keys
 * sat unmirrored in `fringe.ts` and `tournament.ts` while the rule stayed green: a name comparison
 * cannot see a column. It now checks columns and both directions of the FK agreement. Drizzle is what the code queries through and the schema file is what
 * the database is built from, so a table in one and not the other is a runtime error waiting for
 * whoever touches that feature next.
 */
function checkSchemaSingleSource() {
  const snapshotPath = join(ROOT, 'apps/api/src/db/schema.sql');
  let snapshot;
  try {
    snapshot = readFileSync(snapshotPath, 'utf8');
  } catch {
    fail('apps/api/src/db/schema.sql', 1, 'schema-source', 'Missing schema.sql (ADR-102 tier 1).');
    return;
  }

  // A reintroduced migrations directory means the schema has two homes again.
  try {
    const stale = readdirSync(join(ROOT, 'apps/api/src/db/migrations'));
    if (stale.length > 0) {
      fail(
        'apps/api/src/db/migrations',
        1,
        'schema-source',
        'ADR-049: schema.sql is the only schema. Change it in place instead of adding migrations.',
      );
    }
  } catch {
    // Absent, which is the expected state.
  }

  const ddl = stripSqlComments(snapshot);
  const tables = parseSchemaColumns(ddl);

  const schemaDir = join(ROOT, 'apps/api/src/db/schema');
  for (const name of readdirSync(schemaDir).filter((file) => file.endsWith('.ts'))) {
    const source = readFileSync(join(schemaDir, name), 'utf8');
    for (const match of source.matchAll(/pgTable\(\s*'([a-z0-9_]+)',\s*\{([\s\S]*?)\n\s*\}\s*,?\s*(?:\(|\)\s*;)/g)) {
      const [, table, body] = match;
      const line = lineAt(source, match.index);
      const declared = tables.get(table);
      if (!declared) {
        fail(
          `apps/api/src/db/schema/${name}`,
          line,
          'schema-source',
          `Drizzle maps table ${table} but schema.sql never creates it — every query would fail.`,
        );
        continue;
      }
      checkColumnsAgainstSchema(`apps/api/src/db/schema/${name}`, line, table, declared, body);
    }
  }
}

/**
 * The column and foreign-key half of the rule.
 *
 * One-directional about columns on purpose: a mapped column that `schema.sql` does not create is a
 * runtime error waiting for the first query through it, while a created column that nothing maps is
 * simply a column this codebase reads with hand-written SQL or not at all — 34 of them today, and
 * `$inferSelect` is narrower than the table because of it. Foreign keys are checked in both
 * directions, because there the two files are meant to say the same thing: a `.references()` the
 * database does not enforce is a promise nobody can keep, and an enforced FK the map does not carry
 * is a typed join that cannot be written.
 */
function checkColumnsAgainstSchema(file, line, table, declared, body) {
  const mapped = parseMappedColumns(body);
  for (const [column, hasReference] of mapped) {
    if (!declared.has(column)) {
      fail(
        file,
        line,
        'schema-source',
        `${table}.${column} is mapped in Drizzle but schema.sql never creates it (ADR-049).`,
      );
      continue;
    }
    const foreign = declared.get(column);
    if (foreign && !hasReference) {
      fail(
        file,
        line,
        'schema-source',
        `${table}.${column} carries an enforced FK to ${foreign} in schema.sql that this map does not mirror.`,
      );
    }
    if (!foreign && hasReference) {
      fail(
        file,
        line,
        'schema-source',
        `${table}.${column} mirrors an FK to a table schema.sql does not reference — the map promises a constraint that is not there.`,
      );
    }
  }
}


// ── 13. A write that pushes must push everything it owes (ADR-130/131, B6) ─────────────────
/**
 * The forget-to-publish rule.
 *
 * Two call sites answering the same question drift apart silently: ADR-130's roster line
 * published its message frame and not its watermark for weeks, because nothing but a reader
 * comparing the two could tell. ESLint cannot see this and a review note did not catch it, so
 * it is a machine check — which is this repository's standing answer to "somebody will forget".
 *
 * Each pair reads: if a region calls `trigger`, that same region must also call `requires`.
 * The region is the enclosing route handler or top-level function, found by line boundaries
 * rather than by parsing braces. That is an approximation, and deliberately the conservative
 * one: it can only ever merge two adjacent regions into one and thus MISS a violation, never
 * invent one. A rule that cries wolf gets switched off.
 */
const PUSH_PAIRS = [
  // ADR-083/121/125 — the line goes to whoever has the room open, the watermark lights the dot
  // for everybody who does not. Different audiences, so two frames, so two chances to forget.
  { trigger: 'publishChatMessage', requires: 'publishChatActivity' },
  { trigger: 'publishTeamChatMessage', requires: 'publishTeamChatActivity' },
  // ADR-153 — a hide is the mirror of a post and forgets the watermark the same way. The
  // retraction is its own frame because it is the one that may lower the mark.
  { trigger: 'publishChatHidden', requires: 'publishChatRetracted' },
  { trigger: 'invalidateGalleryPhoto', requires: 'publishGalleryRetracted' },
  // ADR-155 — the team room owes the same pair, per team rather than globally.
  { trigger: 'publishTeamChatHidden', requires: 'publishTeamChatRetracted' },
  // ADR-131 (B6), restored by ADR-277 — every engine command the match feed renders must push the
  // match it changed. The triggers are the core's command names, called from the composition root.
  { trigger: 'startPair', requires: 'publishFeedMatch' },
  { trigger: 'scoreStep', requires: 'publishFeedMatch' },
  { trigger: 'completeMatch', requires: 'publishFeedMatch' },
  { trigger: 'callOff', requires: 'publishFeedMatch' },
  { trigger: 'stageAdHocMatch', requires: 'publishFeedMatch' },
  { trigger: 'recordWalkover', requires: 'publishFeedMatch' },
  { trigger: 'cancelMatch', requires: 'publishFeedMatch' },
  { trigger: 'correctResult', requires: 'publishFeedMatch' },
  { trigger: 'setMatchVoided', requires: 'publishFeedMatch' },
  // B6's other half: a result that moves the board pushes the board too.
  { trigger: 'completeMatch', requires: 'pushLeaderboard' },
  { trigger: 'correctResult', requires: 'pushLeaderboard' },
  { trigger: 'setMatchVoided', requires: 'pushLeaderboard' },
  { trigger: 'recordWalkover', requires: 'pushLeaderboard' },
  // ADR-279 — an award moves the board as surely as a result does.
  { trigger: 'awardPoints', requires: 'pushLeaderboard' },
  { trigger: 'voidAward', requires: 'pushLeaderboard' },
];

const PUSH_SCOPE = /^apps\/api\/src\/(routes-[\w-]+|db\/entities)\//;
const REGION_START =
  /^(?:export\s+)?(?:async\s+)?function\s|^export\s+const\s+\w+\s*=|^\s{0,4}routes\.(?:get|post|patch|put|delete)\(/;

/** Split a file into [startLine, endLine) regions at function and route-handler boundaries. */
function regionsOf(text) {
  const lines = text.split('\n');
  const starts = [0];
  for (let i = 0; i < lines.length; i += 1) if (REGION_START.test(lines[i])) starts.push(i);
  const bounds = [...new Set(starts)].sort((a, b) => a - b);
  return bounds.map((start, index) => ({
    start,
    end: index + 1 < bounds.length ? bounds[index + 1] : lines.length,
    text: lines.slice(start, index + 1 < bounds.length ? bounds[index + 1] : lines.length).join('\n'),
  }));
}

function checkPushPairing(files) {
  for (const file of files) {
    if (isTest(file) || !PUSH_SCOPE.test(file.path)) continue;
    // The entity module that DEFINES a mutation is not the one that has to publish it; only
    // calls from elsewhere are. Skip a file that declares the trigger itself.
    for (const region of regionsOf(file.text)) {
      for (const { trigger, requires } of PUSH_PAIRS) {
        const declares = new RegExp(`function\\s+${trigger}\\b`).test(region.text);
        const calls = new RegExp(`\\b${trigger}\\s*\\(`).test(region.text);
        if (declares || !calls) continue;
        if (new RegExp(`\\b${requires}\\s*\\(`).test(region.text)) continue;
        fail(
          file.path,
          region.start + 1,
          'push-pairing',
          `${trigger}() here must also call ${requires}() — a push that tells only half the story.`,
        );
      }
    }
  }
}

// ── 12. No circular imports between peer modules (AGENTS-function-design.md §6) ────────────
function importGraph(files) {
  const graph = new Map();
  for (const file of files) {
    const edges = [];
    for (const match of file.text.matchAll(/from '(\.[^']*)'/g)) {
      const target = resolve(dirname(join(ROOT, file.path)), match[1]).replace(/\.js$/, '');
      const candidates = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map(
        (suffix) => relative(ROOT, target + suffix).split('\\').join('/'),
      );
      const hit = candidates.find((candidate) => files.some((other) => other.path === candidate));
      if (hit) edges.push(hit);
    }
    graph.set(file.path, edges);
  }
  return graph;
}

function findCycle(graph) {
  const state = new Map();
  const stack = [];
  const visit = (node) => {
    if (state.get(node) === 'done') return null;
    if (state.get(node) === 'open') return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 'open');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function checkNoCycles(files) {
  const cycle = findCycle(importGraph(files.filter((file) => !isTest(file))));
  if (cycle) {
    fail(cycle[0], 1, 'import-cycle', `Circular import: ${cycle.join(' → ')}`);
  }
}

// ── 14. The hall screen has no controls (ADR-141) ─────────────────────────────────────────
/**
 * A projector has no mouse, no keyboard and nobody standing at it. Anything interactive on
 * that surface is either dead pixels or — worse — a control the one person who can reach the
 * laptop can hit by accident, in front of the room, with no way back.
 *
 * It is a rule rather than a habit because the pressure to break it is real and reasonable:
 * every scene here is a near-copy of a participant page that DOES have a filter, a vote
 * button, a tab strip. Copying one across brings its controls with it unless something
 * objects.
 */
function checkScreenIsUntouchable(files) {
  for (const file of files) {
    if (!file.path.startsWith('apps/web/src/routes-screen/') || isTest(file)) continue;
    scanPattern(
      file,
      /<(?:button|input|select|textarea|form|a)\b/g,
      'screen-has-no-controls',
      (match) =>
        `The hall screen is projected, not operated: no <${match[0].slice(1)}>. Scenes read ` +
        'data and render it; anything that needs a person belongs on a participant or console page.',
    );
    scanPattern(
      file,
      /\bon(?:Click|Change|Submit|KeyDown|KeyUp|Input|Focus|Blur)=/g,
      'screen-has-no-controls',
      () =>
        'The hall screen is projected, not operated: no event handlers. The deck advances on ' +
        'its own clock (useScreenDeck), which is the only thing that may change what is shown.',
    );
  }
}

// ── 15. The service worker may not know the API exists (ADR-147) ──────────────────────────
// An allowlist cannot be widened by accident, but it can be widened on purpose. This is the
// one cache the server cannot purge, so the mistake is made a build failure rather than a
// code review: nothing under src/sw/ may mention an API path at all.
function checkWorkerKnowsNoApi(files) {
  for (const file of files) {
    if (!file.path.startsWith('apps/web/src/sw/') || isTest(file)) continue;
    scanPattern(
      file,
      /['"`]\/api\b/g,
      'worker-caches-no-api',
      () =>
        'ADR-147: the service worker caches by allowlist and must not name an API path. A ' +
        'worker-cached API response is the one copy the server cannot purge; warm data is ' +
        "lib/storage/cacheStore.ts's job, under code you ship and can revoke.",
    );
  }
}

// ── 16. A membership write must forget the memoised membership (ADR-162) ──────────────────
/**
 * `findActiveMembership` is cached, and unlike every other cached read in this system it is an
 * AUTHORISATION decision: the status stream's team gate and team chat's per-delivery check both
 * ask it whether this person may still have this frame. Its freshness comes from the void, not
 * from its one-second TTL, so a module that writes `team_membership` without calling
 * `forgetMemberships()` leaves an ex-member reading a room they were removed from.
 *
 * File-level rather than region-level on purpose. The write happens inside a transaction and
 * the void has to happen AFTER the commit, so the two are in different functions by design —
 * demanding them in the same region would be demanding the bug. What is worth catching is a
 * NEW module that starts writing memberships and never learns the rule at all.
 */
const MEMBERSHIP_WRITE = /\.(insert|update)\(\s*teamMemberships\s*\)/g;

function checkMembershipVoid(files) {
  for (const file of files) {
    if (isTest(file) || !MEMBERSHIP_WRITE.test(file.text)) continue;
    MEMBERSHIP_WRITE.lastIndex = 0;
    if (/\bforgetMemberships\s*\(/.test(file.text)) continue;
    fail(
      file.path,
      1,
      'membership-void',
      'This module writes team_membership, so it must call forgetMemberships() after the ' +
        'commit. findActiveMembership() is cached and gates every team frame on both SSE ' +
        'streams — a missed void is an ex-member still reading the room (ADR-162).',
    );
  }
}

/**
 * ADR-324: a stream handler's bus listener cannot await, so any promise it starts has to end
 * somewhere. `void work()` discards it, and a rejection inside then belongs to nobody — Node 22
 * ends the process for it, which on these files meant one failed database read took every
 * phone's stream down. `runDetached(work(), onError)` is the named idiom (lib/detached.ts).
 */
const BARE_VOID_CALL = /(^|[^\w$.])void\s+[A-Za-z_$][\w$.]*\s*\(/g;

function checkDetachedPromises(files) {
  for (const file of files) {
    if (isTest(file) || !/(^|\/)routes-[^/]+\/(?:.+\/)?stream\.ts$/.test(file.path)) continue;
    scanPattern(
      file,
      BARE_VOID_CALL,
      'detached-promise',
      () =>
        'A bare `void call()` in a stream file discards a promise that can reject, and an unhandled ' +
        'rejection ends the process. Use runDetached(call(), onError) from lib/detached.ts (ADR-324).',
    );
  }
}

/**
 * ADR-175 / ADR-323: Dockerfile (demo) and Dockerfile-prd (production) are one app built two
 * ways. They must ship the same bits — the builder stage and every `COPY --from=builder` are
 * identical, so the production image is what was tested — and they differ in exactly what
 * ADR-323 says: the data tier (`PSD_SEED`) and the runtime shell. The demo image keeps
 * supervisord + cloudflared on 8787; the production image is one process on 3000 with neither,
 * because the platform in front of it owns ingress and restarts.
 */
function checkDockerfileTwins() {
  const read = (name) => {
    try {
      return readFileSync(join(ROOT, name), 'utf8');
    } catch {
      fail(name, 1, 'docker-twins', `Missing ${name} (ADR-175: the demo and production images).`);
      return null;
    }
  };
  const demo = read('Dockerfile');
  const prod = read('Dockerfile-prd');
  if (demo === null || prod === null) return;

  const instructions = (text) =>
    text
      .split('\n')
      .map((line, index) => ({ line: line.trimEnd(), number: index + 1 }))
      .filter((entry) => entry.line.trim() !== '' && !entry.line.trim().startsWith('#'));
  const demoLines = instructions(demo);
  const prodLines = instructions(prod);

  const exactlyOne = (lines, expected, name) => {
    if (lines.filter((entry) => entry.line === expected).length === 1) return;
    fail(name, 1, 'docker-twins', `${name} must contain exactly one \`${expected}\` line (ADR-175).`);
  };
  exactlyOne(demoLines, 'ENV PSD_SEED=demo', 'Dockerfile');
  exactlyOne(prodLines, 'ENV PSD_SEED=default', 'Dockerfile-prd');

  // The builder stage: everything before the second FROM, identical in both files.
  const builderOf = (lines) => {
    const second = lines.findIndex((entry, index) => index > 0 && entry.line.startsWith('FROM '));
    return second === -1 ? lines : lines.slice(0, second);
  };
  const demoBuilder = builderOf(demoLines);
  const prodBuilder = builderOf(prodLines);
  const builderLength = Math.max(demoBuilder.length, prodBuilder.length);
  for (let index = 0; index < builderLength; index += 1) {
    const left = demoBuilder[index];
    const right = prodBuilder[index];
    if (left !== undefined && right !== undefined && left.line === right.line) continue;
    fail(
      'Dockerfile-prd',
      right?.number ?? 1,
      'docker-twins',
      `Builder stage drifted from Dockerfile:${left?.number ?? '?'}. Expected \`${left?.line.trim() ?? '(nothing)'}\` ` +
        `but found \`${right?.line.trim() ?? '(nothing)'}\`. The two images are built from the same bits (ADR-175).`,
    );
    break;
  }

  // Same bits in the runtime stage: every COPY --from=builder appears in both, in order.
  const fromBuilder = (lines) => lines.filter((entry) => entry.line.startsWith('COPY --from=builder')).map((entry) => entry.line);
  if (JSON.stringify(fromBuilder(demoLines)) !== JSON.stringify(fromBuilder(prodLines))) {
    fail(
      'Dockerfile-prd',
      1,
      'docker-twins',
      'The `COPY --from=builder` lines differ between Dockerfile and Dockerfile-prd. The production ' +
        'image must carry exactly the bits the demo image carries (ADR-323).',
    );
  }

  // ADR-323 — the production runtime: one process, port 3000, no supervisor, no tunnel.
  const prodText = prodLines.map((entry) => entry.line).join('\n');
  for (const banned of ['supervisor', 'cloudflared']) {
    if (!new RegExp(banned, 'i').test(prodText)) continue;
    fail('Dockerfile-prd', 1, 'docker-twins', `Dockerfile-prd must not mention \`${banned}\`: the production image is one process (ADR-323).`);
  }
  for (const required of ['EXPOSE 3000', 'PORT=3000', 'PROCESS_SUPERVISED=true', '/sbin/tini', '/api/health/ready']) {
    if (prodText.includes(required)) continue;
    fail('Dockerfile-prd', 1, 'docker-twins', `Dockerfile-prd must contain \`${required}\` (ADR-323).`);
  }
}

/**
 * ADR-315: the API spawns two shell scripts at boot — db-provision.sh for DB_INIT
 * (ADR-249) and db-reset.sh for DB_INIT_RESET=stale (ADR-264) — resolved beside the
 * repository root. The production image copied only the first, so a container booting
 * against a stale schema died with `bash: /app/db-reset.sh: No such file or directory`
 * and crash-looped. Every script dbInit.ts can name must be copied by BOTH Dockerfiles;
 * a checkout always has the files, so only a rule standing in the image's place sees it.
 */
function checkDockerBootScripts() {
  const dbInitPath = 'apps/api/src/db/dbInit.ts';
  let dbInit;
  try {
    dbInit = readFileSync(join(ROOT, dbInitPath), 'utf8');
  } catch {
    fail(dbInitPath, 1, 'docker-boot-scripts', 'Missing apps/api/src/db/dbInit.ts (the boot-script spawner).');
    return;
  }
  const scripts = [...new Set([...dbInit.matchAll(/'([a-z-]+\.sh)'/g)].map((match) => match[1]))];
  if (scripts.length === 0) {
    fail(dbInitPath, 1, 'docker-boot-scripts', 'No boot scripts found in dbInit.ts; this rule has gone stale — update it.');
    return;
  }
  for (const name of ['Dockerfile', 'Dockerfile-prd']) {
    let text;
    try {
      text = readFileSync(join(ROOT, name), 'utf8');
    } catch {
      continue; // checkDockerfileTwins already reports the missing file.
    }
    const copies = text.split('\n').filter((line) => line.trimStart().startsWith('COPY'));
    for (const script of scripts) {
      if (copies.some((line) => line.includes(script))) continue;
      fail(
        name,
        1,
        'docker-boot-scripts',
        `${name} never copies ${script}, but the app spawns it at boot (apps/api/src/db/dbInit.ts). ` +
          'Inside the image that is `No such file or directory`, exit 127, and a crash loop (ADR-315).',
      );
    }
  }

  // ADR-316 — a COPY line cannot copy what the build context excludes. `.dockerignore`
  // ignores `/*.sh` wholesale, so each boot script needs its `!/name` exception there;
  // without one the file never reaches the builder however the Dockerfile reads.
  let ignoreLines = [];
  try {
    ignoreLines = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
  } catch {
    fail('.dockerignore', 1, 'docker-boot-scripts', 'Missing .dockerignore; the boot scripts rely on its exceptions.');
    return;
  }
  if (!ignoreLines.includes('/*.sh')) return; // The wholesale ignore is gone; nothing to exempt from.
  for (const script of scripts) {
    if (ignoreLines.includes(`!/${script}`)) continue;
    fail(
      '.dockerignore',
      1,
      'docker-boot-scripts',
      `.dockerignore ignores /*.sh and never un-ignores ${script}, so it is absent from the build ` +
        'context and no Dockerfile COPY can carry it into the image (ADR-316).',
    );
  }
}

// ── 18. The SHIP-HATS pipeline set is complete, templated, and honest (GREENFIELD.md §9.3, ADR-243)

const SHIPHATS_INERT = [
  '.gitlab-ci.yml.shiphats',
  'BUILD.gitlab-ci.yml.shiphats',
  'TEST.gitlab-ci.yml.shiphats',
  'DEPLOY.gitlab-ci.yml.shiphats',
];
/** What each live file must still reference, once the set has been activated. */
const SHIPHATS_INCLUDES = {
  '.gitlab-ci.yml': ['BUILD.gitlab-ci.yml', 'TEST.gitlab-ci.yml', 'DEPLOY.gitlab-ci.yml'],
  'BUILD.gitlab-ci.yml': [],
  'TEST.gitlab-ci.yml': [],
  'DEPLOY.gitlab-ci.yml': [],
};

function readRootFile(path) {
  try {
    return readFileSync(join(ROOT, path), 'utf8');
  } catch {
    return null;
  }
}

/**
 * The four `*.shiphats` files are what the platform's CI template asks for, kept inert until
 * `./shiphats-activate.sh` answers their placeholders and renames them. Three ways that set rots,
 * and the rule closes all three: one file deleted, because the template needs four and the
 * activator refuses to write a partial one, so the pipeline silently never turns on; a
 * `@@PLACEHOLDER@@` no prompt answers, discovered only by whoever runs the script; and a live
 * file with a placeholder left in it or an include dropped, which fails in a stranger way still.
 * The record doc is required for the same reason the twins are: without it, the reader of the
 * first red pipeline cannot tell what was measured from what was only read from the docs.
 */
function checkShipHatsPipelineSet() {
  const activator = readRootFile('scripts/ship-hats-activate.mjs');
  const inert = SHIPHATS_INERT.map((path) => ({ path, text: readRootFile(path) }));
  if (activator === null && inert.every((entry) => entry.text === null)) return;

  if (activator === null) {
    fail(
      SHIPHATS_INERT[0],
      1,
      'shiphats-pipeline-set',
      'the inert pipeline files exist but scripts/ship-hats-activate.mjs does not — nothing can ' +
        'answer their placeholders, so the set can be read and never turned on (GREENFIELD.md §9.3).',
    );
    return;
  }
  const prompted = new Set([...activator.matchAll(/key: '([A-Z0-9_]+)'/g)].map((m) => m[1]));
  for (const entry of inert) {
    if (entry.text === null) {
      fail(
        entry.path,
        1,
        'shiphats-pipeline-set',
        'missing from the set — the webapp E2E template asks for the root file plus BUILD, TEST and ' +
          'DEPLOY, and the activator refuses to write anything less.',
      );
      continue;
    }
    for (const match of entry.text.matchAll(/@@([A-Z0-9_]+)@@/g)) {
      if (prompted.has(match[1])) continue;
      fail(
        entry.path,
        lineAt(entry.text, match.index),
        'shiphats-pipeline-set',
        `@@${match[1]}@@ has no prompt in the activator's schema — add it to SCHEMA or drop the ` +
          'placeholder; a run would refuse to write this file rather than guess a value.',
      );
    }
  }
  for (const [path, includes] of Object.entries(SHIPHATS_INCLUDES)) {
    const text = readRootFile(path);
    if (text === null) continue;
    for (const match of text.matchAll(/@@[A-Z0-9_]+@@/g)) {
      fail(
        path,
        lineAt(text, match.index),
        'shiphats-pipeline-set',
        'a live pipeline file still carries a placeholder — regenerate it with ./shiphats-activate.sh ' +
          'instead of editing the generated file.',
      );
    }
    for (const local of includes) {
      if (text.includes(`local: ${local}`)) continue;
      fail(
        path,
        1,
        'shiphats-pipeline-set',
        `the root config no longer includes ${local}. The compliance layer keys off the file set, so ` +
          'a live pipeline without it is a pipeline without gates.',
      );
    }
  }
  if (readRootFile('docs/design/ship-hats-pipeline.md') === null) {
    fail(
      SHIPHATS_INERT[0],
      1,
      'shiphats-pipeline-set',
      'the set ships without its record: docs/design/ship-hats-pipeline.md is where the measured, the ' +
        'read-from-docs and the CONFIRM-only are told apart.',
    );
  }
}

// ── 19. The tournament's one-way dependencies (ADR-272) ────────────────────────────────────
/**
 * The scheduler may lean on the core; the core may never lean on the scheduler. The same rule holds
 * one layer out: the API's core adapter (`apps/api/src/tournament/`) never imports the scheduler
 * adapter (`apps/api/src/tournament-scheduler/`) or the scheduler half of the package, and the
 * package itself never imports the app. Only the composition root sees both halves.
 */
const TOURNAMENT_DIRECTIONS = [
  { scope: /^packages\/tournament\/src\/core\//, forbidden: /from '(\.\.\/scheduler|\.\.\/\.\.\/scheduler)|@psd\/tournament\/scheduler/, why: 'the core never imports the scheduler' },
  { scope: /^packages\/tournament\/src\//, forbidden: /from '@psd\/(api|web|contracts)|from '\.\.\/\.\.\/\.\.\/apps/, why: 'the engine package knows nothing of the app' },
  { scope: /^apps\/api\/src\/tournament\//, forbidden: /tournament-scheduler|@psd\/tournament\/scheduler|from '\.\.\/(db\/entities\/(teams|participants)|routes-)/, why: 'the core adapter knows neither the scheduler nor the app\'s people' },
  // ADR-336 — the operating mode is cross-tournament orchestration: it may read the core and the
  // scheduler, and neither may read it back. A core that knew the mode would know what a game is.
  { scope: /^packages\/tournament\/src\/|^apps\/api\/src\/(tournament|tournament-scheduler)\//, forbidden: /tournament-mode/, why: 'the core and the scheduler never import the operating mode' },
];

function checkTournamentDirections(files) {
  for (const file of files) {
    if (isTest(file)) continue;
    for (const rule of TOURNAMENT_DIRECTIONS) {
      if (!rule.scope.test(file.path)) continue;
      const hit = file.text.match(rule.forbidden);
      if (hit) fail(file.path, lineAt(file.text, hit.index ?? 0), 'tournament-direction', `ADR-272: ${rule.why} (${hit[0]}).`);
    }
  }
}

// ── 19. A venue's files belong to that venue (ADR-294) ─────────────────────────────────────
/**
 * `apps/web/src/themes/<id>/` holds everything one venue owns: its palette CSS, scene
 * components and generated art. The rest of the app reaches a venue only through the registry
 * (`themes/index.ts`), the hook, or a role (`<RoleMotif>`), never by importing a venue's file.
 *
 * It is a rule because the convenient thing is to import `themes/sentosa/art/pixelArt.js` straight
 * into a page, and that page then draws Sentosa on the day the deployment is somewhere else —
 * silently, with every test passing, because the default venue IS Sentosa.
 *
 * Allowed importers of `themes/<id>/...`: files inside the same `themes/<id>/`, and the registry
 * `themes/index.ts` (which is how a theme becomes reachable at all).
 */
// A venue directory has files under it; `themes/index.ts` and `themes/types.ts` are shared, not venues.
const THEME_DIR = /^apps\/web\/src\/themes\/([a-z0-9-]+)\/(?=.)/;

function resolvedImports(file) {
  const found = [];
  for (const match of file.text.matchAll(/from '(\.[^']*)'/g)) {
    const target = resolve(dirname(join(ROOT, file.path)), match[1]).replace(/\.js$/, '');
    found.push({
      index: match.index ?? 0,
      path: relative(ROOT, target).split('\\').join('/'),
    });
  }
  return found;
}

function checkVenueIsolation(files) {
  for (const file of files) {
    if (file.path === 'apps/web/src/themes/index.ts') continue;
    const own = THEME_DIR.exec(file.path)?.[1];
    for (const imported of resolvedImports(file)) {
      const target = THEME_DIR.exec(`${imported.path}`)?.[1];
      if (target === undefined || target === own) continue;
      fail(
        file.path,
        lineAt(file.text, imported.index),
        'venue-isolation',
        `ADR-294: ${file.path} imports themes/${target}/ directly. Reach a venue through the registry, useVenueTheme() or a role.`,
      );
    }
  }
}

function checkNoThemesOnStaffSurfaces(files) {
  for (const file of files) {
    const isAdminSurface =
      file.path.startsWith('apps/web/src/routes-facilitator/') ||
      file.path.startsWith('apps/web/src/routes-court/') ||
      file.path.startsWith('apps/web/src/routes-superadmin/') ||
      file.path.startsWith('apps/web/src/components/console/');
    if (!isAdminSurface || isTest(file)) continue;
    for (const imported of resolvedImports(file)) {
      if (imported.path.startsWith('apps/web/src/themes')) {
        fail(
          file.path,
          lineAt(file.text, imported.index),
          'venue-isolation',
          'ADR-294: staff surfaces are not themed by venue — no imports from themes/.',
        );
      }
    }
  }
}

// ── 21. The default run is the shared-safe run (ADR-344) ─────────────────────────────────
/**
 * `playwright test` with no arguments must mean "safe against the shared dev stack" — and must
 * keep meaning it as own-stack suites are added (finding S4: the main config ignored
 * full-event only, while dress-rehearsal and tessensohn had root configs of their own). The
 * contract is structural now:
 *
 *   • the list of own-stack directories lives in ONE place — `OWN_STACK_DIRS` in
 *     `e2e/support/playwrightCommon.ts` — and the default config's `testIgnore` must be
 *     `ownStackIgnore()`, the function that builds the ignore patterns from that list, never a
 *     hand-copied subset of it;
 *   • every `playwright.<name>.config.ts` at the repo root (ADR-170's convention for a
 *     stack-of-its-own suite) must point its `testDir` at a directory in that list.
 *
 * A new own-stack suite that forgets the list therefore fails `npm run standards` instead of
 * silently running against the shared database.
 */
function checkE2eStackCoverage() {
  const registryPath = 'e2e/support/playwrightCommon.ts';
  let registry;
  try {
    registry = readFileSync(join(ROOT, registryPath), 'utf8');
  } catch {
    fail(registryPath, 1, 'e2e-stack-coverage', 'ADR-344: the own-stack registry (OWN_STACK_DIRS) is missing.');
    return;
  }
  const declared = registry.match(/OWN_STACK_DIRS\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';
  const ownDirs = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (ownDirs.length === 0) {
    fail(registryPath, 1, 'e2e-stack-coverage', 'ADR-344: OWN_STACK_DIRS is empty — the default run has no ignore list.');
    return;
  }

  let mainConfig;
  try {
    mainConfig = readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8');
  } catch {
    fail('playwright.config.ts', 1, 'e2e-stack-coverage', 'ADR-344: the default Playwright config is missing.');
    return;
  }
  if (!/testIgnore:\s*ownStackIgnore\(\)/.test(mainConfig)) {
    fail(
      'playwright.config.ts',
      1,
      'e2e-stack-coverage',
      "ADR-344: the default run's testIgnore must be `ownStackIgnore()` — the OWN_STACK_DIRS list, not a hand-copied subset of it.",
    );
  }

  for (const name of readdirSync(ROOT).filter((f) => /^playwright\.[^./]+\.config\.ts$/.test(f)).sort()) {
    const config = readFileSync(join(ROOT, name), 'utf8');
    // './e2e/dress-rehearsal' → 'dress-rehearsal': the segment OWN_STACK_DIRS lists.
    const testDir = config.match(/testDir:\s*'([^']+)'/)?.[1];
    const dir = testDir?.replace(/^\.\//, '').replace(/^e2e\//, '').replace(/\/$/, '');
    if (dir === undefined || !ownDirs.includes(dir)) {
      fail(
        name,
        1,
        'e2e-stack-coverage',
        `e2e/${dir ?? '…'}/ has its own stack config but is not on the default run's ignore list (OWN_STACK_DIRS) — ` +
          `a bare 'playwright test' would run it against the shared stack (S4).`,
      );
    }
  }
}

// ── 22. The day policy, named once (ADR-345) ──────────────────────────────────────────────
/**
 * "Which tournament does this surface mean?" is a two-axis choice — row states (draft / live /
 * closed-started / discarded) × kinds (captain's ball / dumb courts) — and composing it from the
 * `load.ts` finder primitives is how ADR-326's close bug happened: two routes, two compositions,
 * and a dumb-only day whose Close button closed nothing. The choice is made once now, in
 * `apps/api/src/tournament/dayPolicy.ts`, one named function per real policy, matrix-tested in
 * `apps/api/src/tests/tournament-day-policy.test.ts`. `load.ts` keeps the primitives, and
 * `tournament/commands.ts` keeps the adapter's one sanctioned use (inside the engine's
 * transaction, with the kind dynamic). The finder names may appear nowhere else outside tests.
 */
const DAY_FINDER = /\b(?:findOpenTournament|findDayTournament|findDeskTournament|findDeskTournamentAnyKind|liveTournamentOfKind|findDraft)\b/;
const DAY_FINDER_HOMES = /^apps\/api\/src\/tournament\/(?:load|dayPolicy|commands)\.ts$/;

function checkTournamentDayPolicy(files) {
  for (const file of files) {
    if (isTest(file) || DAY_FINDER_HOMES.test(file.path)) continue;
    const hit = DAY_FINDER.exec(file.text);
    if (hit) {
      fail(
        file.path,
        lineAt(file.text, hit.index ?? 0),
        'tournament-day-policy',
        'import the named policy from tournament/dayPolicy.ts, not the finder ' +
          "(S10 — ADR-326's close bug was two routes composing the axes differently).",
      );
    }
  }
}

// ── 23. The tournament write boundary (ADR-346) ──────────────────────────────────────────
/**
 * A tournament write cannot be expressed without its follow-through (S9): after the write
 * commits, the caches void, the day re-plans, the scheduler's rosters freeze and a finished
 * drain closes the bracket (ADR-336 §11) — all of it `afterWrite`, in
 * `routes-tournament/support.ts`. The follow-through used to be a separate `await afterWrite(…)`
 * line that a caller could return without and a new route could skip entirely; S9's own finding
 * was that nothing structural told a route the pair belonged together. `withTournamentWrite`
 * (same file) makes the pair one expression, and this rule keeps the boundary: inside
 * `routes-tournament/`, the token `afterWrite(` may appear only in `support.ts`. Tests stay
 * exempt — `tournament-routes.test.ts` calls it directly, on purpose, to prove the clock.
 */
const AFTER_WRITE = /\bafterWrite\s*\(/;

function checkTournamentAfterWrite(files) {
  for (const file of files) {
    if (isTest(file)) continue;
    if (!file.path.startsWith('apps/api/src/routes-tournament/')) continue;
    if (file.path === 'apps/api/src/routes-tournament/support.ts') continue;
    const hit = AFTER_WRITE.exec(file.text);
    if (hit) {
      fail(
        file.path,
        lineAt(file.text, hit.index ?? 0),
        'tournament-after-write',
        'ADR-346: wrap the write in withTournamentWrite (support.ts) — the follow-through is ' +
          'not a step a caller can forget (S9).',
      );
    }
  }
}

// ── run ────────────────────────────────────────────────────────────────────────────────────
const files = loadSources();
/*
 * Every rule, registered in one place. The checks that need no `files` argument read their own
 * (schema.sql, Dockerfiles, the Playwright configs); JavaScript ignores the extra argument, so
 * they are called uniformly — which is what lets the closing banner count them instead of
 * hardcoding "20 rules", a literal that had already drifted (two checks share the venue-
 * isolation rule id, and rule 21 was about to make it lie by one more).
 */
const CHECKS = [
  checkNoHandWrittenMappers,
  checkNoHardDeletes,
  checkIdMinting,
  checkComponentHookSplit,
  checkJsxPurity,
  checkTestIds,
  checkThemeSeparation,
  checkStorageOwnership,
  checkCopyOwnership,
  checkFlagArguments,
  checkSchemaSingleSource,
  checkNoCycles,
  checkPushPairing,
  checkScreenIsUntouchable,
  checkWorkerKnowsNoApi,
  checkMembershipVoid,
  checkDetachedPromises,
  checkDockerfileTwins,
  checkDockerBootScripts,
  checkShipHatsPipelineSet,
  checkTournamentDirections,
  checkVenueIsolation,
  checkNoThemesOnStaffSurfaces,
  checkE2eStackCoverage,
  checkTournamentDayPolicy,
  checkTournamentAfterWrite,
];
for (const check of CHECKS) check(files);

if (violations.length > 0) {
  const byRule = new Map();
  for (const item of violations) byRule.set(item.rule, (byRule.get(item.rule) ?? 0) + 1);
  for (const item of violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    process.stdout.write(`${item.file}:${item.line}  ${item.rule}  ${item.message}\n`);
  }
  process.stdout.write(
    `\n${violations.length} standards violation(s): ${[...byRule].map(([rule, count]) => `${rule} ×${count}`).join(', ')}\n`,
  );
  process.exit(1);
}

process.stdout.write(`standards: ${files.length} files checked, ${CHECKS.length} checks, 0 violations\n`);
