import { cloneElement, type ReactElement } from 'react';
import type { FieldHelpTopic } from '@psd/contracts';
import { useFieldHelp } from '../../lib/hooks/useFieldHelp.js';
import { FieldHelp } from './FieldHelp.js';

/**
 * ADR-319 — a labelled console control with its (i). The label and the icon are siblings and the
 * control follows, rather than the label wrapping the control as the hand-rolled forms did: a
 * button inside a `<label>` would also fire the label's control. The field hands its single child
 * the `id` the label points at and the `aria-describedby` that points at the tooltip, so a control
 * cannot be left without either.
 */

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
}

interface FieldProps {
  id: string;
  label: string;
  topic: FieldHelpTopic;
  children: ReactElement<ControlProps>;
}

export function ConsoleField(props: FieldProps) {
  const help = useFieldHelp();
  return (
    <div className="console-field" data-testid="console-field">
      <div className="console-field__head">
        <label className="console-label" htmlFor={props.id}>
          {props.label}
        </label>
        <FieldHelp label={props.label} topic={props.topic} help={help} />
      </div>
      {cloneElement(props.children, { id: props.id, 'aria-describedby': help.tooltipId })}
    </div>
  );
}

/** A checkbox: the box, its label, then the (i). */
export function CheckField(props: FieldProps) {
  const help = useFieldHelp();
  return (
    <div className="console-row console-field--check" data-testid="console-field">
      {cloneElement(props.children, { id: props.id, 'aria-describedby': help.tooltipId })}
      <label htmlFor={props.id}>{props.label}</label>
      <FieldHelp label={props.label} topic={props.topic} help={help} />
    </div>
  );
}
