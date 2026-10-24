import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_AVATAR_LOOK_CODE, messages, signUpRequestSchema } from '@psd/contracts';
import type { ClusterCode, Gender, SignUpRequest } from '@psd/contracts';
import {
  fetchClusters,
  signInFacilitator,
  signInParticipant,
  signInSuperadmin,
  signUp,
} from '../api/participants.js';
import { required } from '../required.js';
import { useSession } from '../session/context.js';
import { useAction } from './useAction.js';
import { useAsyncData } from './useAsyncData.js';

/** S1 sign-up, S2 participant sign-in, S18/S34 staff sign-in. */

export interface SignUpFields {
  nickname: string;
  pin: string;
  clusterCode: ClusterCode | '';
  gender: Gender | '';
  avatarVariant: number | null;
  avatarLook: string;
  /** ADR-031 — a sprite made from their own photo, or null for one of the characters. */
  avatarPhoto: string | null;
}

const EMPTY_SIGN_UP: SignUpFields = {
  nickname: '',
  pin: '',
  clusterCode: '',
  gender: '',
  // ADR-231 — Skipper (variant 1) is the real default, in state as well as on screen, so the form sends it.
  avatarVariant: 1,
  avatarLook: DEFAULT_AVATAR_LOOK_CODE,
  avatarPhoto: null,
};

/** Where the caret goes when a field is rejected. */
const SIGN_UP_FIELD_IDS: Record<string, string> = {
  nickname: 'signup-nickname',
  pin: 'signup-pin',
  clusterCode: 'signup-cluster',
  gender: 'signup-gender',
  avatarVariant: 'signup-avatar',
};

export function signUpFocusId(field: string): string {
  return SIGN_UP_FIELD_IDS[field] ?? required(SIGN_UP_FIELD_IDS['nickname'], 'nickname field id');
}

/**
 * Client-side validation reuses the server's zod schema, so the participant sees the exact
 * message fds.md §2.1 specifies instead of a second, drifting copy of the rule.
 *
 * ADR-027 — the fields are checked in *reading order*. Checking in schema order meant an
 * empty form complained about the cluster, three fields below where the eye starts, and
 * the participant fixed things in an order the form had chosen for them.
 */
export function validateSignUp(fields: SignUpFields): { field: string; message: string } | null {
  const parsed = signUpRequestSchema.safeParse({
    nickname: fields['nickname'],
    pin: fields.pin,
    clusterCode: fields.clusterCode,
    gender: fields.gender,
    avatarVariant: fields.avatarVariant,
    avatarLook: fields.avatarLook,
  } satisfies Record<string, unknown>);
  const issues = parsed.success ? [] : parsed.error.issues;
  const schemaIssue = (field: string) => issues.find((issue) => String(issue.path[0]) === field);
  const nickname = schemaIssue('nickname');
  if (nickname) return { field: 'nickname', message: nickname.message };
  const pin = schemaIssue('pin');
  if (pin) return { field: 'pin', message: pin.message };
  if (!fields.clusterCode) return { field: 'clusterCode', message: messages.clusterRequired };
  if (!fields.gender) return { field: 'gender', message: messages.genderRequired };
  if (fields.avatarVariant === null) return { field: 'avatarVariant', message: messages.avatarRequired };
  // Anything left is a field the participant cannot reach — the look code, say.
  const remaining = issues[0];
  if (remaining) return { field: String(remaining.path[0]), message: remaining.message };
  return null;
}

export function useSignUpForm(onSignedUp: () => void) {
  const [fields, setFields] = useState<SignUpFields>(EMPTY_SIGN_UP);
  const [localError, setLocalError] = useState<{ field: string; message: string } | null>(null);
  const clusters = useAsyncData(useCallback(() => fetchClusters(), []));
  const action = useAction(signUp, onSignedUp);

  const setField = useCallback(<K extends keyof SignUpFields>(key: K, value: SignUpFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setLocalError(null);
  }, []);

  /** Resolves to the id of the field to put the caret in, or null when it went through. */
  const submit = useCallback(async (): Promise<string | null> => {
    const invalid = validateSignUp(fields);
    if (invalid) {
      setLocalError(invalid);
      return signUpFocusId(invalid.field);
    }
    setLocalError(null);
    const created = await action.run(fields as unknown as SignUpRequest);
    // Everything else on this form is validated above, so a server rejection is the
    // nickname: either taken, or a race with someone else typing the same one.
    return created === null ? signUpFocusId('nickname') : null;
  }, [action, fields]);

  const error = localError?.message ?? action.error;
  const errorField = localError?.field ?? action.errorField;

  return {
    fields,
    setField,
    submit,
    error,
    errorField,
    /** A second line under the error that says what to do, not just what is wrong. */
    errorHint: signUpHint({ field: errorField, isServerError: action.error !== null, nickname: fields['nickname'] }),
    isPending: action.isPending,
    clusters: clusters.data?.items ?? [],
    isLoadingClusters: clusters.isLoading,
  };
}

/**
 * fds.md §2.1 fixes one sentence for every nickname problem — too short, bad characters,
 * already taken. That sentence stays; this adds the bit that tells three identical-looking
 * failures apart.
 */
export function signUpHint(input: {
  field: string | undefined;
  isServerError: boolean;
  nickname: string;
}): string | null {
  if (input.field !== 'nickname') return null;
  if (input.isServerError) return `"${input['nickname']}" is taken. Try ${input['nickname']}_2.`;
  if (input['nickname'].trim().length < 3) return 'Three characters or more, please.';
  return 'Letters, numbers and underscore only.';
}

/**
 * ADR-164 — `initialNickname` is how the forgotten-nickname finder hands somebody back here
 * with the name already in the field. Seeded into state rather than held as a prop, because
 * from this point on it is theirs to edit: recognising a nickname on a list is not the same as
 * being sure of it, and the PIN is what actually proves anything.
 */
export function useParticipantSignIn(onSignedIn: () => void, initialNickname = '') {
  const [nickname, setNickname] = useState(initialNickname);
  const [pin, setPin] = useState('');
  const action = useAction(signInParticipant, onSignedIn);
  const canSubmit = useMemo(() => nickname.trim().length > 0 && pin.length === 4, [nickname, pin]);

  /** True when the PIN was wrong: the page clears the field and puts the caret back. */
  /**
   * ADR-085 — the PIN may be passed in rather than read from state, and that is load-bearing rather
   * than a convenience. The fourth-digit auto-submit fires from inside the `onChange` that produced
   * that digit, so `pin` here is still the three-digit value React has not re-rendered past; without
   * the override this submitted a PIN one character short of what was typed.
   */
  const submit = useCallback(
    async (pinOverride?: string): Promise<boolean> => {
      const signedIn = await action.run({ nickname: nickname.trim(), pin: pinOverride ?? pin });
      if (signedIn === null) {
        setPin('');
        return false;
      }
      return true;
    },
    [action, nickname, pin],
  );

  return {
    nickname,
    setNickname,
    pin,
    setPin,
    submit,
    canSubmit,
    error: action.error,
    isPending: action.isPending,
  };
}

export function useStaffSignIn(input: { isSuperadmin: boolean; onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const signIn = input.isSuperadmin ? signInSuperadmin : signInFacilitator;
  const action = useAction(signIn, input.onSignedIn);
  const canSubmit = username.trim().length > 0 && passcode.length === 4;

  const submit = useCallback(async (): Promise<boolean> => {
    const signedIn = await action.run({ username: username.trim(), passcode });
    if (signedIn === null) {
      setPasscode('');
      return false;
    }
    return true;
  }, [action, username, passcode]);

  return {
    username,
    setUsername,
    passcode,
    setPasscode,
    submit,
    canSubmit,
    error: action.error,
    isPending: action.isPending,
  };
}

/**
 * The hand-off after any successful sign-in (ADR-015). It waits for the refreshed session
 * before navigating, so a participant is never sent to a guarded surface with a session the
 * browser has already thrown away — the failure mode that looks like "I signed up but it
 * won't let me in".
 */
export function useAuthHandoff(homePath: string) {
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [error, setError] = useState<string | null>(null);

  const complete = useCallback(async () => {
    const next = await refresh();
    if (!next) {
      setError(messages.sessionNotStored);
      return;
    }
    navigate(homePath, { replace: true });
  }, [homePath, navigate, refresh]);

  return { complete, error };
}
