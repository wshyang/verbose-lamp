import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fieldHelp } from '@psd/contracts';
import { CheckField, ConsoleField } from './ConsoleField.js';

/**
 * ADR-319 — the (i) beside a field's label. jsdom applies no stylesheet, so what this proves is the
 * wiring: the icon opens and closes the tooltip on hover, focus and press; the control it describes
 * points at it with `aria-describedby`; the label still names the control. Whether the tooltip is
 * actually *seen* is the Playwright spec's job (AGENTS-testing §1.1).
 */

function Subject() {
  return (
    <ConsoleField id="subject" label="Win points" topic="setupWinPoints">
      <input className="console-input" data-testid="subject__input" />
    </ConsoleField>
  );
}

describe('ConsoleField', () => {
  it('keeps the label naming its control, with the icon outside the label', () => {
    render(<Subject />);
    const input = screen.getByLabelText('Win points');
    expect(input).toBe(screen.getByTestId('subject__input'));
    expect(screen.getByText('Win points').closest('label')).not.toContainElement(screen.getByTestId('field-help__trigger'));
  });

  it('points the control at a tooltip that carries the topic’s copy', () => {
    render(<Subject />);
    const input = screen.getByTestId('subject__input');
    const tooltip = screen.getByTestId('field-help__tooltip');
    expect(input).toHaveAttribute('aria-describedby', tooltip.id);
    expect(tooltip).toHaveAttribute('role', 'tooltip');
    expect(tooltip).toHaveTextContent(fieldHelp.setupWinPoints);
  });

  it('names the icon for what it explains', () => {
    render(<Subject />);
    expect(screen.getByTestId('field-help__trigger')).toHaveAccessibleName('Help: Win points');
  });

  it('is hidden until asked, shown on hover and gone when the pointer leaves', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const trigger = screen.getByTestId('field-help__trigger');
    const tooltip = screen.getByTestId('field-help__tooltip');
    expect(tooltip).not.toBeVisible();
    await user.hover(trigger);
    expect(tooltip).toBeVisible();
    await user.unhover(trigger);
    expect(tooltip).not.toBeVisible();
  });

  it('is shown on keyboard focus and gone when focus moves on', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    const tooltip = screen.getByTestId('field-help__tooltip');
    await user.tab();
    expect(screen.getByTestId('field-help__trigger')).toHaveFocus();
    expect(tooltip).toBeVisible();
    await user.tab();
    expect(screen.getByTestId('subject__input')).toHaveFocus();
    expect(tooltip).not.toBeVisible();
  });

  it('a press holds it open past the pointer leaving; a press elsewhere closes it', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Subject />
        <button type="button" data-testid="elsewhere">
          elsewhere
        </button>
      </div>,
    );
    const trigger = screen.getByTestId('field-help__trigger');
    const tooltip = screen.getByTestId('field-help__tooltip');
    await user.click(trigger);
    await user.unhover(trigger);
    expect(tooltip).toBeVisible();
    await user.click(screen.getByTestId('elsewhere'));
    expect(tooltip).not.toBeVisible();
  });

  it('Escape closes it', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    await user.click(screen.getByTestId('field-help__trigger'));
    expect(screen.getByTestId('field-help__tooltip')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('field-help__tooltip')).not.toBeVisible();
  });

  it('pressing the icon does not change the field it describes', async () => {
    const user = userEvent.setup();
    render(<Subject />);
    await user.type(screen.getByTestId('subject__input'), 'abc');
    await user.click(screen.getByTestId('field-help__trigger'));
    expect(screen.getByTestId('subject__input')).toHaveValue('abc');
  });
});

describe('CheckField', () => {
  it('labels a checkbox, with the icon beside it rather than inside the label', async () => {
    const user = userEvent.setup();
    render(
      <CheckField id="third" label="Third-place match" topic="setupThirdPlace">
        <input type="checkbox" data-testid="third__box" />
      </CheckField>,
    );
    const box = screen.getByLabelText('Third-place match');
    expect(box).toHaveAttribute('aria-describedby', screen.getByTestId('field-help__tooltip').id);
    await user.click(screen.getByTestId('field-help__trigger'));
    expect(box).not.toBeChecked();
  });
});
