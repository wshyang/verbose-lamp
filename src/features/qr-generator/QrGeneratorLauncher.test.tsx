// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { QrGeneratorLauncher } from './QrGeneratorLauncher';

setupDomTests();

/**
 * The launcher owns the modal's open state, so the header only ever has to render one
 * element. These cases pin that hand-off, including closing from inside the modal.
 */
describe('QrGeneratorLauncher', () => {
  it('starts closed and opens the golden QR modal on click', () => {
    render(<QrGeneratorLauncher />);

    const launch = screen.getByTestId('qr-generator__launch');
    expect(launch.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(launch);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes again from the modal', () => {
    render(<QrGeneratorLauncher />);

    fireEvent.click(screen.getByTestId('qr-generator__launch'));
    fireEvent.click(screen.getByTestId('qr-generator__close'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('passes a caller class through to the header button', () => {
    render(<QrGeneratorLauncher className="mr-2" />);

    expect(screen.getByTestId('qr-generator__launch').className).toContain('mr-2');
  });
});
