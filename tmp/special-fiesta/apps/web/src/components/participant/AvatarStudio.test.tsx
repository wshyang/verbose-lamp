import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AVATAR_PERSONA_PRESETS,
  AVATAR_SPRITE_SIZE,
  DEFAULT_AVATAR_LOOK,
  formatAvatarLook,
  formatAvatarSprite,
  parseAvatarSprite,
  readAvatarLook,
} from '@psd/contracts';
import { AvatarStudio, type AvatarDraft } from './AvatarStudio.js';

/*
 * ADR-227 — removing a photo needs no character first, and the removal waits for the save.
 *
 * These drive the studio as its parents do: a controlled draft, with every change it makes recorded.
 * The photo is a plain sprite (no canvas, no model), so this file tests the rules, not the cut-out.
 */

const PHOTO_PALETTE_BACKDROP = 3;

/** A sprite shaped like the one `photoToSprite` emits: three photo colours, the backdrop, the ink. */
function photoSprite(backdropHex: string): string {
  const rows = Array.from({ length: AVATAR_SPRITE_SIZE }, (_row, y) =>
    (y < AVATAR_SPRITE_SIZE / 2 ? '0' : String(PHOTO_PALETTE_BACKDROP)).repeat(AVATAR_SPRITE_SIZE),
  );
  return formatAvatarSprite({
    size: AVATAR_SPRITE_SIZE,
    palette: ['112233', '445566', '778899', backdropHex.slice(1), '000000'],
    rows,
  });
}

function draftWith(variant: number, photo: string | null): AvatarDraft {
  const backdrop = AVATAR_PERSONA_PRESETS[variant - 1]?.backdrop ?? DEFAULT_AVATAR_LOOK.backdrop;
  return {
    avatarVariant: variant,
    avatarLook: formatAvatarLook({ ...DEFAULT_AVATAR_LOOK, backdrop }),
    avatarPhoto: photo,
  };
}

interface Harness {
  drafts: AvatarDraft[];
  latest: () => AvatarDraft;
}

function renderStudio(initial: AvatarDraft): Harness {
  const drafts: AvatarDraft[] = [];
  function Host() {
    const [draft, setDraft] = useState(initial);
    return (
      <AvatarStudio
        gender="female"
        draft={draft}
        personaTestId="studio__persona"
        onChange={(next) => {
          drafts.push(next);
          setDraft(next);
        }}
      />
    );
  }
  render(<Host />);
  return {
    drafts,
    latest: () => {
      const last = drafts[drafts.length - 1];
      if (last === undefined) throw new Error('the studio has not reported a change yet');
      return last;
    },
  };
}

describe('AvatarStudio — removing a photo (ADR-227)', () => {
  it('lets the photo go with no character picked, and moves the selection to the next one', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(1, photoSprite(AVATAR_PERSONA_PRESETS[0]?.backdrop ?? '#000000')));

    const remove = screen.getByTestId('avatar-studio__photo-clear');
    expect(remove).toBeEnabled();

    await user.click(remove);

    expect(harness.latest()).toMatchObject({ avatarPhoto: null, avatarVariant: 2 });
    // The photo is still on the row, unselected, so the participant can change their mind.
    expect(screen.getByTestId('avatar-studio__photo-option')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('avatar-studio__photo-state')).toHaveTextContent(
      'Your photo will be removed when you save',
    );
    // The character it moved to is the one selected.
    const characters = screen.getAllByTestId('studio__persona');
    expect(characters[1]).toHaveAttribute('aria-pressed', 'true');
    expect(characters[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('wraps from the last character back to the first', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(5, photoSprite('#123456')));

    await user.click(screen.getByTestId('avatar-studio__photo-clear'));

    expect(harness.latest()).toMatchObject({ avatarPhoto: null, avatarVariant: 1 });
  });

  it('brings the held picture back when "My photo" is pressed, and keeps the character', async () => {
    const user = userEvent.setup();
    const picture = photoSprite('#123456');
    const harness = renderStudio(draftWith(2, picture));

    await user.click(screen.getByTestId('avatar-studio__photo-clear'));
    await user.click(screen.getByTestId('avatar-studio__photo-option'));

    const restored = harness.latest();
    expect(restored.avatarPhoto).toEqual(expect.any(String));
    expect(restored.avatarVariant).toBe(3);
    expect(screen.getByTestId('avatar-studio__photo-option')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('avatar-studio__photo-clear')).toBeEnabled();
  });

  it('does not treat choosing a character as removal: the worn photo stays on', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(1, photoSprite('#123456')));

    await user.click(screen.getAllByTestId('studio__persona')[3] as HTMLElement);

    expect(harness.latest().avatarPhoto).not.toBeNull();
    expect(harness.latest().avatarVariant).toBe(4);
    expect(screen.getByTestId('avatar-studio__photo-option')).toHaveAttribute('aria-pressed', 'false');
  });

  it('wears the new character\'s backdrop on a worn photo, in the same change (F4)', async () => {
    const user = userEvent.setup();
    const before = photoSprite(AVATAR_PERSONA_PRESETS[0]?.backdrop ?? '#000000');
    const harness = renderStudio(draftWith(1, before));

    await user.click(screen.getAllByTestId('studio__persona')[2] as HTMLElement);

    const after = harness.latest().avatarPhoto;
    const target = AVATAR_PERSONA_PRESETS[2]?.backdrop;
    expect(after).not.toBe(before);
    expect(parseAvatarSprite(String(after))?.palette[PHOTO_PALETTE_BACKDROP]).toBe(target);
    expect(readAvatarLook(harness.latest().avatarLook).backdrop).toBe(AVATAR_PERSONA_PRESETS[2]?.backdrop);
  });

  it('brings the held picture back in the backdrop chosen while it was away (F4)', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(1, photoSprite(AVATAR_PERSONA_PRESETS[0]?.backdrop ?? '#000000')));

    await user.click(screen.getByTestId('avatar-studio__photo-clear'));
    await user.click(screen.getAllByTestId('studio__persona')[3] as HTMLElement);
    await user.click(screen.getByTestId('avatar-studio__photo-option'));

    const target = AVATAR_PERSONA_PRESETS[3]?.backdrop;
    expect(parseAvatarSprite(String(harness.latest().avatarPhoto))?.palette[PHOTO_PALETTE_BACKDROP]).toBe(
      target,
    );
  });
});

describe('AvatarStudio — the customise toggle names what is behind it (ADR-232, F13)', () => {
  it('names build for everyone, and beard for a man only', () => {
    const plain = { ...draftWith(1, null) };
    render(<AvatarStudio gender="male" draft={plain} personaTestId="studio__persona" onChange={() => undefined} />);
    expect(screen.getByTestId('avatar-studio__toggle')).toHaveTextContent(
      'Customise hair, build, beard, skin and colours',
    );
  });

  it('leaves beard out for a woman, and still names build', () => {
    render(
      <AvatarStudio
        gender="female"
        draft={draftWith(1, null)}
        personaTestId="studio__persona"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByTestId('avatar-studio__toggle')).toHaveTextContent(
      'Customise hair, build, skin and colours',
    );
  });
});

describe('AvatarStudio — the photo dialog and the names of colours (ADR-229, ADR-232)', () => {
  it('opens the selfie camera inside the dialog, and Cancel closes it without a photo', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(1, null));

    await user.click(screen.getByTestId('avatar-studio__selfie-open'));
    expect(screen.getByTestId('photo-dialog')).toBeVisible();
    expect(screen.getByTestId('avatar-studio__selfie')).toBeVisible();

    await user.click(screen.getByTestId('avatar-studio__selfie-cancel'));
    expect(screen.queryByTestId('photo-dialog')).toBeNull();
    expect(harness.drafts).toHaveLength(0);
  });

  it('names a backdrop colour that is not in the palette, rather than writing its hex (ADR-232, F8)', () => {
    const look = formatAvatarLook({
      ...DEFAULT_AVATAR_LOOK,
      backdrop: '#abcdef',
      sunburst: { kind: 'spiral', colourTwo: '#f7d154', rays: 12, twist: 4, bands: 2 },
    });
    renderStudio({ avatarVariant: 1, avatarLook: look, avatarPhoto: photoSprite('#abcdef') });

    expect(screen.getByTestId('avatar-studio__sunburst-first')).toHaveTextContent('a custom colour');
    expect(screen.getByTestId('avatar-studio__sunburst-first')).not.toHaveTextContent('#ABCDEF');
  });
});

describe('AvatarStudio — a photo that cannot be recoloured is kept as it is (F4)', () => {
  // A stale or damaged photo. The server never sends one, but the studio must not drop it on a colour change.
  const UNREADABLE = 'not a sprite';

  it('keeps the photo when a backdrop colour is picked', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(1, UNREADABLE));

    await user.click(screen.getByRole('button', { name: 'Backdrop: Crimson' }));

    expect(harness.latest().avatarPhoto).toBe(UNREADABLE);
  });

  it('keeps the photo when a character with another backdrop is chosen', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(1, UNREADABLE));

    await user.click(screen.getAllByTestId('studio__persona')[2] as HTMLElement);

    expect(harness.latest()).toMatchObject({ avatarVariant: 3, avatarPhoto: UNREADABLE });
  });

  it('brings back a held photo as it is when it cannot be recoloured', async () => {
    const user = userEvent.setup();
    const harness = renderStudio(draftWith(2, UNREADABLE));

    await user.click(screen.getByTestId('avatar-studio__photo-clear'));
    await user.click(screen.getByTestId('avatar-studio__photo-option'));

    expect(harness.latest().avatarPhoto).toBe(UNREADABLE);
  });
});

