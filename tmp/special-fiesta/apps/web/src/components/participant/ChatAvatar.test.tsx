import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ParticipantIdentityView } from '@psd/contracts';
import { installFetchStub, expectNoUnstubbedCalls, type FetchStub } from '../../test-utils/fetchStub.js';
import { PeopleProvider } from './PeopleProvider.js';
import { ChatAvatar } from './ChatAvatar.js';

/**
 * ADR-202 — the face beside a name in a chat room.
 *
 * The room has carried `authorParticipantId` since ADR-046 on the stated grounds that avatars
 * resolve client-side; these are the tests for the resolving. Only `fetch` is stubbed — the
 * provider, the store, the api layer, `AvatarPeek` and `Avatar` underneath it are all real, so
 * a change that breaks the peek a roster depends on breaks this file too.
 */

const IDENTITIES = '/api/participants/identities';
let stub: FetchStub;

function person(over?: Partial<ParticipantIdentityView>): ParticipantIdentityView {
  return {
    participantId: 'p1',
    nickname: 'BeachBoss',
    clusterCode: 'CS',
    gender: 'female',
    avatarVariant: 2,
    avatarLook: '4-2-3-1-5-2',
    avatarPhotoId: null,
    title: 'Radiant',
    ...over,
  };
}

function mount(ui: React.ReactElement) {
  return render(<PeopleProvider>{ui}</PeopleProvider>);
}

beforeEach(() => {
  stub = installFetchStub({
    [`GET ${IDENTITIES}`]: { body: { items: [person(), person({ participantId: 'p2', nickname: 'NetNinja', title: 'Tireless' })] } },
  });
});

afterEach(() => {
  expectNoUnstubbedCalls(stub);
  stub.restore();
});

describe('ChatAvatar', () => {
  it('draws the speaker, and opens the same peek card the team roster uses', async () => {
    const user = userEvent.setup();
    mount(<ChatAvatar participantId="p1" />);

    await waitFor(() => expect(screen.getByTestId('chat-avatar')).toBeInTheDocument());
    // The trigger is AvatarPeek's own, not a chat-flavoured copy of it: hover-to-peek on a
    // mouse and tap-to-peek on a finger are decided in one place for every surface.
    await user.click(screen.getByTestId('avatar-peek__open'));
    expect(screen.getByTestId('avatar-peek__nickname')).toHaveTextContent('BeachBoss');
    expect(screen.getByTestId('avatar-peek__title')).toHaveTextContent('Radiant');
    expect(screen.getByTestId('avatar-peek__cluster')).toHaveTextContent('CS');
  });

  /**
   * The decision this component exists to carry out. Organisers are in the room but are not
   * participants, so there is no face to show and inventing one would be a lie about who is
   * speaking — but the slot still has to hold its width.
   */
  it('marks a staff line rather than inventing a face for it, and asks nobody about it', async () => {
    mount(<ChatAvatar participantId={null} />);

    expect(screen.getByTestId('chat-avatar__staff')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-peek__open')).not.toBeInTheDocument();
    // A null author is not an unknown author: there is nothing to look up.
    expect(stub.calls).toHaveLength(0);
  });

  /**
   * ADR-046's actual argument, as an assertion. The id was chosen over the body so that a
   * busy room does not carry the same avatar three hundred times; this is what "does not"
   * means — forty people talking is forty rows on the wire however much they talk.
   */
  it('resolves a person once however many times they speak', async () => {
    mount(
      <>
        <ChatAvatar participantId="p1" />
        <ChatAvatar participantId="p1" />
        <ChatAvatar participantId="p2" />
      </>,
    );

    await waitFor(() => expect(screen.getAllByTestId('chat-avatar')).toHaveLength(3));
    // One request, carrying each id exactly once — not one request per line, and not one
    // request per person either: everything asked for on a tick goes in the same batch.
    expect(stub.calls).toHaveLength(1);
    const asked = new URL(`http://x${stub.calls[0]?.path ?? ''}`).searchParams.get('ids');
    expect(asked?.split(',').sort()).toEqual(['p1', 'p2']);
  });

  /**
   * The failure that must stay quiet. A directory that cannot place somebody is a missing
   * face, never a missing message — and the row must stop asking, or a person the server
   * will never return becomes a request on every render for as long as the room is open.
   */
  it('holds the slot and gives up quietly when nobody comes back', async () => {
    const { rerender } = mount(<ChatAvatar participantId="ghost" />);

    await waitFor(() => expect(stub.calls).toHaveLength(1));
    rerender(
      <PeopleProvider>
        <ChatAvatar participantId="ghost" />
      </PeopleProvider>,
    );

    expect(screen.getByTestId('chat-avatar__pending')).toBeInTheDocument();
    expect(stub.calls).toHaveLength(1);
  });
});
