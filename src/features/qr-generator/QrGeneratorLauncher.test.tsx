// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QrGeneratorLauncher } from './QrGeneratorLauncher';

vi.mock('./QrGeneratorModal', () => ({
  QrGeneratorModal: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    open ? <button type="button" onClick={onClose}>Modal mock</button> : null
  ),
}));

describe('QrGeneratorLauncher', () => {
  it('owns modal open state and accepts a class override', async () => {
    const user = userEvent.setup();
    render(<QrGeneratorLauncher className="header-action" />);
    expect(screen.getByTestId('qr-generator__launch').className).toContain('header-action');
    await user.click(screen.getByTestId('qr-generator__launch'));
    expect(screen.getByText('Modal mock')).toBeTruthy();
    await user.click(screen.getByText('Modal mock'));
    expect(screen.queryByText('Modal mock')).toBeNull();
  });

  it('renders without a class override', () => {
    render(<QrGeneratorLauncher />);
    expect(screen.getByText('Golden QR')).toBeTruthy();
  });
});
