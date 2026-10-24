import { useEffect } from 'react';

interface PremiereShortcutActions {
  isDialogOpen: boolean;
  togglePlayback: () => void;
  selectAct: (index: number) => void;
  toggleCameraMode: () => void;
  toggleHud: () => void;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

export function usePremiereShortcuts({
  isDialogOpen,
  togglePlayback,
  selectAct,
  toggleCameraMode,
  toggleHud,
}: PremiereShortcutActions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isDialogOpen || isTextEntryTarget(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (event.key >= '1' && event.key <= '5') {
        selectAct(Number(event.key) - 1);
        return;
      }
      if (event.key.toLowerCase() === 'o') toggleCameraMode();
      if (event.key.toLowerCase() === 'h') toggleHud();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDialogOpen, selectAct, toggleCameraMode, toggleHud, togglePlayback]);
}