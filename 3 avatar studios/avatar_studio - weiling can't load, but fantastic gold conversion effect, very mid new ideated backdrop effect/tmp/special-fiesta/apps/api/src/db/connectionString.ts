/**
 * ADR-251 — say what is wrong with a connection string without saying what it is.
 *
 * The failure this exists for: a platform variable reference that did not resolve reached `pg` as
 * the literal text `${NAME}`, and the boot died inside the driver with `TypeError: Invalid URL`,
 * `input: '*****REDACTED*****'` and 47 lines of Drizzle's query text. Nothing in that log said
 * "your DATABASE_URL is not a URL", let alone which of five usual causes it was.
 *
 * Everything returned here is safe to log. The value is never echoed: a connection string carries
 * a password, and a malformed one may be nothing BUT a password (a bare secret pasted without its
 * scheme). The only pieces ever quoted are ones that cannot be secret by construction — the scheme
 * of a URL that has one, and the text of an unresolved `${...}` reference, which is a variable's
 * NAME, not its value.
 *
 * A leaf module on purpose: `env.ts` imports it to refuse a bad URL at startup, and `env.ts` must
 * not depend on anything that depends on `env.ts`.
 */

const UNRESOLVED_REFERENCE = /\$\{[^}]*\}|\$\([^)]*\)|\{\{[^}]*\}\}/;
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const ACCEPTED_SCHEMES = new Set(['postgres', 'postgresql']);
const MIN_SECRET_LENGTH = 4;
const PASSWORD_MASK = '***';

function unresolvedReferenceProblem(match: string): string {
  return (
    `contains the unresolved reference ${match}. The platform did not substitute it, which means ` +
    'this service has no variable by that name: link the secret group or add-on to the service, ' +
    'and check the name for a typo.'
  );
}

function schemeProblem(raw: string): string | null {
  const scheme = SCHEME.exec(raw)?.[1];
  if (scheme === undefined) {
    return (
      `has no "postgresql://" prefix (the value is ${raw.length} characters long). Check that the ` +
      'variable holds the whole connection URI and not just a host or a password.'
    );
  }
  if (!ACCEPTED_SCHEMES.has(scheme.toLowerCase())) {
    return `uses the scheme "${scheme}://" but this app speaks to PostgreSQL: expected postgresql:// or postgres://.`;
  }
  return null;
}

function parseProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return (
      'cannot be parsed as a URL. The usual cause is a special character in the password ' +
      '(@ : / ? # % [ ]) that has to be percent-encoded: @ is %40, # is %23, / is %2F.'
    );
  }
  if (url.hostname === '') return 'has no host name after the credentials.';
  try {
    decodeURIComponent(url.password);
  } catch {
    return 'has a malformed % escape in the password: a literal % must be written %25.';
  }
  return null;
}

export interface NormalisedConnection {
  url: string;
  /** Hosts dropped from a multi-host list; 0 for an ordinary URL. */
  extraHosts: number;
}

/**
 * A libpq multi-host URI — `postgresql://u:p@primary:5432,replica:5432/db` — reduced to its first
 * host. Managed platforms (Northflank, among others) hand out exactly this shape, primary first and
 * read replica after. libpq accepts it; Node's URL parser does not (the "port" `5432,replica` is
 * not a number), so `pg` dies with `ERR_INVALID_URL` before it connects. The first host is the
 * primary, which is the right one for an app that writes. Anything that is not a multi-host
 * postgres URL comes back untouched.
 */
export function normaliseConnectionString(raw: string): NormalisedConnection {
  if (!/^postgres(ql)?:\/\//i.test(raw)) return { url: raw, extraHosts: 0 };
  const authorityStart = raw.indexOf('//') + 2;
  const terminator = /[/?#]/.exec(raw.slice(authorityStart));
  const authorityEnd = terminator ? authorityStart + terminator.index : raw.length;
  const authority = raw.slice(authorityStart, authorityEnd);
  const hostsStart = authorityStart + authority.lastIndexOf('@') + 1;
  const hosts = raw.slice(hostsStart, authorityEnd).split(',');
  if (hosts.length < 2) return { url: raw, extraHosts: 0 };
  const firstHostEnd = hostsStart + raw.slice(hostsStart).indexOf(',');
  return { url: raw.slice(0, firstHostEnd) + raw.slice(authorityEnd), extraHosts: hosts.length - 1 };
}

/** A sentence completing "DATABASE_URL …", or null when the value is structurally usable. */
export function diagnoseConnectionString(rawValue: string): string | null {
  const raw = normaliseConnectionString(rawValue).url;
  if (raw.trim() === '') return 'is blank.';
  const reference = UNRESOLVED_REFERENCE.exec(raw)?.[0];
  if (reference !== undefined) return unresolvedReferenceProblem(reference);
  if (raw !== raw.trim()) {
    return `has ${raw.length - raw.trim().length} characters of leading or trailing whitespace or a newline: remove them.`;
  }
  if (/^(["']).*\1$/.test(raw)) return 'is wrapped in quotes that are part of the value: remove them.';
  return schemeProblem(raw) ?? parseProblem(raw);
}

/** `sslmode` as the URL states it, or null. Safe to log: it is a mode name, not a credential. */
export function sslModeOf(raw: string): string | null {
  try {
    return new URL(normaliseConnectionString(raw).url).searchParams.get('sslmode');
  } catch {
    return null;
  }
}

/** Every string that must never reach a log if it turns up in an error message. */
export function secretsFrom(raw: string): string[] {
  const secrets = [raw];
  try {
    const { password } = new URL(normaliseConnectionString(raw).url);
    if (password) secrets.push(password, decodeURIComponent(password));
  } catch {
    // An unparseable value is still a secret as a whole, which is already in the list.
  }
  return secrets.filter((secret) => secret.length >= MIN_SECRET_LENGTH);
}

/** The URLs on a command line, whether bare or the value of `--url`. */
export function connectionStringsIn(argv: readonly string[]): string[] {
  return argv.filter((arg) => /^postgres(ql)?:\/\//i.test(arg));
}

/**
 * Masks the given secrets, and any `scheme://user:password@` it recognises beyond them — a driver
 * may print a URL this process never held, such as one a redirect or a pooler rewrote.
 */
export function redact(text: string, secrets: readonly string[]): string {
  const masked = secrets
    .filter((secret) => secret.length >= MIN_SECRET_LENGTH)
    .reduce((out, secret) => out.replaceAll(secret, PASSWORD_MASK), text);
  return masked.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s@]+:)[^@\s]+@/gi, `$1${PASSWORD_MASK}@`);
}
