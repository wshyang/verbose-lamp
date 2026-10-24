/**
 * ADR-029 — what a staff console shows before its first answer arrives.
 *
 * The court console used to open on "At least 2 teams must exist before a match can
 * start" with empty pickers, while five teams existed and a match was live on that
 * court; the fringe station opened on a disabled "Open round 1" while round 1 was open
 * with fourteen scans. Both were the empty state of data that had not loaded yet. A
 * marshal glancing at a tablet in sunlight reads the wrong thing and walks to the ops
 * desk, so the honest answer goes here instead.
 */
export function LoadingPanel(props: { title: string; testId: string }) {
  return (
    <section className="console-panel" data-testid={props.testId}>
      <h2>{props.title}</h2>
      <p className="console-muted">Loading…</p>
    </section>
  );
}
