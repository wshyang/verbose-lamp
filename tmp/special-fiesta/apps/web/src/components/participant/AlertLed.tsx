/**
 * ADR-063 — the dot on something that needs attention.
 *
 * A dot, not a count: one unread message and a hundred both mean "look in here", and a boolean
 * cannot disagree between two surfaces the way a number can. The visually-hidden text is not
 * optional — a bare coloured circle says nothing to a screen reader, and nothing to anyone who
 * cannot pick the colour out.
 *
 * ADR-125 — extracted from `GameboyShell` when the gallery got an LED of its own, because the
 * Social tab's segmented control needed the identical thing and a second copy of a dot is a
 * second chance for one of them to lose its label.
 */
export function AlertLed(props: { show: boolean; label: string }) {
  if (!props.show) return null;
  return (
    <span className="gb-nav-led" data-testid="gameboy-shell__nav-alert">
      <span className="visually-hidden">{props.label}</span>
    </span>
  );
}
