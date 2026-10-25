/**
 * Pure filename stemming for downloads, kept apart from `export.ts` (the thin
 * DOM download wrappers) so it stays unit-testable in node (ADDENDUM-029).
 */
export function toSafeFileStem(label: string, fallback = 'golden-qr'): string {
  const stem = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return stem.length > 0 ? stem : fallback;
}
