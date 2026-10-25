import type { MouseEvent } from 'react';

/**
 * The console and the draw dialog are portalled out of the stage, but React events still bubble to
 * it through the React tree. Only a click whose target is in the DOM under the stage is the stage's.
 */
export function forwardStageClick(
  event: Pick<MouseEvent<HTMLElement>, 'currentTarget' | 'target' | 'clientX' | 'clientY'>,
  onStageClick: (clientX: number, clientY: number) => void
): void {
  if (event.currentTarget.contains(event.target as Node)) onStageClick(event.clientX, event.clientY);
}
