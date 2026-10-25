// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { forwardStageClick } from './forwardStageClick';

function click(target: Element, stage: HTMLElement, at = { clientX: 40, clientY: 25 }) {
  return { currentTarget: stage, target, ...at };
}

describe('forwardStageClick', () => {
  it('forwards a click on the stage itself, with its position', () => {
    const stage = document.createElement('main');
    const onStageClick = vi.fn();

    forwardStageClick(click(stage, stage), onStageClick);

    expect(onStageClick).toHaveBeenCalledWith(40, 25);
  });

  it('forwards a click on something drawn inside the stage', () => {
    const stage = document.createElement('main');
    const child = stage.appendChild(document.createElement('button'));
    const onStageClick = vi.fn();

    forwardStageClick(click(child, stage), onStageClick);

    expect(onStageClick).toHaveBeenCalledTimes(1);
  });

  it('ignores a click on something portalled elsewhere in the document', () => {
    const stage = document.body.appendChild(document.createElement('main'));
    const panel = document.body.appendChild(document.createElement('aside'));
    const onStageClick = vi.fn();

    forwardStageClick(click(panel, stage), onStageClick);

    expect(onStageClick).not.toHaveBeenCalled();
    stage.remove();
    panel.remove();
  });
});
