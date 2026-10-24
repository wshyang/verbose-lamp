import { fieldHelp, type FieldHelpTopic } from '@psd/contracts';
import type { useFieldHelp } from '../../lib/hooks/useFieldHelp.js';

/**
 * ADR-319 — the (i) beside a field's label and the tooltip it opens. Presentation only: the owner of
 * the field calls `useFieldHelp()` (it needs the tooltip's id to point the control at it) and hands
 * the result in. The tooltip is always in the document and shown by toggling `hidden`, so the
 * control's `aria-describedby` resolves whether or not it is open.
 */
export function FieldHelp(props: { label: string; topic: FieldHelpTopic; help: ReturnType<typeof useFieldHelp> }) {
  const { help } = props;
  return (
    <span className="console-help-wrap" ref={help.field}>
      <button type="button" className="console-help" aria-label={`Help: ${props.label}`} data-testid="field-help__trigger" {...help.handlers}>
        i
      </button>
      <span
        id={help.tooltipId}
        role="tooltip"
        className="console-tooltip"
        hidden={!help.isOpen}
        ref={help.tooltip}
        style={{ transform: `translateX(${help.shift}px)` }}
        data-testid="field-help__tooltip"
      >
        {fieldHelp[props.topic]}
      </span>
    </span>
  );
}
