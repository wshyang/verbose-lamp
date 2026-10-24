import { useCallback, useState } from 'react';

/**
 * Shared add/edit form state for the superadmin config tables (S37–S46).
 *
 * One editor per table: `editingId` is null while the form is an "add" form and holds the row
 * id while it is an "edit" form, so a single form element serves both (fds.md §8.2).
 */
export function useDraftEditor<TDraft>(empty: TDraft, reload: () => void) {
  const [draft, setDraft] = useState<TDraft>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  const clear = useCallback(() => {
    setDraft(empty);
    setEditingId(null);
  }, [empty]);

  return {
    draft,
    setDraft,
    editingId,
    beginEdit: (id: string, next: TDraft) => {
      setEditingId(id);
      setDraft(next);
    },
    cancelEdit: clear,
    reset: useCallback(() => {
      clear();
      reload();
    }, [clear, reload]),
  };
}
