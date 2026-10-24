import { expect } from 'vitest';

/**
 * ADR-322 — the generic field-help walk, shared: every editable field in the rendered root
 * must carry an `aria-describedby` that resolves to a tooltip with a real sentence. A field
 * added without help fails the walk rather than shipping bare (ADR-319's rule, every surface).
 */
export function expectEveryFieldDescribed(root: HTMLElement, expectedAtLeast: number): void {
  const fields = Array.from(root.querySelectorAll<HTMLElement>('input, select, textarea')).filter(
    (field) => field.getAttribute('type') !== 'hidden',
  );
  expect(fields.length).toBeGreaterThanOrEqual(expectedAtLeast);
  for (const field of fields) {
    const name = field.getAttribute('data-testid') ?? field.id ?? field.tagName;
    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy, `${name} has no aria-describedby`).not.toBeNull();
    const tooltip = (describedBy ?? '')
      .split(' ')
      .map((id) => document.getElementById(id))
      .find((node) => node?.getAttribute('role') === 'tooltip');
    expect(tooltip, `${name}: aria-describedby does not resolve to a tooltip`).toBeTruthy();
    expect(tooltip?.textContent?.trim().length ?? 0, `${name}: the tooltip is empty`).toBeGreaterThan(20);
  }
}
