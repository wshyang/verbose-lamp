// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./app/DemoHost', () => ({ DemoHost: () => <main data-testid="demo-host__root" /> }));

describe('App', () => {
  it('mounts the demo host as the application shell', () => {
    render(<App />);
    expect(screen.getByTestId('demo-host__root')).toBeDefined();
  });
});
