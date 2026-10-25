// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const root = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn() }));
const createRoot = vi.hoisted(() => vi.fn(() => root));

vi.mock('react-dom/client', () => ({ createRoot }));
vi.mock('./App', () => ({ default: () => null }));
vi.mock('./index.css', () => ({}));

beforeEach(() => {
  createRoot.mockClear();
  root.render.mockClear();
});

describe('main', () => {
  it('mounts the app into the root element inside StrictMode', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main');
    const element = document.getElementById('root');
    expect(createRoot).toHaveBeenCalledWith(element);
    expect(root.render).toHaveBeenCalledTimes(1);
  });
});
