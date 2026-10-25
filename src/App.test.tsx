// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./app/DemoHost', () => ({ DemoHost: () => <div>Demo host mock</div> }));

describe('App', () => {
  it('renders the demo host', () => {
    render(<App />);
    expect(screen.getByText('Demo host mock')).toBeTruthy();
  });
});
