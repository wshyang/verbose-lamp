/**
 * 4-digit PIN entry. `inputMode="numeric"` gets the phone keypad on a beach; the value is
 * clamped to digits here because the component owns input shaping, not the rule (the rule
 * lives in the contracts schema).
 *
 * ADR-027 — `autoComplete` is a required prop, and never "off". This is an app whose PIN
 * recovery path is "find a facilitator"; refusing to let the browser remember the
 * credential was sending people to that queue for no reason.
 */
const PIN_LENGTH = 4;

export function PinField(props: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  testId: string;
  id: string;
  autoComplete: 'current-password' | 'new-password';
  inputRef?: React.RefObject<HTMLInputElement | null> | undefined;
  autoFocus?: boolean | undefined;
  /**
   * ADR-085 — called the moment a fourth digit lands, for a surface where the PIN is the last thing
   * asked for. Opt-in: sign-up asks for a cluster and an avatar after this, so submitting there
   * would send a half-filled form. Sign-in passes it and saves the participant a tap.
   */
  onComplete?: ((pin: string) => void) | undefined;
}) {
  return (
    <label className="gb-label" htmlFor={props.id}>
      {props.label}
      <input
        id={props.id}
        ref={props.inputRef}
        name="pin"
        className="gb-input"
        data-testid={props.testId}
        type="password"
        inputMode="numeric"
        autoComplete={props.autoComplete}
        maxLength={4}
        value={props.value}
        autoFocus={props.autoFocus}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
          props.onChange(digits);
          // Only on the transition INTO a full PIN. Firing whenever the value is already four
          // digits long would re-submit on every keystroke a full field swallows.
          if (digits.length === PIN_LENGTH && props.value.length < PIN_LENGTH) props.onComplete?.(digits);
        }}
      />
    </label>
  );
}
