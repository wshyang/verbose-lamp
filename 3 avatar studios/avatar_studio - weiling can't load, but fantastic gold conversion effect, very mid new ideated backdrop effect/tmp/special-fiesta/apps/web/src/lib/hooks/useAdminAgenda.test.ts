import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import type { AgendaItemRequest, AgendaItemView } from '@psd/contracts';
import { useAdminAgenda } from './useAdminAgenda.js';

/**
 * ADR-177 — the run-sheet editor's one piece of real logic: a `<input type="time">` produces
 * `HH:MM` and the route wants an instant, so the hook has to supply a date. These tests pin the
 * rule it supplies it by, because getting it wrong would put the whole programme on the wrong day
 * and the form would still look perfectly correct.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

function item(overrides: Partial<AgendaItemView> = {}): AgendaItemView {
  return {
    id: 'ag-1',
    startsAt: '2026-11-05T06:30:00.000Z',
    endsAt: '2026-11-05T08:30:00.000Z',
    title: "Captain's Ball",
    location: 'Courts 1-3',
    detail: null,
    isActive: true,
    ...overrides,
  };
}

function mount(items: AgendaItemView[]) {
  stub = installFetchStub({
    'GET /api/admin/agenda': { body: { items } },
    'POST /api/admin/agenda': { body: { item: item({ id: 'ag-new' }) } },
    'PATCH /api/admin/agenda/ag-1': { body: { item: item() } },
    'PATCH /api/admin/agenda/ag-1/active': { body: { item: item({ isActive: false }) } },
  });
  return renderHook(() => useAdminAgenda());
}

function bodyOf(call: { body?: unknown }): Partial<AgendaItemRequest> {
  return call.body as Partial<AgendaItemRequest>;
}

describe('useAdminAgenda', () => {
  it('sends the date the user typed, not a day inferred from the rest of the programme', async () => {
    /*
     * ADR-186 regression. The draft below is dated DELIBERATELY unlike the item already on the
     * programme and unlike today: the old hook would have thrown both the typed date and the
     * programme's day away and grafted 17:10 onto whichever day it had inferred, which is how a
     * saved time came to depend on when it was saved.
     */
    const { result } = mount([item()]);
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() =>
      result.current.setDraft((draft) => ({
        ...draft,
        title: 'Prize presentation',
        startAt: '2027-03-09T17:10',
      })),
    );
    await act(async () => {
      await result.current.submitDraft();
    });

    const post = stub.calls.find((call) => call.method === 'POST');
    const startsAt = new Date(bodyOf(post!).startsAt!);
    expect(startsAt.getFullYear()).toBe(2027);
    expect(startsAt.getMonth()).toBe(2);
    expect(startsAt.getDate()).toBe(9);
    expect(startsAt.getHours()).toBe(17);
    expect(startsAt.getMinutes()).toBe(10);
  });

  it('sends a null start for an item with no fixed time, rather than inventing midnight', async () => {
    const { result } = mount([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() =>
      result.current.setDraft((draft) => ({
        ...draft,
        title: 'Before departure: have an early lunch',
      })),
    );
    await act(async () => {
      await result.current.submitDraft();
    });

    const post = stub.calls.find((call) => call.method === 'POST');
    expect(bodyOf(post!).startsAt).toBeNull();
    expect(bodyOf(post!).endsAt).toBeNull();
  });

  it('sends an emptied optional field as null, because omission would leave it standing', async () => {
    const { result } = mount([item()]);
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.beginEdit('ag-1'));
    expect(result.current.draft.location).toBe('Courts 1-3');

    act(() => result.current.setDraft((draft) => ({ ...draft, location: '' })));
    await act(async () => {
      await result.current.submitDraft();
    });

    const patch = stub.calls.find((call) => call.path === '/api/admin/agenda/ag-1');
    expect(bodyOf(patch!).location).toBeNull();
  });

  it('loads an existing item back into the form as a local date and time', async () => {
    const { result } = mount([item()]);
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.beginEdit('ag-1'));
    expect(result.current.draft.startAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(result.current.draft.title).toBe("Captain's Ball");
    expect(result.current.editingId).toBe('ag-1');
  });

  it('ignores a datetime string the browser could not have produced', async () => {
    const { result } = mount([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Belt and braces: a datetime-local input cannot emit this, but the guard is cheap and the
    // alternative is an Invalid Date reaching the route as the string "Invalid Date".
    act(() =>
      result.current.setDraft((draft) => ({ ...draft, title: 'Mystery', startAt: 'half two' })),
    );
    await act(async () => {
      await result.current.submitDraft();
    });

    const post = stub.calls.find((call) => call.method === 'POST');
    expect(bodyOf(post!).startsAt).toBeNull();
  });

  it('loads a moment and a locationless item back into an empty-boxed form', async () => {
    const { result } = mount([item({ endsAt: null, location: null })]);
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.beginEdit('ag-1'));
    expect(result.current.draft.endAt).toBe('');
    expect(result.current.draft.location).toBe('');
  });

  it('cancels an item by toggling it off — there is no delete to reach for', async () => {
    const { result } = mount([item()]);
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.setActive({ itemId: 'ag-1', isEnabled: false }));
    await waitFor(() =>
      expect(stub.calls.some((call) => call.path === '/api/admin/agenda/ag-1/active')).toBe(true),
    );
    expect(stub.calls.every((call) => call.method !== 'DELETE')).toBe(true);
  });
});
