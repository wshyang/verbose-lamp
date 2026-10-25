// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const root = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn() }));

vi.mock('react-dom/client', () => ({
  createRoot: root.createRoot.mockReturnValue({ render: root.render }),
}));
vi.mock('./App', () => ({ default: () => <div>App mock</div> }));

describe('main entry point', () => {
  it('mounts App in StrictMode at the root element', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./main');
    expect(root.createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(root.render).toHaveBeenCalledOnce();
  });
});
