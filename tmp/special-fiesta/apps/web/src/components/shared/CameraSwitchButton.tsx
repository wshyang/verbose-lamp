/**
 * ADR-184 — "Switch camera", for when the browser opened the wrong lens.
 *
 * It renders nothing when there is only one camera, which is both the common case and the one
 * where the control would be a lie. On every multi-camera device it is always visible rather
 * than appearing after a failure, because the failure it fixes is silent: `facingMode` is an
 * *ideal* constraint, so a browser that hands back the front lens for `'environment'` reports
 * complete success. There is no error to hang the control off — only a marshal looking at their
 * own face, who needs the fix to be already on screen.
 *
 * The label names the position rather than relying on the browser's device label, which is
 * empty before permission and frequently useless after it.
 */
export function CameraSwitchButton(props: {
  label: string;
  onSwitch: (() => void) | null;
  className: string;
  testId: string;
}) {
  if (props.onSwitch === null) return null;
  return (
    <button
      type="button"
      className={props.className}
      data-testid={props.testId}
      // The visible text is short enough for a thumb; the full label goes to screen readers
      // and to anyone who hovers, since it can run to a model number and a bus id.
      title={props.label}
      aria-label={`Switch camera. Currently ${props.label}`}
      onClick={props.onSwitch}
    >
      Switch camera
    </button>
  );
}
