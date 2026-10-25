export interface LuckyDrawEntry {
  id: string;
  name: string;
  subtitle?: string;
}

export type EntryValidation =
  | { ok: true; entries: readonly LuckyDrawEntry[] }
  | { ok: false; issues: readonly string[] };

function normalize(entry: LuckyDrawEntry): LuckyDrawEntry {
  return {
    id: entry.id.trim(),
    name: entry.name.trim().replace(/\s+/g, ' '),
    subtitle: entry.subtitle?.trim() || undefined,
  };
}

/** Never throws; reports every issue at once (ADDENDUM-020 §3.7). */
export function validateEntries(raw: readonly LuckyDrawEntry[]): EntryValidation {
  const issues: string[] = [];
  const seen = new Set<string>();
  const entries = raw.map(normalize);
  for (const e of entries) {
    if (!e.id) issues.push('An entry is missing its id.');
    if (seen.has(e.id)) issues.push(`Duplicate entry id "${e.id}".`);
    seen.add(e.id);
    if (!e.name) issues.push(`Entry "${e.id}" has an empty name.`);
    if (e.name.length > 60) issues.push(`Entry "${e.id}" exceeds 60 characters.`);
  }
  if (entries.length < 2) issues.push('A draw needs at least two guests.');
  return issues.length > 0 ? { ok: false, issues } : { ok: true, entries };
}

export function withoutWinners(
  entries: readonly LuckyDrawEntry[],
  winnerIds: readonly string[],
): readonly LuckyDrawEntry[] {
  const excluded = new Set(winnerIds);
  return entries.filter((e) => !excluded.has(e.id));
}