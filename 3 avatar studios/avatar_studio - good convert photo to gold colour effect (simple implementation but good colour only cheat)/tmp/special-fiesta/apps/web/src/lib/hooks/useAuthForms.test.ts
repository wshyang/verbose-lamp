import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { CLUSTER_CODES, messages } from '@psd/contracts';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { participantFixture } from '../../test-utils/fixtures.js';
import {
  signUpFocusId,
  signUpHint,
  useParticipantSignIn,
  useSignUpForm,
  useStaffSignIn,
  validateSignUp,
} from './useAuthForms.js';

let stub: FetchStub;
afterEach(() => stub?.restore());

const VALID = {
  nickname: 'BeachBoss',
  pin: '4821',
  clusterCode: 'BP' as const,
  gender: 'female' as const,
  avatarVariant: 3,
    avatarLook: '3-1-2-1-1-1',
    avatarPhoto: null,
};

describe('validateSignUp', () => {
  it('asks for the cluster, gender and avatar in order', () => {
    expect(validateSignUp({ ...VALID, clusterCode: '' })?.message).toBe(messages.clusterRequired);
    expect(validateSignUp({ ...VALID, gender: '' })?.message).toBe(messages.genderRequired);
    expect(validateSignUp({ ...VALID, avatarVariant: null })?.message).toBe(messages.avatarRequired);
  });

  it('applies the contract rules for nickname and PIN', () => {
    expect(validateSignUp({ ...VALID, nickname: 'ab' })?.message).toBe(messages.nicknameInvalid);
    expect(validateSignUp({ ...VALID, nickname: 'no spaces' })?.message).toBe(messages.nicknameInvalid);
    expect(validateSignUp({ ...VALID, pin: '12a4' })?.message).toBe(messages.pinInvalid);
    expect(validateSignUp(VALID)).toBeNull();
  });
});

describe('useSignUpForm', () => {
  it('loads clusters and posts the completed form once', async () => {
    stub = installFetchStub({
      'GET /api/clusters': { body: { items: CLUSTER_CODES.map((code) => ({ code, displayName: code })) } },
      'POST /api/auth/participants/signup': { status: 201, body: { participant: participantFixture } },
    });
    const onDone = vi.fn();
    const { result } = renderHook(() => useSignUpForm(onDone));

    await waitFor(() => expect(result.current.clusters).toHaveLength(18));

    act(() => result.current.setField('nickname', 'BeachBoss'));
    act(() => result.current.setField('pin', '4821'));
    act(() => result.current.setField('clusterCode', 'BP'));
    act(() => result.current.setField('gender', 'female'));
    act(() => result.current.setField('avatarVariant', 3));
    await act(async () => {
      await result.current.submit();
    });

    expect(stub.callsTo('POST /api/auth/participants/signup')).toHaveLength(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('sign-in forms', () => {
  it('trims the nickname and requires a 4-digit PIN before enabling submit', async () => {
    stub = installFetchStub({
      'POST /api/auth/participants/signin': { body: { participant: participantFixture } },
    });
    const { result } = renderHook(() => useParticipantSignIn(vi.fn()));

    act(() => result.current.setNickname('  BeachBoss  '));
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.setPin('4821'));
    await waitFor(() => expect(result.current.canSubmit).toBe(true));

    await act(async () => {
      await result.current.submit();
    });
    expect(stub.callsTo('POST /api/auth/participants/signin')[0]?.body).toEqual({
      nickname: 'BeachBoss',
      pin: '4821',
    });
  });

  it('routes staff sign-in to the superadmin endpoint when asked', async () => {
    stub = installFetchStub({ 'POST /api/auth/superadmins/signin': { body: { ok: true } } });
    const { result } = renderHook(() => useStaffSignIn({ isSuperadmin: true, onSignedIn: vi.fn() }));

    act(() => result.current.setUsername('superadmin'));
    act(() => result.current.setPasscode('4242'));
    await act(async () => {
      await result.current.submit();
    });

    expect(stub.callsTo('POST /api/auth/superadmins/signin')).toHaveLength(1);
  });

  it('clears a rejected passcode so the retry is four taps (ADR-027)', async () => {
    stub = installFetchStub({
      'POST /api/auth/facilitators/signin': { status: 401, body: { error: { message: 'no' } } },
    });
    const { result } = renderHook(() => useStaffSignIn({ isSuperadmin: false, onSignedIn: vi.fn() }));

    act(() => result.current.setUsername('court1'));
    act(() => result.current.setPasscode('9999'));
    let signedIn: boolean | undefined;
    await act(async () => {
      signedIn = await result.current.submit();
    });

    expect(signedIn).toBe(false);
    expect(result.current.passcode).toBe('');
  });
});

describe('sign-up field guidance (ADR-027)', () => {
  const valid = {
    nickname: 'BeachBoss',
    pin: '4821',
    clusterCode: 'ITC' as const,
    gender: 'female' as const,
    avatarVariant: 2,
    avatarLook: '3-1-2-1-1-1',
    avatarPhoto: null,
  };

  it('names the field to put the caret in, and falls back to the nickname', () => {
    expect(signUpFocusId('clusterCode')).toBe('signup-cluster');
    expect(signUpFocusId('avatarVariant')).toBe('signup-avatar');
    // A field the form does not own — a look code the server disliked, say.
    expect(signUpFocusId('avatarLook')).toBe('signup-nickname');
  });

  it('tells the three identical-looking nickname failures apart', () => {
    expect(signUpHint({ field: 'pin', isServerError: false, nickname: 'Jo' })).toBeNull();
    expect(signUpHint({ field: 'nickname', isServerError: false, nickname: 'Jo' }))
      .toBe('Three characters or more, please.');
    expect(signUpHint({ field: 'nickname', isServerError: false, nickname: 'Beach Boss' }))
      .toBe('Letters, numbers and underscore only.');
    expect(signUpHint({ field: 'nickname', isServerError: true, nickname: 'Amira' }))
      .toBe('"Amira" is taken. Try Amira_2.');
  });

  it('checks the fields in reading order and reports what is left over', () => {
    expect(validateSignUp({ ...valid, nickname: '', clusterCode: '' })?.field).toBe('nickname');
    expect(validateSignUp({ ...valid, pin: '1', clusterCode: '' })?.field).toBe('pin');
    expect(validateSignUp({ ...valid, clusterCode: '' })?.field).toBe('clusterCode');
    expect(validateSignUp({ ...valid, gender: '' })?.field).toBe('gender');
    expect(validateSignUp({ ...valid, avatarVariant: null })?.field).toBe('avatarVariant');
    // A field the participant cannot reach still has to surface rather than pass.
    expect(validateSignUp({ ...valid, avatarLook: 'nonsense' })?.field).toBe('avatarLook');
    expect(validateSignUp(valid)).toBeNull();
  });
});
