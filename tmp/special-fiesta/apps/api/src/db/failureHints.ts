import { redact } from './connectionString.js';

/**
 * ADR-251 — turn a driver's exception into the sentence an operator needs.
 *
 * Drizzle wraps a driver error in one whose message is the whole failed SQL, and `pg` reports a
 * refused connection as an `AggregateError` with an empty message, so the useful part — the
 * errno, the SQLSTATE, the one-line reason — is several `.cause`s down. This walks the chain,
 * recognises the failures a managed-Postgres deployment actually produces, and says what to
 * check. It never prints more than the first line of any message: the long ones are SQL text.
 */

const MAX_LINE = 700;
const MAX_FULL = 4000;
const MAX_DEPTH = 8;
const SQL_DUMP = /^Failed query:/;

export interface ChainLink {
  name: string;
  code: string | null;
  /** First line only: enough to identify the link in a chain. */
  message: string;
  /** The whole message, kept because some are multi-line instructions an operator must read. */
  full: string;
}

function whole(text: string): string {
  return text.length > MAX_FULL ? `${text.slice(0, MAX_FULL)}…` : text.trim();
}

function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim() !== '') ?? '';
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line.trim();
}

function codeOf(error: Error): string | null {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : null;
}

function nextLinks(error: Error): unknown[] {
  const inner = (error as { errors?: unknown }).errors;
  if (Array.isArray(inner) && inner.length > 0) return inner;
  return [(error as { cause?: unknown }).cause];
}

/** The error and everything it wraps, outermost first. Follows AggregateError into its first member. */
export function causeChain(error: unknown): ChainLink[] {
  const chain: ChainLink[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (chain.length < MAX_DEPTH && !seen.has(current)) {
    seen.add(current);
    if (!(current instanceof Error)) {
      if (current !== undefined && current !== null) {
        const text = String(current);
        chain.push({ name: 'thrown', code: null, message: firstLine(text), full: whole(text) });
      }
      break;
    }
    chain.push({
      name: current.name,
      code: codeOf(current),
      message: firstLine(current.message),
      full: whole(current.message),
    });
    current = nextLinks(current)[0];
  }
  return chain;
}

interface Hint {
  matches: (link: ChainLink) => boolean;
  advice: string;
}

const has = (pattern: RegExp) => (link: ChainLink) => pattern.test(link.message);
const code = (...codes: string[]) => (link: ChainLink) => link.code !== null && codes.includes(link.code);

/** Ordered: the first hint that matches any link wins, so the specific ones come first. */
const HINTS: readonly Hint[] = [
  {
    matches: code('ERR_INVALID_URL'),
    advice:
      'DATABASE_URL is not a valid URL. Check that any ${...} reference was substituted by the ' +
      'platform, that the value has no quotes or whitespace, and that special characters in the ' +
      'password are percent-encoded.',
  },
  {
    matches: code('28P01'),
    advice:
      'The server rejected the password. Check that the credential has not been rotated and that ' +
      'DATABASE_URL points at the current secret, not a stale copy of it.',
  },
  {
    matches: code('3D000'),
    advice: 'The database named in the URL does not exist on that server. Create it, or fix the path.',
  },
  {
    matches: has(/self[- ]signed certificate|unable to verify the first certificate|certificate has expired/i),
    advice:
      "The server's TLS certificate is not trusted by this container. Use the provider's CA, or " +
      'add ?sslmode=no-verify to the URL to accept it unverified (encrypted, but not authenticated).',
  },
  {
    matches: has(/does not support SSL|SSL\/TLS required|SSL connection is required|no encryption/i),
    advice: 'TLS mismatch. Add ?sslmode=require to DATABASE_URL if the server demands it, or drop it if not.',
  },
  {
    matches: has(/no pg_hba\.conf entry/i),
    advice:
      'The server has no rule allowing this client. That is usually an IP allow-list, or a server ' +
      'that requires TLS: try ?sslmode=require, and check the database allows this service.',
  },
  {
    matches: code('57P03'),
    advice: 'The database is still starting up. This resolves itself; the orchestrator will restart the app.',
  },
  {
    matches: code('53300'),
    advice: 'The server has no free connection slots. Fewer instances, or a smaller pool, or a bigger plan.',
  },
  {
    matches: code('42501'),
    advice:
      'This role lacks a privilege. To build the schema it needs CREATE on schema public: ' +
      'GRANT USAGE, CREATE ON SCHEMA public TO "role", or run ./db-provision.sh with an admin ' +
      'connection string and --grant-to the app role.',
  },
  {
    matches: code('42P01'),
    advice: 'A table is missing, so the schema is not (fully) provisioned. Set DB_INIT=schema, or run ./db-provision.sh.',
  },
  {
    matches: code('ENOTFOUND', 'EAI_AGAIN'),
    advice:
      'The host name did not resolve. Check its spelling; inside a platform, use the database ' +
      "add-on's internal host name rather than the public one.",
  },
  {
    matches: code('ETIMEDOUT'),
    advice:
      'The connection timed out or was cut. Look for a firewall, a network policy or an IP ' +
      'allow-list between this service and the database, or a wrong host or port.',
  },
  {
    matches: code('ECONNREFUSED'),
    advice:
      'Nothing is listening at that host and port. Check both in DATABASE_URL, that the database ' +
      'is running, and that this service may reach it.',
  },
  {
    matches: code('ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'),
    advice:
      'The connection was cut or the host is unreachable. Look for a firewall, a network policy ' +
      'or an IP allow-list between this service and the database.',
  },
];

const TRANSIENT_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', '57P03', '53300']);

/** A failure the passage of time can cure — a database still starting — as opposed to a wrong setting. */
export function isTransientConnectionError(error: unknown): boolean {
  return causeChain(error).some((link) => link.code !== null && TRANSIENT_CODES.has(link.code));
}

export function hintFor(error: unknown): string | null {
  const chain = causeChain(error);
  for (const hint of HINTS) {
    if (chain.some(hint.matches)) return hint.advice;
  }
  return null;
}

function labelOf(link: ChainLink): string {
  return link.code ? `${link.name}[${link.code}]` : link.name;
}

function renderLink(link: ChainLink): string {
  return link.message ? `${labelOf(link)}: ${link.message}` : labelOf(link);
}

/** A few words for a retry log line: the errno or SQLSTATE if there is one, else the message. */
export function summaryOf(error: unknown): string {
  const reasons = causeChain(error).filter((link) => link.message !== '' || link.code !== null);
  const deepest = reasons[reasons.length - 1];
  if (!deepest) return 'unknown error';
  return [deepest.code, deepest.message].filter(Boolean).join(' ');
}

/**
 * Drizzle's "Failed query" message is the whole SQL statement, which says nothing about why it
 * failed; every other message is printed whole, because several are multi-line instructions.
 */
function reasonText(link: ChainLink): string {
  // Only called for a link with a message, so `text` is never empty.
  return `${labelOf(link)}: ${SQL_DUMP.test(link.full) ? link.message : link.full}`;
}

/**
 * The multi-line report: the deepest reason, the chain it came from, and what to check. Run
 * through `redact`, because an error message is the one place a connection string can leak.
 */
export function describeFailure(error: unknown, secrets: readonly string[] = []): string {
  const chain = causeChain(error);
  const reasons = chain.filter((link) => link.message !== '');
  const deepest = reasons[reasons.length - 1];
  const lines = [`reason: ${deepest ? reasonText(deepest) : 'unknown error'}`];
  if (chain.length > 1) lines.push(`chain:  ${chain.map(renderLink).join(' > ')}`);
  const hint = hintFor(error);
  if (hint) lines.push(`check:  ${hint}`);
  return redact(lines.join('\n'), secrets);
}
