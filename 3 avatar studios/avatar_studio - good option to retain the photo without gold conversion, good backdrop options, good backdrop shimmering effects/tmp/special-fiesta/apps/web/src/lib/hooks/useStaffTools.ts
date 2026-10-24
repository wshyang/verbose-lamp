import { useCallback, useMemo, useState } from "react";
import { PIN_PATTERN, messages } from "@psd/contracts";
import type { ParticipantView } from "@psd/contracts";
import {
  fetchActivities,
  fetchCourts,
  fetchDumbStatus,
  findParticipantByNickname,
  resetParticipantPin,
  searchStaffParticipants,
} from "../api/stations.js";
import { createAdjustment } from "../api/admin.js";
import { fetchSwagStations } from "../api/swag.js";
import { useAction } from "./useAction.js";
import { useAsyncData } from "./useAsyncData.js";

/** S19/S20 station picker and S33 participant PIN reset. */

export interface StationOption {
  /** ADR-321 — 'dumb_court' while dumb courts operate: the court awards points, no matches. */
  kind: "court" | "dumb_court" | "fringe_activity" | "swag_station";
  id: string;
  label: string;
  detail: string;
  isEnabled: boolean;
}

export function useStationPicker() {
  const dumb = useAsyncData(useCallback(() => fetchDumbStatus(), []));
  const courts = useAsyncData(useCallback(() => fetchCourts(), []));
  const activities = useAsyncData(useCallback(() => fetchActivities(), []));
  const swag = useAsyncData(useCallback(() => fetchSwagStations(), []));

  const stations = useMemo<StationOption[]>(() => {
    const dumbActive = dumb.data?.active ?? false;
    // ADR-336 §6.1 — the rule is per court, not per venue. During the drain the mode says "awarding"
    // for the whole room, but a court with a match still on it keeps its match page until that match
    // is closed: paying a team mid-match would pay it twice for the same minutes.
    const courtOptions: StationOption[] = (courts.data?.items ?? []).map(
      (court) => {
        const isAwarding = dumbActive && court.currentMatchId === null;
        return {
          kind: isAwarding ? "dumb_court" : "court",
          id: court.id,
          label: court.displayLabel,
          detail: isAwarding
            ? "Awarding points"
            : court.currentMatchId
              ? "Match in progress"
              : "Idle",
          isEnabled: court.isEnabled,
        };
      },
    );
    const activityOptions: StationOption[] = (activities.data?.items ?? []).map(
      (activity) => ({
        kind: "fringe_activity",
        id: activity.id,
        label: activity.activityName,
        detail: activity.currentRound
          ? `Round ${activity.currentRound.roundNumber} · ${activity.currentRound.status}`
          : "No round open",
        isEnabled: activity.isActive,
      }),
    );
    // ADR-110 — swag counters pick like any other station.
    const swagOptions: StationOption[] = (swag.data?.items ?? []).map(
      (station) => ({
        kind: "swag_station",
        id: station.id,
        label: station.stationName,
        detail: station.currentRound
          ? `Round ${station.currentRound.roundNumber} · ${station.currentRound.status}`
          : "No round open",
        isEnabled: station.isActive,
      }),
    );
    return [...courtOptions, ...activityOptions, ...swagOptions];
  }, [dumb.data, courts.data, activities.data, swag.data]);

  return {
    stations,
    isLoading: courts.isLoading || activities.isLoading || swag.isLoading,
    error: courts.error ?? activities.error ?? swag.error,
  };
}

/**
 * S33 looks the participant up by nickname; S53 already has them on screen and passes them in,
 * so the console never re-queries a participant it is already displaying.
 */
export function usePinReset(known?: { id: string; nickname: string }) {
  const [nickname, setNickname] = useState("");
  const [newPin, setNewPin] = useState("");
  const [participant, setParticipant] = useState<ParticipantView | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const lookup = useAction(findParticipantByNickname, (result) => {
    setParticipant(result.participant);
    setConfirmation(null);
  });
  const target = participant
    ? { id: participant.id, nickname: participant.nickname }
    : (known ?? null);
  const reset = useAction(resetParticipantPin, (result) => {
    setConfirmation(`PIN reset for ${result.participant.nickname}.`);
    setNewPin("");
  });

  const findParticipant = useCallback(async () => {
    setLocalError(null);
    setParticipant(null);
    await lookup.run(nickname.trim());
  }, [lookup, nickname]);

  // ADR-101 — a tapped suggestion already carries the whole participant, so choosing one
  // needs no second round-trip through the by-nickname lookup.
  const choose = useCallback((picked: ParticipantView) => {
    setNickname(picked.nickname);
    setParticipant(picked);
    setConfirmation(null);
    setLocalError(null);
  }, []);

  const targetId = target?.id ?? null;
  const submitReset = useCallback(async () => {
    if (!targetId) return;
    if (!PIN_PATTERN.test(newPin)) {
      setLocalError(messages.pinInvalid);
      return;
    }
    setLocalError(null);
    await reset.run({ participantId: targetId, pin: newPin });
  }, [newPin, reset, targetId]);

  return {
    nickname,
    setNickname,
    newPin,
    setNewPin,
    participant,
    findParticipant,
    choose,
    submitReset,
    confirmation,
    isBusy: lookup.isPending || reset.isPending,
    error: localError ?? lookup.error ?? reset.error,
  };
}

/** ADR-101 — type two characters before the directory is asked anything. */
const SUGGEST_MIN_CHARS = 2;
/** Enough rows to disambiguate without burying the keyboard under a wall of names. */
const SUGGEST_MAX_ROWS = 6;

export interface ParticipantSuggestion {
  participant: ParticipantView;
  teamName: string | null;
}

/**
 * ADR-101 — live nickname suggestions for the PIN-reset lookup. Server-side substring
 * search (the same staff directory read S56 uses), so the facilitator taps a big row
 * instead of spelling a nickname perfectly under glare.
 */
export function useParticipantSuggestions(query: string) {
  const trimmed = query.trim();
  const isActive = trimmed.length >= SUGGEST_MIN_CHARS;
  const state = useAsyncData(
    useCallback(
      () =>
        isActive
          ? searchStaffParticipants(trimmed)
          : Promise.resolve({ items: [] }),
      [isActive, trimmed],
    ),
  );
  const items: ParticipantSuggestion[] = (state.data?.items ?? []).slice(
    0,
    SUGGEST_MAX_ROWS,
  );
  return { items, isActive };
}

/**
 * ADR-117 — the manual correction form on S53.
 *
 * The points field is text, not a number input: a correction is frequently negative, and
 * number inputs make a leading minus awkward to type on a phone keypad. The value is parsed
 * on submit and the server is the authority on what is in range.
 */
export function useScoreAdjustment(input: {
  participantId: string;
  onApplied: () => void;
}) {
  const { participantId, onApplied } = input;
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [activityId, setActivityId] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const apply = useAction(createAdjustment, (result) => {
    const sign = result.adjustment.points > 0 ? "+" : "";
    setConfirmation(
      `${sign}${result.adjustment.points} on ${result.adjustment.activityName}, recorded.`,
    );
    setPoints("");
    setReason("");
    onApplied();
  });

  const submit = useCallback(async () => {
    setConfirmation(null);
    await apply.run({
      participantId,
      activityId,
      points: Number(points),
      reason: reason.trim(),
    });
  }, [apply, participantId, activityId, points, reason]);

  return {
    points,
    setPoints,
    reason,
    setReason,
    activityId,
    setActivityId,
    submit,
    confirmation,
    isSaving: apply.isPending,
    error: apply.error,
  };
}
