import { useCallback, useState } from 'react';
import type { SwagStationView } from '@psd/contracts';
import {
  createSwagStation,
  fetchAdminSwagStations,
  toggleSwagStationActive,
  updateSwagStation,
} from '../api/swag.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData } from './useAsyncData.js';

/**
 * ADR-110/188 — swag station administration: create, list, toggle, and now EDIT.
 *
 * The edit reuses the create form rather than growing a second one inline on each row. A
 * station is a name and up to six items, which is exactly what the create form already
 * collects; two copies of that would be two places for the limit-is-a-string handling to
 * drift. The list's Edit button therefore loads a station INTO the form and the submit
 * button changes what it is called.
 */

export interface SwagItemDraft {
  label: string;
  limit: string;
}

const BLANK_ITEMS: SwagItemDraft[] = [{ label: '', limit: '1' }];

/** Name and items, plus the station being edited — the form's whole state. */
function useStationDraft() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stationName, setStationName] = useState('');
  const [items, setItems] = useState<SwagItemDraft[]>(BLANK_ITEMS);

  const reset = useCallback(() => {
    setEditingId(null);
    setStationName('');
    setItems(BLANK_ITEMS);
  }, []);

  const beginEdit = useCallback((station: SwagStationView) => {
    setEditingId(station.id);
    setStationName(station.stationName);
    setItems(station.items.map((item) => ({ label: item.label, limit: String(item.limit) })));
  }, []);

  return { editingId, stationName, setStationName, items, setItems, reset, beginEdit };
}

export function useAdminSwagStations() {
  const state = useAsyncData(useCallback(() => fetchAdminSwagStations(), []));
  const draft = useStationDraft();
  const reload = state.reload;
  const { reset } = draft;

  const done = useCallback(() => {
    reset();
    reload();
  }, [reload, reset]);

  const create = useAction(createSwagStation, done);
  const update = useAction(updateSwagStation, done);
  const toggle = useAction(toggleSwagStationActive, reload);

  const { editingId, stationName, items, setItems } = draft;
  const submit = useCallback(async () => {
    const body = {
      stationName: stationName.trim(),
      items: items.map((item) => ({ label: item.label.trim(), limit: Number(item.limit) })),
    };
    if (!editingId) {
      await create.run(body);
      return;
    }
    await update.run({ stationId: editingId, ...body });
  }, [create, editingId, items, stationName, update]);

  return {
    stations: state.data?.items ?? [],
    editingId,
    stationName,
    setStationName: draft.setStationName,
    beginEdit: draft.beginEdit,
    cancelEdit: reset,
    items,
    setItem: (index: number, item: SwagItemDraft) =>
      setItems((current) => current.map((entry, at) => (at === index ? item : entry))),
    addItem: () => setItems((current) => [...current, { label: '', limit: '1' }]),
    removeItem: (index: number) => setItems((current) => current.filter((_, at) => at !== index)),
    submit,
    toggleActive: (stationId: string) => void toggle.run(stationId),
    isSaving: create.isPending || update.isPending,
    isLoading: state.isLoading,
    error: firstError([create.error, update.error, toggle.error, state.error]),
  };
}
