export interface NavItem {
  id: string;
  emoji: string;
  label: string;
}

export type NavValidation =
  | { ok: true; items: readonly NavItem[] }
  | { ok: false; issues: readonly string[] };

export function validateNavItems(items: readonly NavItem[]): NavValidation {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id || seen.has(item.id)) issues.push(`Duplicate or empty id "${item.id}".`);
    seen.add(item.id);
    if (!item.label.trim()) issues.push(`Item "${item.id}" needs a label.`);
    if (item.label.length > 14) issues.push(`"${item.label}" exceeds 14 characters.`);
  }
  if (items.length < 2 || items.length > 5) issues.push('A bottom bar takes 2–5 items.');
  return issues.length ? { ok: false, issues } : { ok: true, items };
}

/** Editable "emoji,label" lines → nav items. First grapheme is the glyph. */
export function parseNavLines(text: string): readonly NavItem[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      const comma = line.indexOf(',');
      const emoji = comma === -1 ? line : line.slice(0, comma).trim();
      const label = comma === -1 ? '' : line.slice(comma + 1).trim();
      return {
        id: `nav-${i}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'item'}`,
        emoji: [...emoji][0] ?? '✦',
        label,
      };
    });
}

/** The highlighted item: the requested id if it is in the bar, else the first item. */
export function resolveActiveId(items: readonly NavItem[], activeId: string): string {
  const isPresent = items.some((item) => item.id === activeId);
  return isPresent ? activeId : items[0]?.id ?? '';
}
